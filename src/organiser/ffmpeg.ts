import fs from 'node:fs/promises';
import { spawnStreaming } from '../lib/proc';
import type { Runner } from '../lib/tags';

export function buildMetaArgs(tags: Record<string, string | undefined>): string[] {
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
  return metaArgs;
}

export function buildConvertArgs(
  inputPath: string,
  coverPath: string | null,
  codec: string,
  metaArgs: string[],
  outPath: string,
): string[] {
  if (coverPath) {
    return [
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
      outPath,
    ];
  }
  return [
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
    outPath,
  ];
}

export async function verifyAndInjectAiffTags(
  destPath: string,
  tags: Record<string, string | undefined>,
  runner?: Runner,
  quiet = true,
) {
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
      : await spawnStreaming('ffprobe', checkArgs, { quiet });
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
        : await spawnStreaming('ffmpeg', injectArgs, { quiet });
      if (inj.code === 0) {
        await fs.rename(outTmp, destPath);
        if (!quiet) console.log(`Metadata injected into AIFF: ${destPath}`);
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
}
