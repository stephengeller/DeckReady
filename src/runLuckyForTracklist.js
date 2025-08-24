#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pLimit from 'p-limit';
import { makeBaseParts } from './normalize.js';
import { buildQueries } from './queryBuilders.js';
import { runQobuzLucky } from './qobuzRunner.js';

/**
 * Usage examples:
 *   cat tracks.txt | run-lucky --dir "~/Music/qobuz-dl" --concurrency 3
 *   run-lucky tracks.txt --dry
 *
 * tracks.txt lines: "Song Title - Artist 1, Artist 2"
 */

function parseArgs(argv) {
  const out = {
    file: null,
    dir: null,
    concurrency: 3,
    dry: false,
    quality: 6
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--dry') out.dry = true;
    else if (a === '--dir') out.dir = argv[++i];
    else if (a === '--concurrency') out.concurrency = Number(argv[++i] || 3);
    else if (a === '--quality') out.quality = Number(argv[++i] || 6);
    else if (!a.startsWith('--') && !out.file) out.file = a;
  }
  return out;
}

async function* lineStream(file) {
  if (file) {
    const abs = path.resolve(file);
    const rl = readline.createInterface({ input: fs.createReadStream(abs), crlfDelay: Infinity });
    for await (const line of rl) yield line;
  } else {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) yield line;
  }
}

function validLine(line) {
  // Basic guard: must contain " - "
  return /\s-\s/.test(line.trim());
}

async function main() {
  const { file, dir, concurrency, dry, quality } = parseArgs(process.argv);

  const limit = pLimit(concurrency);
  const tasks = [];

  for await (const raw of lineStream(file)) {
    const line = raw.trim();
    if (!line || !validLine(line)) continue;

    const base = makeBaseParts(line);
    const candidates = buildQueries(base);

    tasks.push(limit(async () => {
      const header = `>>> ${line}`;
      console.log(header);

      // Try candidates in order until one succeeds (exit code 0)
      for (const q of candidates) {
        const res = await runQobuzLucky(q, {
          directory: dir,
          quality,
          number: 1,
          type: 'track',
          embedArt: true,
          smart: true,
          dryRun: dry
        });

        if (dry) {
          console.log(`  [dry-run] ${res.cmd}`);
          // In dry-run, “success” is just that we produced a command; try only the first candidate
          break;
        }

        // qobuz-dl returns 0 on success; output usually contains chosen item
        if (res.code === 0) {
          console.log(`  ✓ matched via: ${q}`);
          // Optional: write a small mark file or log here
          return;
        } else {
          // Non-zero; show a brief reason for visibility
          const snippet = (res.stderr || res.stdout || '').split('\n').slice(-5).join('\n');
          console.log(`  · candidate failed: ${q}\n    └─ tail:\n${indent(snippet, 6)}`);
        }
      }

      console.log('  ✗ no candidate matched.');
    }));
  }

  await Promise.all(tasks);
}

function indent(s, n = 2) {
  const pad = ' '.repeat(n);
  return (s || '').split('\n').map(l => pad + l).join('\n');
}

main().catch(e => {
  console.error(e?.message || String(e));
  process.exit(1);
});