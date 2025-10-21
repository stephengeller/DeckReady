import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export async function* lineStream(file: string | null) {
  if (file) {
    const resolveUserPath = (input: string) => {
      if (!input) return input;
      if (input.startsWith('~')) {
        const home = os.homedir() || process.env.HOME || '';
        const tail = input.slice(1);
        return path.resolve(path.join(home, tail.startsWith('/') ? tail.slice(1) : tail));
      }
      return path.resolve(input);
    };
    const abs = resolveUserPath(file);
    const rl = readline.createInterface({ input: fs.createReadStream(abs), crlfDelay: Infinity });
    for await (const line of rl) yield line;
  } else {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) yield line;
  }
}

export const isTrackLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) return false;
  return true;
};
