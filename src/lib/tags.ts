import { spawnStreaming } from './proc';

/**
 * A function that executes a command and returns code/stdout/stderr.
 * Used to inject a fake runner in tests.
 */
export type Runner = (
  cmd: string,
  args: string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

function tidyTagValue(value: string): string {
  // Collapse consecutive whitespace so tags don't keep double spaces (e.g. before parentheses)
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Read tags from an audio file via ffprobe.
 * Returns a lowercased key map (e.g. artist, album, title, genre, ...).
 */
export async function readTags(
  inputPath: string,
  runner?: Runner,
): Promise<Record<string, string>> {
  const probeArgs = [
    '-v',
    'quiet',
    '-show_entries',
    'format_tags:stream_tags',
    '-of',
    'default=noprint_wrappers=1:nokey=0',
    inputPath,
  ];
  const probe = runner
    ? await runner('ffprobe', probeArgs)
    : await spawnStreaming('ffprobe', probeArgs, { quiet: true });
  const tags: Record<string, string> = {};
  for (const line of probe.stdout.split(/\r?\n/)) {
    if (!line) continue;
    const pref = line.startsWith('TAG:') ? line.slice(4) : line;
    const eq = pref.indexOf('=');
    if (eq > -1) {
      const k = pref.slice(0, eq).trim();
      const v = tidyTagValue(pref.slice(eq + 1));
      tags[k.toLowerCase()] = v;
    }
  }
  return tags;
}

/** Basic normalisation of a tag value; strips diacritics and lowercases. */
export function normaliseTag(s: string | undefined): string {
  if (!s) return '';
  // Defer to normalize utilities, but keep a simple lowercased normal form here
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Title normalisation that removes trailing remix/edit/version parentheticals,
 * then applies tag normalisation.
 */
export function normaliseTitleBase(s: string | undefined): string {
  if (!s) return '';
  // Repeatedly strip trailing bracketed qualifiers like (feat. X), (Remix), (VIP Mix), (Acoustic), (Remaster), etc.
  // Allow multiple groups at the end (e.g., Title (Remix) (VIP)) to be removed.
  let t = (s || '').trim();
  const tailParenRe =
    /\s*(?:[[(][^\])]*?(?:remix|vip|edit|mix|version|cover|acoustic|remaster|mono|stereo|feat\.?|ft\.?)\b[^\])]*?[\])])+\s*$/i;
  while (tailParenRe.test(t)) {
    t = t.replace(tailParenRe, '').trim();
  }
  const stripped = t;
  return normaliseTag(stripped);
}
