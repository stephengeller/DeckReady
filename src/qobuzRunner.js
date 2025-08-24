import { spawn } from 'node:child_process';

export function runQobuzLucky(query, {
  directory,
  quality = 6,           // 6 = Lossless (we’ll refine fallback policy in step 3)
  number = 1,
  type = 'track',
  embedArt = true,
  smart = true,
  dryRun = false,
}) {
  const args = [
    'lucky',
    '-t', type,
    '-n', String(number),
    '-q', String(quality),
    ...(directory ? ['-d', directory] : []),
    ...(embedArt ? ['-e'] : []),
    ...(smart ? ['-s'] : []),
    query
  ];

  if (dryRun) {
    return Promise.resolve({ code: 0, dryRun: true, cmd: `qobuz-dl ${args.join(' ')}` });
  }

  return new Promise((resolve) => {
    const child = spawn('qobuz-dl', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      resolve({ code, stdout, stderr, cmd: `qobuz-dl ${args.join(' ')}` });
    });
  });
}