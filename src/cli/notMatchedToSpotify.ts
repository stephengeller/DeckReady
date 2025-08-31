import fs from 'node:fs/promises';
import path from 'node:path';
import { parseLog, writeOutputs } from '../lib/notMatched';

function usage(): never {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Usage: ts-node src/cli/notMatchedToSpotify.ts <path_to_not-matched.log> [--out <prefix>] [--format all|txt|md|html]',
      '',
      'Reads not-matched.log and produces human-friendly files for manual playlist creation:',
      '  - <prefix>.txt       Lines like: Artist - Title',
      '  - <prefix>.urls.txt  One Spotify search URL per line',
      '  - <prefix>.md        Markdown checklist with links',
      '  - <prefix>.html      HTML page with links (open and middle-click to add)',
    ].join('\n'),
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let file: string | null = null;
  let outPrefix: string | null = null;
  let format: 'all' | 'txt' | 'md' | 'html' = 'all';

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--out') outPrefix = argv[++i] || null;
    else if (a === '--format') {
      const f = (argv[++i] || '').toLowerCase();
      if (f === 'txt' || f === 'md' || f === 'html' || f === 'all') format = f;
      else usage();
    } else if (a === '--help' || a === '-h') usage();
    else if (!a.startsWith('--') && !file) file = a;
  }
  if (!file) usage();

  let finalOut = outPrefix || '';
  if (!finalOut) {
    // Default to repo-local logs directory (gitignored): logs/spotify-not-matched/<timestamp>
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const stamp =
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    finalOut = path.join(process.cwd(), 'logs', 'spotify-not-matched', stamp);
  }
  return { file, out: finalOut, format };
}

async function main() {
  const { file, out, format } = parseArgs(process.argv);
  const raw = await fs.readFile(file as string, 'utf8').catch(() => '');
  if (!raw) {
    // eslint-disable-next-line no-console
    console.error('Could not read not-matched.log at: ' + file);
    process.exit(1);
  }

  const items = parseLog(raw);
  if (items.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No items parsed from not-matched.log');
    return;
  }

  await writeOutputs(items, out, format);
  // eslint-disable-next-line no-console
  console.log(`Wrote outputs with prefix: ${out}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e?.message || e);
  process.exit(1);
});
