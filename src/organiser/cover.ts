import fs from 'node:fs/promises';
import path from 'node:path';

export async function findCoverInSameDir(inputPath: string): Promise<string | null> {
  const dir = path.dirname(inputPath);
  const coverCandidates = ['cover.jpg', 'cover.jpeg', 'cover.png'];
  for (const name of coverCandidates) {
    const p = path.join(dir, name);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}
