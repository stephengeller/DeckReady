import fs from 'node:fs/promises';
import path from 'node:path';
import { normaliseTag, normaliseTitleBase, readTags } from '../lib/tags';
import { removeFilesAndParents } from './fsOps';

export type Mismatch = {
  artistNorm: string;
  titleNorm: string;
  artistRaw: string;
  titleRaw: string;
} | null;

export async function validateAddedAudioAgainstExpectation(
  addedAudio: string[],
  opts: {
    directory?: string;
    query: string;
    artist?: string;
    title?: string;
  },
): Promise<Mismatch> {
  const { directory, query, artist, title } = opts;
  if (addedAudio.length === 0 || (!artist && !title)) return null;

  const expectedArtist = normaliseTag(artist);
  const expectedTitle = normaliseTag(title);
  const expectedTitleBase = normaliseTitleBase(title);

  let firstMismatch: { file: string; artist: string; title: string } | null = null;

  for (const f of addedAudio) {
    // eslint-disable-next-line no-await-in-loop
    const tags = await readTags(f);
    const fileArtistRaw = tags['artist'] || tags['album_artist'] || '';
    const fileTitleRaw = tags['title'] || '';
    const fileArtist = normaliseTag(fileArtistRaw);
    const fileTitle = normaliseTag(fileTitleRaw);

    let artistOk = true;
    if (artist) {
      artistOk = false;
      if (fileArtist === expectedArtist) artistOk = true;
      if (!artistOk) {
        const parts = (fileArtistRaw || '')
          .split(/\s*,\s*|\s*&\s*|\s+x\s+|\s*×\s*|\s+\band\s+/gi)
          .map((s) => normaliseTag(s))
          .filter(Boolean);
        if (parts.includes(expectedArtist)) artistOk = true;
      }
      if (!artistOk && /\(([^)]*)\)/.test(fileTitleRaw)) {
        const parens = Array.from(fileTitleRaw.matchAll(/\(([^)]*)\)/g)).map((m) => m[1] || '');
        const expectedCore = normaliseTag(
          (artist || '').replace(/\b(remix|vip|edit|mix|version)\b/gi, '').trim(),
        );
        for (const p of parens) {
          const normParen = normaliseTag(p);
          const remixLike = /\b(remix|vip|edit|mix|version)\b/i.test(p);
          if (
            remixLike &&
            (normParen.includes(expectedArtist) ||
              (!!expectedCore && normParen.includes(expectedCore)))
          ) {
            artistOk = true;
            break;
          }
        }
      }
    }

    let titleOk = true;
    if (title) {
      titleOk = false;
      const fileTitleBase = normaliseTitleBase(fileTitleRaw);
      if (fileTitle === expectedTitle) titleOk = true;
      else if (fileTitleBase && expectedTitleBase && fileTitleBase === expectedTitleBase)
        titleOk = true;
    }

    if (!artistOk || !titleOk) {
      firstMismatch = { file: f, artist: fileArtistRaw, title: fileTitleRaw };
      break;
    }
  }

  if (!firstMismatch) return null;

  try {
    const logFile = path.join(directory || '.', 'not-matched.log');
    const expectedStr = `${artist || ''} - ${title || ''}`.trim();
    const foundStr = `${firstMismatch.artist} - ${firstMismatch.title}`.trim();
    const line = `query="${query}" expected="${expectedStr}" found="${foundStr}"\n`;
    await fs.appendFile(logFile, line, 'utf8');
  } catch {
    /* best effort */
  }

  await removeFilesAndParents(addedAudio, directory);

  return {
    artistNorm: normaliseTag(firstMismatch.artist),
    titleNorm: normaliseTag(firstMismatch.title),
    artistRaw: firstMismatch.artist,
    titleRaw: firstMismatch.title,
  };
}
