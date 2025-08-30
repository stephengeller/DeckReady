import fs from 'node:fs/promises';
import path from 'node:path';

const AUDIO_EXT = /\.(flac|mp3|m4a|wav|aiff)$/i;
const TMP_EXT = /\.tmp$/i;

/**
 * Recursively walk a directory, returning all files and directories.
 */
export async function walk(dir: string, files: string[] = [], dirs: string[] = []) {
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

/** Return a flat list of files under a directory (recursive). */
export async function walkFiles(dir: string): Promise<string[]> {
  const { files } = await walk(dir);
  return files;
}

/** Snapshot a directory tree into sets of file and directory paths. */
export async function snapshot(dir: string): Promise<{ files: Set<string>; dirs: Set<string> }> {
  try {
    const { files, dirs } = await walk(dir);
    return { files: new Set(files), dirs: new Set(dirs) };
  } catch {
    return { files: new Set<string>(), dirs: new Set<string>() };
  }
}

/** Set difference that returns items added in `afterSet` compared to `beforeSet`. */
export function diffNew(beforeSet: Set<string>, afterSet: Set<string>) {
  const added: string[] = [];
  for (const p of afterSet) if (!beforeSet.has(p)) added.push(p);
  return added;
}

/** Filter the added files to only audio extensions we care about. */
export function diffNewAudio(beforeFiles: Set<string>, afterFiles: Set<string>) {
  return diffNew(beforeFiles, afterFiles).filter((p) => AUDIO_EXT.test(p));
}

/** Remove a temporary file if it looks like a .tmp and is older than `maxAgeMs`. */
export async function rmIfOldTmp(p: string, maxAgeMs = 15 * 60 * 1000) {
  try {
    if (!TMP_EXT.test(p)) return;
    const st = await fs.stat(p);
    if (Date.now() - st.mtimeMs > maxAgeMs) await fs.rm(p, { force: true });
  } catch (err) {
    void err;
  }
}

/** Recursively remove empty directories under `root` (best-effort). */
export async function pruneEmptyDirs(root: string) {
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
