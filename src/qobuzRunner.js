import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function walkFiles(dir) {
  const { files } = await walk(dir);
  return files;
}

export async function snapshot(dir) {
  try {
    const { files, dirs } = await walk(dir);
    return { files: new Set(files), dirs: new Set(dirs) };
  } catch {
    return { files: new Set(), dirs: new Set() };
  }
}

const AUDIO_EXT = /\.(flac|mp3|m4a|wav|aiff)$/i;
const TMP_EXT = /\.tmp$/i;

async function walk(dir, files = [], dirs = []) {
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

function diffNew(beforeSet, afterSet) {
  const added = [];
  for (const p of afterSet) if (!beforeSet.has(p)) added.push(p);
  return added;
}

function diffNewAudio(beforeFiles, afterFiles) {
  return diffNew(beforeFiles, afterFiles).filter(p => AUDIO_EXT.test(p));
}

async function rmIfOldTmp(p, maxAgeMs = 15 * 60 * 1000) {
  try {
    if (!TMP_EXT.test(p)) return;
    const st = await fs.stat(p);
    if (Date.now() - st.mtimeMs > maxAgeMs) await fs.rm(p, { force: true });
  } catch {}
}

async function pruneEmptyDirs(root) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries.map(async e => {
      if (!e.isDirectory()) return;
      const p = path.join(root, e.name);
      await pruneEmptyDirs(p);
      const left = await fs.readdir(p);
      if (left.length === 0) await fs.rmdir(p);
    }));
  } catch {}
}

function spawnStreaming(cmd, args, { quiet = false } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => {
      const s = d.toString();
      stdout += s;
      if (!quiet) process.stdout.write(s);
    });
    child.stderr.on('data', d => {
      const s = d.toString();
      stderr += s;
      if (!quiet) process.stderr.write(s);
    });
    child.on('error', err => {
      stderr += String(err);
      resolve({ code: 1, stdout, stderr });
    });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

export async function runQobuzLuckyStrict(query, {
  directory,
  quality = 6,
  number = 1,
  type = 'track',
  embedArt = false,      // we avoid covers so “cover-only” can't mask failures
  dryRun = false,
  quiet = false          // noisy by default; set true to silence
} = {}) {
  const args = [
    'lucky',
    '-t', type,
    '-n', String(number),
    '-q', String(quality),
    ...(directory ? ['-d', directory] : []),

    // Your preferences:
    '--no-db',           // always attempt fresh download (ignore DB)
    '--no-cover',        // progress remains clear; we verify by audio files
    '--no-m3u',
    '--no-fallback',     // we control fallback explicitly (q=6 then q=5)

    // Consistent names (no slashes):
    '-ff', '{artist} - {album} ({year}) [{bit_depth}B-{sampling_rate}kHz]',
    '-tf', '{tracktitle}',

    query
  ];

  const cmd = `qobuz-dl ${args.join(' ')}`;

  if (dryRun) {
    if (!quiet) console.log(cmd);
    return { ok: true, added: [], cmd, stdout: '', stderr: '', code: 0, dry: true };
  }

  // Take a filesystem snapshot before running
  const before = await snapshot(directory);
  const res = await spawnStreaming('qobuz-dl', args, { quiet });
  const after = await snapshot(directory);

  const addedAudio = diffNewAudio(before.files, after.files);

  // If no audio landed, remove any new .tmp files and prune empty dirs we just created
  if (addedAudio.length === 0) {
    const newFiles = diffNew(before.files, after.files);
    await Promise.all(newFiles.map(p => rmIfOldTmp(p, 0))); // remove freshly created *.tmp
    const newDirs = diffNew(before.dirs, after.dirs);
    // Best-effort purge of just-created empty dirs
    for (const d of newDirs) {
      try {
        const left = await fs.readdir(d);
        if (left.length === 0) await fs.rmdir(d);
      } catch {}
    }
    await pruneEmptyDirs(directory);
  }

  // Write full qobuz-dl output to a per-run log file so we always have the complete output available
  let logPath = null;
  try {
    if (directory) {
      const logDir = path.join(directory, '.qobuz-logs');
      await fs.mkdir(logDir, { recursive: true });
      const safeQuery = query.replace(/[^a-z0-9_\-\.]/gi, '_').slice(0, 120);
      const fname = `${Date.now()}_${quality}_${safeQuery}.log`;
      logPath = path.join(logDir, fname);
      const content = `CMD: ${cmd}\n\nSTDOUT:\n${res.stdout}\n\nSTDERR:\n${res.stderr}\n`;
      await fs.writeFile(logPath, content, 'utf8');
    }
  } catch (e) {
    // best-effort only; don't fail the whole operation
  }

  const ok = res.code === 0 && addedAudio.length > 0;
  return { ok, added: addedAudio, cmd, logPath, ...res };
}
