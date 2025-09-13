import fs from 'node:fs/promises';
import path from 'node:path';
import { ORGANISED_AIFF_DIR, ORGANISED_FLAT } from './env';
import { spawnStreaming } from './proc';
import { readTags, Runner } from './tags';
import { pickGenre, sanitizeName } from '../organiser/names';
import { findCoverInSameDir } from '../organiser/cover';
import { ensureUniqueAiffPath } from '../organiser/fs';
import { buildConvertArgs, buildMetaArgs, verifyAndInjectAiffTags } from '../organiser/ffmpeg';

/**
 * Convert a downloaded audio file to AIFF (if needed), copy metadata, and move
 * it into the organised AIFF folder tree under ORGANISED_AIFF_DIR/Artist/Title.aiff by default
 * (or ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff when opts.byGenre is true).
 */
export async function processDownloadedAudio(
  inputPath: string,
  runner?: Runner,
  opts?: { quiet?: boolean; verbose?: boolean; byGenre?: boolean },
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

    // Layout selection priority:
    // 1) By-genre flag: <Genre>/<Artist>/<Title>.aiff
    // 2) Flat (default): <Title>.aiff directly under ORG_BASE
    // 3) Artist/Title (legacy default): <Artist>/<Title>.aiff
    const destDir = opts?.byGenre
      ? path.join(ORG_BASE, genre, artist)
      : ORGANISED_FLAT
        ? ORG_BASE
        : path.join(ORG_BASE, artist);
    await fs.mkdir(destDir, { recursive: true });

    const destPath = await ensureUniqueAiffPath(destDir, title);

    if (isAIFF) {
      await fs.rename(inputPath, destPath);
      if (!opts?.quiet) console.log(`Organised (moved AIFF): ${inputPath} -> ${destPath}`);
      return;
    }

    const converted = inputPath + '.converted.aiff';
    const codec = 'pcm_s16le';

    const metaArgs: string[] = buildMetaArgs(tags as Record<string, string | undefined>);

    const coverPath = await findCoverInSameDir(inputPath);

    const convArgs: string[] = buildConvertArgs(inputPath, coverPath, codec, metaArgs, converted);

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

    await verifyAndInjectAiffTags(
      destPath,
      tags as Record<string, string | undefined>,
      runner,
      opts?.quiet ?? true,
    );

    if (!opts?.quiet) console.log(`Organised (converted -> AIFF): ${inputPath} -> ${destPath}`);
  } catch (err) {
    console.error('Error organising downloaded audio:', inputPath, err);
  }
}

/**
 * Choose a preferred genre from a comma-separated list, with special handling
 * to prefer specific subgenres like "Drum & Bass" over generic ones.
 */
// pickGenre and sanitizeName now live in ../organiser/names

/**
 * Locate an already-organised AIFF under ORGANISED_AIFF_DIR matching artist/title.
 * Checks each genre subdirectory for an artist folder and title-matching file.
 */
export async function findOrganisedAiff(
  artist: string,
  title: string,
  opts?: { byGenre?: boolean },
): Promise<string | null> {
  try {
    const baseDir = process.env.ORGANISED_AIFF_DIR || ORGANISED_AIFF_DIR;
    const artistDirName = sanitizeName(artist || '');
    const titleBase = sanitizeName(title || '');

    const titleRegex = new RegExp(
      `^${titleBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: \\((?:\\d+)\\))?\\.aiff$`,
      'i',
    );

    // Search order based on user intent and defaults:
    // 1) If by-genre requested, prefer <Genre>/<Artist>/<Title>.aiff
    if (opts?.byGenre) {
      const genreDirents = await fs
        .readdir(baseDir, { withFileTypes: true })
        .catch(() => [] as Array<{ name: string; isDirectory: () => boolean }>);
      const genres = genreDirents
        .filter((d) => d && typeof d.isDirectory === 'function' && d.isDirectory())
        .map((d) => d.name);
      for (const g of genres) {
        const artistDir = path.join(baseDir, g, artistDirName);
        try {
          const entries = await fs.readdir(artistDir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isFile()) continue;
            if (titleRegex.test(e.name)) return path.join(artistDir, e.name);
          }
        } catch (err) {
          if (err?.code !== 'ENOENT') {
            console.warn(`Warning: could not access artist dir ${artistDir}`);
          }
        }
      }
    }

    // 2) Flat layout (now default): <base>/<Title>.aiff
    if (ORGANISED_FLAT) {
      try {
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isFile()) continue;
          if (titleRegex.test(e.name)) return path.join(baseDir, e.name);
        }
      } catch (err) {
        if (err?.code !== 'ENOENT')
          console.warn(`Warning: could not access organised base dir ${baseDir}`);
      }
    }

    // First, check new default layout: <base>/<Artist>/<Title>.aiff
    const artistDirDefault = path.join(baseDir, artistDirName);
    try {
      const entries = await fs.readdir(artistDirDefault, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (titleRegex.test(e.name)) return path.join(artistDirDefault, e.name);
      }
    } catch (err) {
      if (err?.code !== 'ENOENT')
        console.warn(`Warning: could not access artist dir ${artistDirDefault}`);
    }

    // 3) By-genre (fallback scan) if not explicitly disabled, for backward-compat
    if (!opts?.byGenre) {
      const genreDirents = await fs
        .readdir(baseDir, { withFileTypes: true })
        .catch(() => [] as Array<{ name: string; isDirectory: () => boolean }>);
      const genres = genreDirents
        .filter((d) => d && typeof d.isDirectory === 'function' && d.isDirectory())
        .map((d) => d.name);
      for (const g of genres) {
        const artistDir = path.join(baseDir, g, artistDirName);
        try {
          const entries = await fs.readdir(artistDir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isFile()) continue;
            if (titleRegex.test(e.name)) return path.join(artistDir, e.name);
          }
        } catch (err) {
          if (err?.code !== 'ENOENT') {
            console.warn(`Warning: could not access artist dir ${artistDir}`);
          }
        }
      }
    }
  } catch {
    console.warn('Warning: could not access organised AIFF base dir');
  }
  return null;
}
