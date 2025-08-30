import { spawn } from 'node:child_process';

export function spawnStreaming(
  cmd: string,
  args: string[],
  { quiet = false, onStdout }: { quiet?: boolean; onStdout?: (chunk: string) => void } = {},
) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (onStdout) onStdout(s);
      else if (!quiet) process.stdout.write(s);
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
