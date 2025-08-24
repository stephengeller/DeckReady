import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const AUDIO_EXT = /\.(flac|mp3|m4a|wav|aiff)$/i;

async function walkFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

async function snapshot(dir) {
  try { return new Set(await walkFiles(dir)); }
  catch { return new Set(); }
}

function diffNewAudio(before, after) {
  const added = [];
  for (const p of after) if (!before.has(p) && AUDIO_EXT.test(p)) added.push(p);
  return added;
}

function spawnCapture(cmd, args) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

export async function runQobuzLuckyStrict(query, {
  directory,
  quality = 6,
  number = 1,
  type = 'track',
  embedArt = false,    // leave covers off to avoid the “cover only” illusion
  dryRun = false,
}) {
  const args = [
    'lucky',
    '-t', type,
    '-n', String(number),
    '-q', String(quality),
    ...(directory ? ['-d', directory] : []),

    // Make probing clean and predictable:
    '--no-db',          // don't poison DB during candidate tries
    '--no-cover',       // speed + we verify audio creation explicitly
    '--no-m3u',
    '--no-fallback',    // we implement our own fallback (q=6 -> q=5)

    // Consistent names (easier post-checking, no slashes)
    '-ff', '{artist} - {album} ({year}) [{bit_depth}B-{sampling_rate}kHz]',
    '-tf', '{tracktitle}',

    query
  ];

  const cmd = `qobuz-dl ${args.join(' ')}`;

  if (dryRun) {
    return { ok: true, added: [], cmd, stdout: '', stderr: '', code: 0, dry: true };
  }

  const before = await snapshot(directory);
  const res = await spawnCapture('qobuz-dl', args);
  const after = await snapshot(directory);
  const added = diffNewAudio(before, after);
  const ok = res.code === 0 && added.length > 0;

  return { ok, added, cmd, ...res };
}