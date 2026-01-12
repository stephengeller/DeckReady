import fs from 'node:fs/promises';
import { spawnStreaming } from './lib/proc';
import { readTags } from './lib/tags';
import { walkFiles, snapshot, diffNewAudio } from './lib/fsWalk';
import { processDownloadedAudio, findOrganisedAiff } from './lib/organiser';
import { makeProgressHandler } from './provider/progress';
import { cleanupOnNoAudio } from './provider/fsOps';
import { writeRunLog, writeSidecarText } from './provider/logging';
import { validateAddedAudioAgainstExpectation } from './provider/validation';

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
    byGenre = false,
    flacOnly = false,
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
    byGenre?: boolean;
    flacOnly?: boolean;
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
  const onStdout = makeProgressHandler(progress, (info) => {
    bytes = info.bytes ?? bytes;
    total = info.total ?? total;
    if (onProgress) onProgress(info);
  });

  const proc = await spawnStreaming('qobuz-dl', args, { quiet, onStdout, onStderr: onStdout });
  const after = await snapshot(directory || '.');

  const addedAudio = diffNewAudio(before.files, after.files);

  // Write the original search term next to each downloaded audio file for debugging
  if (addedAudio.length > 0) await writeSidecarText(addedAudio, query);

  // If no audio landed, remove any new .tmp files and prune empty dirs we just created
  if (addedAudio.length === 0) {
    await cleanupOnNoAudio(before, after, directory);
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
  const safeQuery = query.replace(/[^a-z0-9_\-.]/gi, '_').slice(0, 120);
  const logPath = await writeRunLog(
    directory,
    `${Date.now()}_${quality}_${safeQuery}`,
    cmd,
    proc.stdout,
    proc.stderr,
  );

  if (addedAudio.length > 0 && (artist || title)) {
    const mismatch = await validateAddedAudioAgainstExpectation(addedAudio, {
      directory,
      query,
      artist,
      title,
    });
    if (mismatch) {
      return { ok: false, added: [], cmd, logPath, mismatch, ...proc } as unknown as RunQobuzResult;
    }
  }

  const ok = proc.code === 0 && addedAudio.length > 0;

  // After each successful download, convert to AIFF and organise by genre/artist/title
  if (flacOnly) {
    return {
      ok,
      added: addedAudio,
      cmd,
      logPath,
      mismatch: null,
      ...proc,
    } as unknown as RunQobuzResult;
  }

  if (addedAudio.length > 0) {
    for (const f of addedAudio) {
      // Run synchronously (await) so nothing happens in background. Log errors but continue with next file.
      try {
        // await the processing so it runs before we return
        // If you prefer to fail the whole command when organising fails, remove the try/catch.
        // Here we keep best-effort behaviour but synchronously.
        // eslint-disable-next-line no-await-in-loop
        await processDownloadedAudio(f, undefined, { quiet, byGenre });
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

/**
 * Run qobuz-dl in direct URL mode (dl) for a Qobuz URL (track/album/playlist/artist/label).
 * - Mirrors snapshot/new-file detection and post-processing from runQobuzLuckyStrict.
 * - Does NOT perform artist/title tag validation since the URL is authoritative.
 */
export async function runQobuzDl(
  url: string,
  {
    directory,
    quality = 6,
    dryRun = false,
    quiet = false,
    progress = false,
    onProgress,
    byGenre = false,
    flacOnly = false,
  }: {
    directory?: string;
    quality?: number;
    dryRun?: boolean;
    quiet?: boolean;
    progress?: boolean;
    onProgress?: (info: { raw: string; percent?: number; bytes?: number; total?: number }) => void;
    byGenre?: boolean;
    flacOnly?: boolean;
  } = {},
): Promise<RunQobuzResult> {
  const args = [
    'dl',
    '-q',
    String(quality),
    ...(directory ? ['-d', directory] : []),

    '--no-db',
    '--no-m3u',
    '--no-fallback',

    '-ff',
    '{artist} - {album} ({year}) [{bit_depth}B-{sampling_rate}kHz]',
    '-tf',
    '{tracktitle}',

    url,
  ];

  const cmd = `qobuz-dl ${args.join(' ')}`;

  if (dryRun) {
    if (!quiet) console.log(cmd);
    return {
      ok: true,
      added: [],
      cmd,
      stdout: '',
      stderr: '',
      code: 0,
      dry: true,
    } as RunQobuzResult;
  }

  const before = await snapshot(directory || '.');
  let bytes = 0;
  let total = 0;
  const onStdout = makeProgressHandler(progress, (info) => {
    bytes = info.bytes ?? bytes;
    total = info.total ?? total;
    if (onProgress) onProgress(info);
  });

  const proc = await spawnStreaming('qobuz-dl', args, { quiet, onStdout, onStderr: onStdout });
  const after = await snapshot(directory || '.');

  const addedAudio = diffNewAudio(before.files, after.files);

  // Write the original URL next to each downloaded audio file for debugging
  if (addedAudio.length > 0) await writeSidecarText(addedAudio, url);

  // If no audio landed, cleanup fresh tmp files/dirs
  if (addedAudio.length === 0) await cleanupOnNoAudio(before, after, directory);

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

  // Log full output per run (best-effort)
  const safeUrl = url.replace(/[^a-z0-9_\-.]/gi, '_').slice(0, 120);
  const logPath = await writeRunLog(
    directory,
    `${Date.now()}_${quality}_${safeUrl}`,
    cmd,
    proc.stdout,
    proc.stderr,
  );

  // Short-circuit per file when an organised AIFF already exists (unless flacOnly)
  const keptAudio: string[] = [];
  if (addedAudio.length > 0) {
    if (flacOnly) {
      keptAudio.push(...addedAudio);
    } else {
      for (const f of addedAudio) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const tags = await readTags(f);
          const artistRaw = tags['artist'] || tags['album_artist'] || '';
          const titleRaw = tags['title'] || '';
          // eslint-disable-next-line no-await-in-loop
          const existing = await findOrganisedAiff(artistRaw, titleRaw, { byGenre });
          if (existing) {
            if (!quiet) console.log(`  \u21BA already organised: ${existing}`);
            try {
              await fs.rm(f, { force: true });
              await fs.rm(`${f}.search.txt`, { force: true });
            } catch {
              /* ignore */
            }
          } else {
            keptAudio.push(f);
          }
        } catch {
          keptAudio.push(f);
        }
      }
    }
  }

  const ok = proc.code === 0 && keptAudio.length > 0;

  if (flacOnly) {
    return {
      ok,
      added: keptAudio,
      cmd,
      logPath,
      mismatch: null,
      already: proc.code === 0 && keptAudio.length === 0 ? true : undefined,
      ...proc,
    } as unknown as RunQobuzResult;
  }

  if (keptAudio.length > 0) {
    for (const f of keptAudio) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await processDownloadedAudio(f, undefined, { quiet, byGenre });
      } catch (e) {
        console.error('processDownloadedAudio failed for', f, e);
      }
    }
  }

  return {
    ok,
    added: keptAudio,
    cmd,
    logPath,
    mismatch: null,
    already: proc.code === 0 && keptAudio.length === 0 ? true : undefined,
    ...proc,
  } as unknown as RunQobuzResult;
}

// Re-export organiser helpers for compatibility
export { processDownloadedAudio, findOrganisedAiff } from './lib/organiser';

// Re-export filesystem helpers for compatibility with tests
export { walkFiles, snapshot };
