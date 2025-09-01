import fs from 'node:fs/promises';
import path from 'node:path';
import { diffNew, rmIfOldTmp, pruneEmptyDirs } from '../lib/fsWalk';

export async function cleanupOnNoAudio(
  before: { files: Set<string>; dirs: Set<string> },
  after: { files: Set<string>; dirs: Set<string> },
  directory: string | undefined,
) {
  const newFiles = diffNew(before.files, after.files);
  await Promise.all(newFiles.map((p) => rmIfOldTmp(p, 0)));
  const newDirs = diffNew(before.dirs, after.dirs);
  for (const d of newDirs) {
    try {
      const left = await fs.readdir(d);
      if (left.length === 0) await fs.rmdir(d);
    } catch {
      /* ignore */
    }
  }
  await pruneEmptyDirs(directory || '.');
}

export async function removeFilesAndParents(files: string[], directory: string | undefined) {
  await Promise.all(
    files.map(async (p) => {
      try {
        await fs.rm(p, { force: true });
        await fs.rm(`${p}.search.txt`, { force: true });
      } catch {
        /* ignore */
      }
    }),
  );

  try {
    const parents = Array.from(
      new Set(
        files
          .map((p) => path.dirname(p))
          .filter((d) => !directory || path.resolve(d) !== path.resolve(directory)),
      ),
    );
    await Promise.all(
      parents.map(async (d) => {
        try {
          await fs.rm(d, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }),
    );
  } catch {
    /* ignore */
  }
  await pruneEmptyDirs(directory || '.');
}
