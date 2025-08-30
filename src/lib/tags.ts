import { spawnStreaming } from './proc';

export type Runner = (
  cmd: string,
  args: string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

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
      const v = pref.slice(eq + 1).trim();
      tags[k.toLowerCase()] = v;
    }
  }
  return tags;
}

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

export function normaliseTitleBase(s: string | undefined): string {
  if (!s) return '';
  const stripped = (s || '')
    .replace(/\s*[[(][^\])]*(?:remix|vip|edit|version)[^\])]*[\])]\s*$/i, '')
    .trim();
  return normaliseTag(stripped);
}
