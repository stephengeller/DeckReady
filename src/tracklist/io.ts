import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export async function* lineStream(file: string | null) {
  if (file) {
    const abs = path.resolve(file);
    const rl = readline.createInterface({ input: fs.createReadStream(abs), crlfDelay: Infinity });
    for await (const line of rl) yield line;
  } else {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) yield line;
  }
}

export const isTrackLine = (line: string) => /\s-\s/.test(line.trim());
