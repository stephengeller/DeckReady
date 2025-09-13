#!/usr/bin/env node
import { parseCliArgs } from '../parseCliArgs';
import { runQobuzDl } from '../qobuzRunner';
import { createSpinner } from '../lib/ui/spinner';
import { isTTY, cyan, green, yellow, dim } from '../lib/ui/colors';

async function main() {
  const {
    file,
    dir,
    dry,
    verbose,
    progress,
    byGenre,
    flacOnly,
    quality: qualityArg,
  } = parseCliArgs(process.argv);
  const url = file;
  if (!url) throw new Error('Usage: qobuzDl <qobuz_url> --dir <output> [--dry]');
  if (!/qobuz\.com\//i.test(url)) throw new Error('Not a Qobuz URL');
  if (!dir) throw new Error('--dir is required');
  const quality =
    typeof qualityArg === 'number' && qualityArg > 0
      ? qualityArg
      : Number(process.env.QUALITY || 6) || 6;

  const useSpinner = isTTY() && !verbose;
  const spinner = createSpinner(useSpinner);
  let currentLabel = '';
  let lastLabel = '';
  let totalInQueue: number | null = null;
  let indexInQueue = 0;

  if (!dry) console.log(cyan(`Starting Qobuz downloads for: ${url}`));

  spinner.start('downloading');
  const userQuiet = process.argv.includes('--quiet');
  const res = await runQobuzDl(url, {
    directory: dir,
    quality,
    dryRun: dry,
    // Show our own runner logs (like "↺ already organised") unless the user explicitly asks for --quiet.
    quiet: userQuiet,
    progress: useSpinner || progress,
    byGenre,
    flacOnly,
    onProgress: ({ raw, percent }) => {
      // Total items in queue
      const q = /([0-9]+)\s+downloads? in queue/i.exec(raw);
      if (q) totalInQueue = Number(q[1]);

      // Active track label
      const m = /^Downloading:\s+(.+)$/m.exec(raw);
      if (m && m[1]) {
        currentLabel = m[1];
        if (currentLabel && currentLabel !== lastLabel) {
          indexInQueue += 1;
          lastLabel = currentLabel;
        }
      }

      const left = totalInQueue ? `${indexInQueue}/${totalInQueue} ` : '';
      const pct = typeof percent === 'number' ? ` ${percent}%` : '';
      const main = currentLabel ? `${currentLabel}${pct}` : `downloading${pct}`;
      const txt = `${left}${main}`;
      spinner.setText(dim(txt));
    },
  });
  spinner.stop();

  // Print a brief summary
  if (res.dry) return;
  if (res.ok) {
    console.log(`  ${green('✓')} downloaded ${res.added.length} file(s).`);
    for (const p of res.added) console.log(`    ${dim('→')} ${p}`);
  } else if (res.already) {
    console.log(`  ${yellow('↺')} already downloaded (no new files).`);
  } else {
    console.error('qobuz-dl failed.');
    process.exit(res.code || 1);
  }
}

main().catch((e) => {
  console.error(e?.message || String(e));
  process.exit(1);
});
