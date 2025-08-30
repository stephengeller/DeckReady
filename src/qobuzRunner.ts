import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnStreaming } from './lib/proc';
import { readTags, normaliseTag, normaliseTitleBase } from './lib/tags';
import {
  walkFiles,
  snapshot,
  diffNew,
  diffNewAudio,
  rmIfOldTmp,
  pruneEmptyDirs,
} from './lib/fsWalk';
import { processDownloadedAudio } from './lib/organiser';

export type RunQobuzResult = {
  /** True if qobuz-dl returned success and at least one new audio file was detected. */
  ok: boolean;
  /** Files detected as newly added by the run (post-snapshot). */
  added: string[];
  /** Exact qobuz-dl command used. */
  cmd: string;
  /** Aggregated qobuz-dl stdout. */
  stdout: string;
  /** Aggregated qobuz-dl stderr. */
  stderr: string;
  /** Exit code from qobuz-dl. */
  code: number;
  /** True when invoked with dryRun (no process spawned). */
  dry?: boolean;
  /** Full per-run log path on disk, when available. */
  logPath?: string | null;
  /** Present when a wrong file was matched; used to short-circuit further candidates. */
  mismatch?: {
    artistNorm: string;
    titleNorm: string;
    artistRaw: string;
    titleRaw: string;
  } | null;
  /** True when qobuz-dl reported success but no new audio landed (already downloaded). */
  already?: boolean;
};

/**
 * Run qobuz-dl in "lucky" mode for a single query, with strict validation and logging.
 * - Detects new files by snapshotting the target directory before/after.
 * - Writes per-run logs and search-term sidecar files.
 * - Validates tags against expected artist/title; deletes wrong matches and reports a mismatch.
 */
export async function runQobuzLuckyStrict(
  query: string,
  {
    directory,
    quality = 6,
    number = 1,
    type = 'track',
    dryRun = false,
    quiet = false, // noisy by default; set true to silence
    artist,
    title,
    progress = false,
    onProgress,
  }: {
    directory?: string;
    quality?: number;
    number?: number;
    type?: string;
    dryRun?: boolean;
    quiet?: boolean;
    artist?: string;
    title?: string;
    progress?: boolean;
    onProgress?: (info: { raw: string; percent?: number; bytes?: number; total?: number }) => void;
  } = {},
): Promise<RunQobuzResult> {
  const args = [
    'lucky',
    '-t',
    type,
    '-n',
    String(number),
    '-q',
    String(quality),
    ...(directory ? ['-d', directory] : []),

    // Your preferences:
    '--no-db', // always attempt fresh download (ignore DB)
    '--no-m3u',
    '--no-fallback', // we control fallback explicitly (q=6 then q=5)

    // Consistent names (no slashes):
    '-ff',
    '{artist} - {album} ({year}) [{bit_depth}B-{sampling_rate}kHz]',
    '-tf',
    '{tracktitle}',

    query,
  ];

  const cmd = `qobuz-dl ${args.join(' ')}`;

  if (dryRun) {
    if (!quiet) console.log(cmd);
    return {
      ok: true,
      added: [] as string[],
      cmd,
      stdout: '',
      stderr: '',
      code: 0,
      dry: true,
    } as RunQobuzResult;
  }

  // Take a filesystem snapshot before running
  const before = await snapshot(directory || '.');
  // Optional progress parser
  let bytes = 0;
  let total = 0;
  const onStdout = progress
    ? (chunk: string) => {
        const m = chunk.match(/(\d+(?:\.\d+)?)([kM])\/(\d+(?:\.\d+)?)([kM])/);
        if (m) {
          const v = (n: string, u: string) => Number(n) * (u === 'M' ? 1_000_000 : 1_000);
          bytes = v(m[1], m[2]);
          total = v(m[3], m[4]);
          const percent =
            total > 0 ? Math.max(0, Math.min(100, Math.round((bytes / total) * 100))) : undefined;
          if (onProgress) onProgress({ raw: chunk, percent, bytes, total });
        }
      }
    : undefined;

  const proc = await spawnStreaming('qobuz-dl', args, { quiet, onStdout });
  const after = await snapshot(directory || '.');

  const addedAudio = diffNewAudio(before.files, after.files);

  // Write the original search term next to each downloaded audio file for debugging
  if (addedAudio.length > 0) {
    await Promise.all(
      addedAudio.map(async (p) => {
        try {
          await fs.writeFile(`${p}.search.txt`, query, 'utf8');
        } catch (err) {
          console.error('Failed to write search term file:', err);
        }
      }),
    );
  }

  // If no audio landed, remove any new .tmp files and prune empty dirs we just created
  if (addedAudio.length === 0) {
    const newFiles = diffNew(before.files, after.files);
    await Promise.all(newFiles.map((p) => rmIfOldTmp(p, 0))); // remove freshly created *.tmp
    const newDirs = diffNew(before.dirs, after.dirs);
    // Best-effort purge of just-created empty dirs
    for (const d of newDirs) {
      try {
        const left = await fs.readdir(d);
        if (left.length === 0) await fs.rmdir(d);
      } catch (err) {
        void err;
      }
    }
    await pruneEmptyDirs(directory || '.');
  }

  // If the tool reported files were already downloaded, treat as success to avoid falling back to 320.
  const alreadyDownloaded = proc.code === 0 && addedAudio.length === 0;
  if (alreadyDownloaded) {
    return {
      ok: true,
      added: [],
      cmd,
      logPath: null,
      already: true,
      mismatch: null,
      ...proc,
    } as unknown as RunQobuzResult;
  }

  // Write full qobuz-dl output to a per-run log file so we always have the complete output available
  let logPath: string | null = null;
  try {
    if (directory) {
      const logDir = path.join(directory, '.qobuz-logs');
      await fs.mkdir(logDir, { recursive: true });
      const safeQuery = query.replace(/[^a-z0-9_\-.]/gi, '_').slice(0, 120);
      const fname = `${Date.now()}_${quality}_${safeQuery}.log`;
      logPath = path.join(logDir, fname);
      const content = `CMD: ${cmd}\n\nSTDOUT:\n${proc.stdout}\n\nSTDERR:\n${proc.stderr}\n`;
      await fs.writeFile(logPath, content, 'utf8');
    }
  } catch (e) {
    console.error('Failed to write qobuz-dl log:', e);
    // best-effort only; don't fail the whole operation
  }

  if (addedAudio.length > 0 && (artist || title)) {
    const expectedArtist = normaliseTag(artist);
    const expectedTitle = normaliseTag(title);
    const expectedTitleBase = normaliseTitleBase(title);
    let tagsMatch = true;
    let firstMismatch: {
      file: string;
      artist: string;
      title: string;
    } | null = null;
    for (const f of addedAudio) {
      // eslint-disable-next-line no-await-in-loop
      const tags = await readTags(f);
      const fileArtistRaw = tags['artist'] || tags['album_artist'] || '';
      const fileTitleRaw = tags['title'] || '';
      const fileArtist = normaliseTag(fileArtistRaw);
      const fileTitle = normaliseTag(fileTitleRaw);

      // Relaxed artist match rules:
      // - exact normalized match
      // - OR expected artist appears in the split artist list from the tag
      // - OR (if title indicates remix/edit), expected artist appears in the parentheses content
      let artistOk = true;
      if (artist) {
        artistOk = false;
        if (fileArtist === expectedArtist) artistOk = true;
        if (!artistOk) {
          const parts = (fileArtistRaw || '')
            .split(/\s*,\s*|\s*&\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi)
            .map((s) => normaliseTag(s))
            .filter(Boolean);
          if (parts.includes(expectedArtist)) artistOk = true;
        }
        if (!artistOk && /\(([^)]*)\)/.test(fileTitleRaw)) {
          const paren = (fileTitleRaw.match(/\(([^)]*)\)/) || [])[1] || '';
          const normParen = normaliseTag(paren);
          if (/(remix|vip|edit|version)/i.test(paren) && normParen.includes(expectedArtist))
            artistOk = true;
        }
      }

      // Relaxed title match rules: base title (without remix/edit parentheses) may match
      let titleOk = true;
      if (title) {
        titleOk = false;
        const fileTitleBase = normaliseTitleBase(fileTitleRaw);
        if (fileTitle === expectedTitle) titleOk = true;
        else if (fileTitleBase && expectedTitleBase && fileTitleBase === expectedTitleBase)
          titleOk = true;
      }

      if (!artistOk || !titleOk) {
        tagsMatch = false;
        firstMismatch = {
          file: f,
          artist: fileArtistRaw,
          title: fileTitleRaw,
        };
        break;
      }
    }
    if (!tagsMatch) {
      // Append a simple line to not-matched.log to allow later spot checks
      try {
        const logFile = path.join(directory || '.', 'not-matched.log');
        const expectedStr = `${artist || ''} - ${title || ''}`.trim();
        const foundStr = firstMismatch
          ? `${firstMismatch.artist} - ${firstMismatch.title}`.trim()
          : 'unknown';
        // Keep log concise: no timestamp and no file path (file was removed)
        const line = `query="${query}" expected="${expectedStr}" found="${foundStr}"\n`;
        await fs.appendFile(logFile, line, 'utf8');
      } catch (e) {
        // best effort logging only
        void e;
      }
      await Promise.all(
        addedAudio.map(async (p) => {
          try {
            await fs.rm(p, { force: true });
            await fs.rm(`${p}.search.txt`, { force: true });
          } catch (err) {
            void err;
          }
        }),
      );
      // Best-effort: remove parent album folder(s) entirely
      try {
        const parents = Array.from(
          new Set(
            addedAudio
              .map((p) => path.dirname(p))
              .filter((d) => !directory || path.resolve(d) !== path.resolve(directory)),
          ),
        );
        await Promise.all(
          parents.map(async (d) => {
            try {
              await fs.rm(d, { recursive: true, force: true });
            } catch (e) {
              void e;
            }
          }),
        );
      } catch (e) {
        void e;
      }
      await pruneEmptyDirs(directory || '.');
      const mismatch = firstMismatch
        ? {
            artistNorm: normaliseTag(firstMismatch.artist),
            titleNorm: normaliseTag(firstMismatch.title),
            artistRaw: firstMismatch.artist,
            titleRaw: firstMismatch.title,
          }
        : null;
      return { ok: false, added: [], cmd, logPath, mismatch, ...proc } as unknown as RunQobuzResult;
    }
  }

  const ok = proc.code === 0 && addedAudio.length > 0;

  // After each successful download, convert to AIFF and organise by genre/artist/title
  if (addedAudio.length > 0) {
    for (const f of addedAudio) {
      // Run synchronously (await) so nothing happens in background. Log errors but continue with next file.
      try {
        // await the processing so it runs before we return
        // If you prefer to fail the whole command when organising fails, remove the try/catch.
        // Here we keep best-effort behaviour but synchronously.
        // eslint-disable-next-line no-await-in-loop
        await processDownloadedAudio(f, undefined, { quiet });
      } catch (e) {
        console.error('processDownloadedAudio failed for', f, e);
      }
    }
  }

  return {
    ok,
    added: addedAudio,
    cmd,
    logPath,
    mismatch: null,
    ...proc,
  } as unknown as RunQobuzResult;
}

// Re-export organiser helpers for compatibility
export { processDownloadedAudio, findOrganisedAiff } from './lib/organiser';

// Re-export filesystem helpers for compatibility with tests
export { walkFiles, snapshot };
