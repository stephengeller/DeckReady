import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureUniqueAiffPath(destDir: string, baseName: string): Promise<string> {
  let destPath = path.join(destDir, `${baseName}.aiff`);
  let i = 1;
  const MAX_ATTEMPTS = 1000;
  let found = false;
  while (i <= MAX_ATTEMPTS && !found) {
    try {
      await fs.access(destPath);
      destPath = path.join(destDir, `${baseName} (${i}).aiff`);
      i += 1;
    } catch {
      found = true;
    }
  }
  if (!found)
    throw new Error(
      `Could not find available filename for ${baseName} after ${MAX_ATTEMPTS} attempts`,
    );
  return destPath;
}
