#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseCliArgs } from './parseCliArgs.js';

import pLimit from 'p-limit';
import { makeBaseParts } from './normalize.js';
import { buildQueries } from './queryBuilders.js';
import { runQobuzLuckyStrict } from './qobuzRunner.js';


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
  return /\s-\s/.test(line.trim());
}

export async function main() {
  const { file, dir, concurrency, dry } = parseCliArgs(process.argv);
  if (!dir) throw new Error('--dir is required so we can verify files were actually written');

  const limit = pLimit(concurrency);
  const tasks = [];

  for await (const raw of lineStream(file)) {
    const line = raw.trim();
    if (!line || !validLine(line)) continue;

    const base = makeBaseParts(line);
    const candidates = buildQueries(base);

    tasks.push(limit(async () => {
      console.log(`>>> ${line}`);

      // try each candidate; per-candidate: q=6, then q=5
      let matched = false;

      for (const q of candidates) {
        // Lossless
        const res6 = (await runQobuzLuckyStrict(q, { directory: dir, quality: 6, dryRun: dry })) || {};
        if (dry) {
          console.log(`  [dry-run] ${res6.cmd || ''}`);
          console.log(`  ✓ would try lossless first for: ${q}`);
          matched = true;
          break; // in dry-run we stop at first planned candidate
        }
        if (res6.ok) {
          console.log(`  ✓ matched (lossless) via: ${q}`);
          for (const p of res6.added) console.log(`    → ${p}`);
          matched = true;
          break;
        }

        // 320 fallback
        const res5 = await runQobuzLuckyStrict(q, { directory: dir, quality: 5, dryRun: false });
        if (res5.ok) {
          console.log(`  ✓ matched (320) via: ${q}`);
          for (const p of res5.added) console.log(`    → ${p}`);
          matched = true;
          break;
        } else {
          // brief tail for debugging
          const tail = (res5.stderr || res5.stdout || '').split('\n').slice(-4).join('\n');
          console.log(`  · candidate failed: ${q}\n${tail ? '    └─ tail:\n' + indent(tail, 6) : ''}`);
        }
      }

      if (!matched && !dry) console.log('  ✗ no candidate matched.');
    }));
  }

  await Promise.all(tasks);
}

function indent(s, n = 2) {
  const pad = ' '.repeat(n);
  return (s || '').split('\n').map(l => pad + l).join('\n');
}

export default main;

// Only run when executed directly, not when imported by tests or other modules.
// Some environments (Jest + Babel) don't support `import.meta`. Use a pragmatic check
// based on process.argv[1] containing the script filename.
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('runLuckyForTracklist.js')) {
  main().catch(e => {
    console.error(e?.message || String(e));
    process.exit(1);
  });
}
