#!/usr/bin/env node
import { parseCliArgs } from '../parseCliArgs';
import { runQobuzDl } from '../qobuzRunner';

async function main() {
  const { file, dir, dry, quiet, verbose, progress } = parseCliArgs(process.argv);
  const url = file;
  if (!url) throw new Error('Usage: qobuzDl <qobuz_url> --dir <output> [--dry]');
  if (!/qobuz\.com\//i.test(url)) throw new Error('Not a Qobuz URL');
  if (!dir) throw new Error('--dir is required');
  const quality = Number(process.env.QUALITY || 6) || 6;
  const res = await runQobuzDl(url, {
    directory: dir,
    quality,
    dryRun: dry,
    quiet: quiet && !verbose,
    progress,
  });

  // Print a brief summary
  if (res.dry) return;
  if (res.ok) {
    console.log(`Downloaded ${res.added.length} file(s) from URL.`);
    for (const p of res.added) console.log(`  → ${p}`);
  } else if (res.already) {
    console.log('Already downloaded (no new files).');
  } else {
    console.error('qobuz-dl failed.');
    process.exit(res.code || 1);
  }
}

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});
