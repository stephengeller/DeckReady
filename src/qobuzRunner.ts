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

function sanitizeSegment(s: string) {
  return (s || 'Unknown').replace(/[\/*?"<>|:]/g, '_').trim() || 'Unknown';
}

async function convertAndOrganize(src: string): Promise<string> {
  const targetRoot =
    process.env.ORGANIZED_AIFF_DIR ||
    (process.env.HOME
      ? path.join(process.env.HOME, 'Music', 'DJ Stuff', 'Organised_AIFF')
      : path.join('Organised_AIFF'));
  const aiffTmp = src.replace(/\.[^.]+$/, '.aiff');
  const ffArgs = [
    '-y',
    '-i',
    src,
    '-map_metadata',
    '0',
    '-write_id3v2',
    '1',
    '-id3v2_version',
    '3',
    '-c:a',
    'pcm_s16be',
    '-vn',
    aiffTmp,
  ];
  try {
    const ff = await spawnStreaming('ffmpeg', ffArgs, { quiet: true });
    if (ff.code !== 0) throw new Error(ff.stderr || 'ffmpeg failed');
    const probe = await spawnStreaming(
      'ffprobe',
      ['-v', 'quiet', '-show_entries', 'format_tags', '-of', 'json', aiffTmp],
      { quiet: true },
    );
    if (probe.code !== 0) throw new Error(probe.stderr || 'ffprobe failed');
    const meta = JSON.parse(probe.stdout || '{}');
    const tags = meta.format?.tags || {};
    const genre = sanitizeSegment(tags.genre);
    const artist = sanitizeSegment(tags.artist);
    const title = sanitizeSegment(tags.title || path.basename(aiffTmp, path.extname(aiffTmp)));
    const destDir = path.join(targetRoot, genre, artist);
    await fs.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, `${title}.aiff`);
    await fs.rename(aiffTmp, dest);
    return dest;
  } catch (err) {
    console.error('AIFF conversion failed:', err);
    // best effort: if conversion failed, return original file
    try {
      await fs.rm(aiffTmp, { force: true });
    } catch {
      // ignore
    }
    return src;
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

  const addedRaw = diffNewAudio(before.files, after.files);
  const addedAudio: string[] = [];
  for (const p of addedRaw) {
    try {
      const dest = await convertAndOrganize(p);
      addedAudio.push(dest);
    } catch (err) {
      console.error('post-download processing failed:', err);
    }
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
  return { ok, added: addedAudio, cmd, logPath, ...res } as unknown as RunQobuzResult;
}
