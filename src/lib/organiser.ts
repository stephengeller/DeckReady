import fs from 'node:fs/promises';
import path from 'node:path';
import { ORGANISED_AIFF_DIR } from './env';
import { normaliseForSearch } from './normalize';
import { spawnStreaming } from './proc';
import { readTags, Runner } from './tags';

/**
 * Convert a downloaded audio file to AIFF (if needed), copy metadata, and move
 * it into the organised AIFF folder tree under ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff.
 */
export async function processDownloadedAudio(
  inputPath: string,
  runner?: Runner,
  opts?: { quiet?: boolean; verbose?: boolean },
) {
  const ORG_BASE = process.env.ORGANISED_AIFF_DIR || ORGANISED_AIFF_DIR;
  try {
    if (!inputPath) return;
    try {
      await fs.stat(inputPath);
    } catch {
      throw new Error(`file not found: ${inputPath}`);
    }

    const isAIFF = /\.aiff$/i.test(inputPath);
    const tags = await readTags(inputPath, runner);

    const genreRaw = tags['genre'] || 'Unknown Genre';
    const artistRaw = tags['artist'] || tags['album_artist'] || 'Unknown Artist';
    const titleRaw = tags['title'] || path.basename(inputPath).replace(/\.[^.]+$/, '');

    const genre = sanitizeName(pickGenre(genreRaw));
    const artist = sanitizeName(artistRaw);
    const title = sanitizeName(titleRaw);

    const destDir = path.join(ORG_BASE, genre, artist);
    await fs.mkdir(destDir, { recursive: true });

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

    if (isAIFF) {
      await fs.rename(inputPath, destPath);
      if (!opts?.quiet) console.log(`Organised (moved AIFF): ${inputPath} -> ${destPath}`);
      return;
    }

    const converted = inputPath + '.converted.aiff';
    const codec = 'pcm_s16le';

    const keyMap: Record<string, string> = {
      title: 'title',
      artist: 'artist',
      album: 'album',
      genre: 'genre',
      date: 'date',
      year: 'date',
      track: 'track',
      tracktotal: 'tracktotal',
      album_artist: 'album_artist',
      albumartist: 'album_artist',
      label: 'label',
      composer: 'composer',
      composer_sort: 'composer_sort',
    };
    const metaArgs: string[] = [];
    for (const [k, v] of Object.entries(tags)) {
      if (!v || v.length === 0) continue;
      const outKey = keyMap[k.toLowerCase()];
      if (!outKey) continue;
      metaArgs.push('-metadata', `${outKey}=${v}`);
    }

    const coverCandidates = ['cover.jpg', 'cover.jpeg', 'cover.png'];
    let coverPath: string | null = null;
    for (const name of coverCandidates) {
      const p = path.join(path.dirname(inputPath), name);
      try {
        await fs.access(p);
        coverPath = p;
        break;
      } catch {
        /* ignore */
      }
    }

    let convArgs: string[];
    if (coverPath) {
      convArgs = [
        '-y',
        '-i',
        inputPath,
        '-i',
        coverPath,
        '-map_metadata',
        '0',
        '-map',
        '0:a',
        '-map',
        '1:v',
        '-c:a',
        codec,
        '-c:v',
        'copy',
        ...metaArgs,
        '-disposition:v',
        'attached_pic',
        '-write_id3v2',
        '1',
        '-id3v2_version',
        '3',
        '-f',
        'aiff',
        converted,
      ];
    } else {
      convArgs = [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0',
        '-map_metadata',
        '0',
        '-c',
        'copy',
        '-c:a',
        codec,
        ...metaArgs,
        '-write_id3v2',
        '1',
        '-id3v2_version',
        '3',
        '-f',
        'aiff',
        converted,
      ];
    }

    const ff = runner
      ? await runner('ffmpeg', convArgs)
      : await spawnStreaming('ffmpeg', convArgs, { quiet: true });
    if (ff.code !== 0) {
      try {
        await fs.rm(converted, { force: true });
      } catch {
        throw new Error(`ffmpeg failed: ${ff.stderr || ff.stdout}`);
      }
    }

    await fs.rename(converted, destPath);

    try {
      const checkArgs = [
        '-v',
        'quiet',
        '-show_entries',
        'format_tags',
        '-of',
        'default=noprint_wrappers=1:nokey=0',
        destPath,
      ];
      const check = runner
        ? await runner('ffprobe', checkArgs)
        : await spawnStreaming('ffprobe', checkArgs, { quiet: true });
      const found: Record<string, string> = {};
      for (const line of check.stdout.split(/\r?\n/)) {
        if (!line) continue;
        const pref = line.startsWith('TAG:') ? line.slice(4) : line;
        const eq = pref.indexOf('=');
        if (eq > -1) {
          const k = pref.slice(0, eq).trim().toLowerCase();
          const v = pref.slice(eq + 1).trim();
          found[k] = v;
        }
      }

      const needGenre = !found['genre'] && !!tags['genre'];
      const needArtist = !found['artist'] && !!tags['artist'];
      const needTitle = !found['title'] && !!tags['title'];

      if (needGenre || needArtist || needTitle) {
        const metaArgs2: string[] = [];
        if (tags['title']) metaArgs2.push('-metadata', `title=${tags['title']}`);
        if (tags['artist']) metaArgs2.push('-metadata', `artist=${tags['artist']}`);
        if (tags['album']) metaArgs2.push('-metadata', `album=${tags['album']}`);
        if (tags['genre']) metaArgs2.push('-metadata', `genre=${tags['genre']}`);
        if (tags['date']) metaArgs2.push('-metadata', `date=${tags['date']}`);
        if (tags['label']) metaArgs2.push('-metadata', `label=${tags['label']}`);

        const outTmp = destPath + '.meta.aiff';
        const injectArgs = ['-y', '-i', destPath, ...metaArgs2, '-c', 'copy', outTmp];
        const inj = runner
          ? await runner('ffmpeg', injectArgs)
          : await spawnStreaming('ffmpeg', injectArgs, { quiet: true });
        if (inj.code === 0) {
          await fs.rename(outTmp, destPath);
          if (!opts?.quiet) console.log(`Metadata injected into AIFF: ${destPath}`);
        } else {
          try {
            await fs.rm(outTmp, { force: true });
          } catch {
            console.warn('Failed to inject metadata into AIFF:', inj.stderr || inj.stdout);
          }
        }
      }
    } catch {
      console.warn('Failed to verify/inject metadata into AIFF:', destPath);
    }

    if (!opts?.quiet) console.log(`Organised (converted -> AIFF): ${inputPath} -> ${destPath}`);
  } catch (err) {
    console.error('Error organising downloaded audio:', inputPath, err);
  }
}

/**
 * Choose a preferred genre from a comma-separated list, with special handling
 * to prefer specific subgenres like "Drum & Bass" over generic ones.
 */
export function pickGenre(raw: string): string {
  if (!raw) return 'Unknown';
  const parts = raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const norm = (s: string) => normaliseForSearch(s).toLowerCase();
  const dnb = parts.find((p) => norm(p).includes('drum & bass'));
  if (dnb) return 'Drum & Bass';
  if (parts.length > 1) {
    const first = norm(parts[0]);
    if (first === 'electronique' || first === 'electronic') return parts[1];
  }
  return parts[0] || 'Unknown';
}

/**
 * Sanitize strings for filesystem paths: remove control chars and reserved symbols,
 * collapse whitespace, and keep names readable.
 */
export function sanitizeName(s: string) {
  if (!s) return 'Unknown';
  const noControl = s.replace(/\p{Cc}/gu, '');
  const cleaned = noControl.replace(/[\\/:"<>?|*]+/g, '_').trim();
  return cleaned.replace(/\s+/g, ' ');
}

/**
 * Locate an already-organised AIFF under ORGANISED_AIFF_DIR matching artist/title.
 * Checks each genre subdirectory for an artist folder and title-matching file.
 */
export async function findOrganisedAiff(artist: string, title: string): Promise<string | null> {
  try {
    const baseDir = process.env.ORGANISED_AIFF_DIR || ORGANISED_AIFF_DIR;
    const artistDirName = sanitizeName(artist || '');
    const titleBase = sanitizeName(title || '');
    const genres = await fs.readdir(baseDir).catch(() => [] as string[]);
    const titleRegex = new RegExp(
      `^${titleBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\((?:\\d+)\\))?\\.aiff$`,
      'i',
    );
    for (const g of genres) {
      const artistDir = path.join(baseDir, g, artistDirName);
      try {
        const entries = await fs.readdir(artistDir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isFile()) continue;
          if (titleRegex.test(e.name)) return path.join(artistDir, e.name);
        }
      } catch {
        console.warn(`Warning: could not access artist dir ${artistDir}`);
      }
    }
  } catch {
    console.warn('Warning: could not access organised AIFF base dir');
  }
  return null;
}
