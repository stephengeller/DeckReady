import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export type Item = { artist: string; title: string };

/** Parse a single log line and return the expected artist/title, or null. */
export function parseLine(line: string): Item | null {
  if (!line || !line.trim()) return null;
  // Prefer a delimiter-aware capture that stops at the sequence " found=
  let expected = '';
  const mDelim = line.match(/expected="([\s\S]*?)"\s+found=/);
  if (mDelim) expected = mDelim[1];
  if (!expected) {
    // Fallback: naive capture to the next quote
    const mSimple = line.match(/expected="([^"]*)"/);
    if (mSimple) expected = mSimple[1];
  }
  expected = (expected || '').trim();
  if (!expected) return null;
  const idx = expected.indexOf(' - ');
  if (idx === -1) return null;
  const artist = expected.slice(0, idx).trim();
  const title = expected.slice(idx + 3).trim();
  if (!artist || !title) return null;
  return { artist, title };
}

export function spotifySearchUrl({ artist, title }: Item): string {
  const query = `artist:"${artist}" track:"${title}"`;
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

/** Parse the full log content into a de-duplicated list of items. */
export function parseLog(content: string): Item[] {
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const line of (content || '').split(/\r?\n/)) {
    const it = parseLine(line);
    if (!it) continue;
    const key = `${it.artist}\u0001${it.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }
  return items;
}

/** Resolve the not-matched.log path using CLI-like heuristics. */
export function resolveLogPath({ dir, log }: { dir?: string | null; log?: string | null }) {
  if (log) return log;
  if (dir) return path.join(dir, 'not-matched.log');
  // Environment override: QOBUZ_DL_DIR=/path/to/qobuz-dl outputs
  const envDir = process.env.QOBUZ_DL_DIR;
  if (envDir) return path.join(envDir, 'not-matched.log');
  const lastRunCopy = path.join(process.cwd(), 'logs', 'last-run', 'not-matched.log');
  const cwdDefault = path.join(process.cwd(), 'not-matched.log');
  return fsSync.existsSync(lastRunCopy) ? lastRunCopy : cwdDefault;
}

/** Write outputs (txt, md, html, urls) for manual Spotify playlist creation. */
export async function writeOutputs(
  items: Item[],
  outPrefix: string,
  format: 'all' | 'txt' | 'md' | 'html' = 'all',
) {
  await fs.mkdir(path.dirname(outPrefix), { recursive: true }).catch(() => {});

  const parts: Array<Promise<unknown>> = [];
  if (format === 'all' || format === 'txt') {
    const txt = items.map((i) => `${i.artist} - ${i.title}`).join('\n') + '\n';
    parts.push(fs.writeFile(`${outPrefix}.txt`, txt, 'utf8'));
    const urls = items.map((i) => spotifySearchUrl(i)).join('\n') + '\n';
    parts.push(fs.writeFile(`${outPrefix}.urls.txt`, urls, 'utf8'));
  }
  if (format === 'all' || format === 'md') {
    const mdLines = items
      .map((i) => `- [${i.artist} — ${i.title}](${spotifySearchUrl(i)})`)
      .join('\n');
    const md = `# Not matched — Spotify search links\n\n${mdLines}\n`;
    parts.push(fs.writeFile(`${outPrefix}.md`, md, 'utf8'));
  }
  if (format === 'all' || format === 'html') {
    const links = items
      .map(
        (i) =>
          `<li><a target="_blank" rel="noopener noreferrer" href="${spotifySearchUrl(i)}">${
            i.artist
          } — ${i.title}</a></li>`,
      )
      .join('\n');
    const html = `<!doctype html>
<meta charset="utf-8" />
<title>Not matched — Spotify search</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
  li { margin: 6px 0; }
  a { text-decoration: none; color: #0b69ff; }
  a:hover { text-decoration: underline; }
  .hint { color: #666; margin-bottom: 12px; }
</style>
<div class="hint">Open each link, play a few seconds to verify, then add to your playlist in Spotify UI.</div>
<ol>
${links}
</ol>
`;
    parts.push(fs.writeFile(`${outPrefix}.html`, html, 'utf8'));
  }
  await Promise.all(parts);
}
