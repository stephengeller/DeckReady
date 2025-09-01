import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureUniqueAiffPath(destDir: string, title: string): Promise<string> {
  let destPath = path.join(destDir, `${title}.aiff`);
  let i = 1;
  const MAX_ATTEMPTS = 1000;
  let found = false;
  while (i <= MAX_ATTEMPTS && !found) {
    try {
      await fs.access(destPath);
      destPath = path.join(destDir, `${title} (${i}).aiff`);
      i += 1;
    } catch {
      found = true;
    }
  }
  if (!found)
    throw new Error(
      `Could not find available filename for ${title} after ${MAX_ATTEMPTS} attempts`,
    );
  return destPath;
}
