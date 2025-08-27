import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function walkFiles(dir: string): Promise<string[]> {
  const { files } = await walk(dir);
  return files;
}

export async function snapshot(dir: string): Promise<{ files: Set<string>; dirs: Set<string> }> {
  try {
    const { files, dirs } = await walk(dir);
    return { files: new Set(files), dirs: new Set(dirs) };
  } catch {
    return { files: new Set<string>(), dirs: new Set<string>() };
  }
}

const AUDIO_EXT = /\.(flac|mp3|m4a|wav|aiff)$/i;
const TMP_EXT = /\.tmp$/i;

async function walk(dir: string, files: string[] = [], dirs: string[] = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      dirs.push(p);
      await walk(p, files, dirs);
    } else {
      files.push(p);
    }
  }
  return { files, dirs };
}

function diffNew(beforeSet: Set<string>, afterSet: Set<string>) {
  const added: string[] = [];
  for (const p of afterSet) if (!beforeSet.has(p)) added.push(p);
  return added;
}

function diffNewAudio(beforeFiles: Set<string>, afterFiles: Set<string>) {
  return diffNew(beforeFiles, afterFiles).filter((p) => AUDIO_EXT.test(p));
}

async function rmIfOldTmp(p: string, maxAgeMs = 15 * 60 * 1000) {
  try {
    if (!TMP_EXT.test(p)) return;
    const st = await fs.stat(p);
    if (Date.now() - st.mtimeMs > maxAgeMs) await fs.rm(p, { force: true });
  } catch (err) {
    void err;
  }
}

async function pruneEmptyDirs(root: string) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(
      entries.map(async (e) => {
        if (!e.isDirectory()) return;
        const p = path.join(root, e.name);
        await pruneEmptyDirs(p);
        const left = await fs.readdir(p);
        if (left.length === 0) await fs.rmdir(p);
      }),
    );
  } catch (err) {
    void err;
  }
}

function spawnStreaming(cmd: string, args: string[], { quiet = false } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (!quiet) process.stdout.write(s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (!quiet) process.stderr.write(s);
    });
    child.on('error', (err) => {
      stderr += String(err);
      resolve({ code: 1, stdout, stderr });
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export type RunQobuzResult = {
  ok: boolean;
  added: string[];
  cmd: string;
  stdout: string;
  stderr: string;
  code: number;
  dry?: boolean;
  logPath?: string | null;
};

export async function runQobuzLuckyStrict(
  query: string,
  {
    directory,
    quality = 6,
    number = 1,
    type = 'track',
    dryRun = false,
    quiet = false, // noisy by default; set true to silence
  }: {
    directory?: string;
    quality?: number;
    number?: number;
    type?: string;
    dryRun?: boolean;
    quiet?: boolean;
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
    // '--no-cover',        // progress remains clear; we verify by audio files

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
  const res = await spawnStreaming('qobuz-dl', args, { quiet });
  const after = await snapshot(directory || '.');

  const addedAudio = diffNewAudio(before.files, after.files);

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

  // Write full qobuz-dl output to a per-run log file so we always have the complete output available
  let logPath: string | null = null;
  try {
    if (directory) {
      const logDir = path.join(directory, '.qobuz-logs');
      await fs.mkdir(logDir, { recursive: true });
      const safeQuery = query.replace(/[^a-z0-9_\-.]/gi, '_').slice(0, 120);
      const fname = `${Date.now()}_${quality}_${safeQuery}.log`;
      logPath = path.join(logDir, fname);
      const content = `CMD: ${cmd}\n\nSTDOUT:\n${res.stdout}\n\nSTDERR:\n${res.stderr}\n`;
      await fs.writeFile(logPath, content, 'utf8');
    }
  } catch (e) {
    console.error('Failed to write qobuz-dl log:', e);
    // best-effort only; don't fail the whole operation
  }

  const ok = res.code === 0 && addedAudio.length > 0;

  // After each successful download, convert to AIFF and organise by genre/artist/title
  if (addedAudio.length > 0) {
    for (const f of addedAudio) {
      // Run synchronously (await) so nothing happens in background. Log errors but continue with next file.
      try {
        // await the processing so it runs before we return
        // If you prefer to fail the whole command when organising fails, remove the try/catch.
        // Here we keep best-effort behaviour but synchronously.
        // eslint-disable-next-line no-await-in-loop
        await processDownloadedAudio(f);
      } catch (e) {
        console.error('processDownloadedAudio failed for', f, e);
      }
    }
  }

  return { ok, added: addedAudio, cmd, logPath, ...res } as unknown as RunQobuzResult;
}

// --- Helpers: convert downloaded audio to AIFF, read metadata, and move into organised folders
async function processDownloadedAudio(inputPath: string) {
  const ORG_BASE = '/Users/stephengeller/Music/DJ Stuff/Organised_AIFF';
  try {
    if (!inputPath) return;
    // Ensure file exists
    try {
      await fs.stat(inputPath);
    } catch (e) {
      throw new Error(`file not found: ${inputPath}`);
    }

    const isAIFF = /\.aiff$/i.test(inputPath);

    // Probe the original file for tags first (avoid relying on conversion to keep tags).
    // Ask ffprobe for both format and stream tags because different files store tags in different places.
    const probeArgs = ['-v', 'quiet', '-show_entries', 'format_tags:stream_tags', '-of', 'default=noprint_wrappers=1:nokey=0', inputPath];
    const probeOrig = await spawnStreaming('ffprobe', probeArgs, { quiet: true });
    const tags: Record<string, string> = {};
    for (const line of probeOrig.stdout.split(/\r?\n/)) {
      if (!line) continue;
      // ffprobe emits lines like "TAG:key=value"
      const pref = line.startsWith('TAG:') ? line.slice(4) : line;
      const eq = pref.indexOf('=');
      if (eq > -1) {
        const k = pref.slice(0, eq).trim();
        const v = pref.slice(eq + 1).trim();
        tags[k.toLowerCase()] = v;
      }
    }

    const genreRaw = tags['genre'] || 'Unknown Genre';
    const artistRaw = tags['artist'] || tags['album_artist'] || 'Unknown Artist';
    const titleRaw = tags['title'] || path.basename(inputPath).replace(/\.[^.]+$/, '');

    const genre = sanitizeName(genreRaw);
    const artist = sanitizeName(artistRaw);
    const title = sanitizeName(titleRaw);

    const destDir = path.join(ORG_BASE, genre, artist);
    await fs.mkdir(destDir, { recursive: true });

    let destPath = path.join(destDir, `${title}.aiff`);
    // avoid overwriting existing files by adding numeric suffix
    let i = 1;
    while (true) {
      try {
        await fs.access(destPath);
        // exists -> add suffix
        destPath = path.join(destDir, `${title} (${i}).aiff`);
        i += 1;
      } catch (e) {
        break; // does not exist
      }
    }

    if (isAIFF) {
      // already AIFF, just move
      await fs.rename(inputPath, destPath);
      console.log(`Organised (moved AIFF): ${inputPath} -> ${destPath}`);
      return;
    }

    // Not AIFF -> convert to AIFF and write metadata explicitly in the final AIFF output
    const converted = inputPath + '.converted.aiff';
    const codec = 'pcm_s16le';

    // Build metadata args: prefer standard keys and normalize variants
    const keyMap: Record<string, string> = {
      title: 'title',
      artist: 'artist',
      album: 'album',
      genre: 'genre',
      date: 'date',
      year: 'date',
      track: 'track',
      tracktotal: 'tracktotal',
      album_artist: 'album_artist',
      albumartist: 'album_artist',
      label: 'label',
      composer: 'composer',
      composer_sort: 'composer_sort',
    };

    const metaArgs: string[] = [];
    for (const [k, v] of Object.entries(tags)) {
      if (!v || v.length === 0) continue;
      const key = k.toLowerCase();
      const outKey = keyMap[key];
      if (!outKey) continue;
      metaArgs.push('-metadata', `${outKey}=${v}`);
    }

    // Main conversion command: map original metadata and also pass explicit -metadata entries for compatibility
    const convArgs = ['-y', '-i', inputPath, '-map_metadata', '0', '-vn', '-c:a', codec, ...metaArgs, '-write_id3v2', '1', '-id3v2_version', '3', '-f', 'aiff', converted];

    const ff = await spawnStreaming('ffmpeg', convArgs, { quiet: true });
    if (ff.code !== 0) {
      try {
        await fs.rm(converted, { force: true });
      } catch (e) {
        void e;
      }
      throw new Error(`ffmpeg failed: ${ff.stderr || ff.stdout}`);
    }

    // Move converted into final location
    await fs.rename(converted, destPath);

    // Verify tags made it into the AIFF. If key tags are missing, inject metadata explicitly using ffmpeg (copy).
    try {
      const check = await spawnStreaming('ffprobe', ['-v', 'quiet', '-show_entries', 'format_tags', '-of', 'default=noprint_wrappers=1:nokey=0', destPath], { quiet: true });
      const found: Record<string, string> = {};
      for (const line of check.stdout.split(/\r?\n/)) {
        if (!line) continue;
        const pref = line.startsWith('TAG:') ? line.slice(4) : line;
        const eq = pref.indexOf('=');
        if (eq > -1) {
          const k = pref.slice(0, eq).trim().toLowerCase();
          const v = pref.slice(eq + 1).trim();
          found[k] = v;
        }
      }

      const needGenre = !found['genre'] && !!tags['genre'];
      const needArtist = !found['artist'] && !!tags['artist'];
      const needTitle = !found['title'] && !!tags['title'];

      if (needGenre || needArtist || needTitle) {
        const metaArgs: string[] = [];
        if (tags['title']) metaArgs.push('-metadata', `title=${tags['title']}`);
        if (tags['artist']) metaArgs.push('-metadata', `artist=${tags['artist']}`);
        if (tags['album']) metaArgs.push('-metadata', `album=${tags['album']}`);
        if (tags['genre']) metaArgs.push('-metadata', `genre=${tags['genre']}`);
        if (tags['date']) metaArgs.push('-metadata', `date=${tags['date']}`);
        if (tags['label']) metaArgs.push('-metadata', `label=${tags['label']}`);

        const outTmp = destPath + '.meta.aiff';
        const injectArgs = ['-y', '-i', destPath, ...metaArgs, '-c', 'copy', outTmp];
        const inj = await spawnStreaming('ffmpeg', injectArgs, { quiet: true });
        if (inj.code === 0) {
          await fs.rename(outTmp, destPath);
          console.log(`Metadata injected into AIFF: ${destPath}`);
        } else {
          try {
            await fs.rm(outTmp, { force: true });
          } catch (e) {
            void e;
          }
          console.warn('Failed to inject metadata into AIFF:', inj.stderr || inj.stdout);
        }
      }
    } catch (e) {
      void e;
    }

    console.log(`Organised (converted -> AIFF): ${inputPath} -> ${destPath}`);
  } catch (err) {
    console.error('Error organising downloaded audio:', inputPath, err);
  }
}

function sanitizeName(s: string) {
  if (!s) return 'Unknown';
  // Replace path separators and other problematic characters, keep unicode letters
  const cleaned = s.replace(/[\\/:\u0000-\u001f<>\?|\*\"]+/g, '_').trim();
  // Collapse multiple spaces
  return cleaned.replace(/\s+/g, ' ');
}
