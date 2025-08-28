#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseCliArgs } from './parseCliArgs';
// Load environment variables from .env
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from './env';
void SPOTIFY_CLIENT_ID;
void SPOTIFY_CLIENT_SECRET;

import { makeBaseParts } from './normalize';
import { buildQueries } from './queryBuilders';
import { runQobuzLuckyStrict } from './qobuzRunner';

async function* lineStream(file: string | null) {
  if (file) {
    const abs = path.resolve(file);
    const rl = readline.createInterface({ input: fs.createReadStream(abs), crlfDelay: Infinity });
    for await (const line of rl) yield line;
  } else {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) yield line;
  }
}

function validLine(line: string) {
  return /\s-\s/.test(line.trim());
}

export async function main() {
  const { file, dir, dry, quiet } = parseCliArgs(process.argv);
  if (!dir) throw new Error('--dir is required so we can verify files were actually written');

  for await (const raw of lineStream(file)) {
    const line = raw.trim();
    if (!line || !validLine(line)) continue;

    const base = makeBaseParts(line);
    const candidates = buildQueries(base);

    console.log(`>>> ${line}`);

    // try each candidate; per-candidate: q=6, then q=5
    let matched = false;
    const seenMismatches = new Set<string>();

    for (const q of candidates) {
      // Lossless
      const res6 = await runQobuzLuckyStrict(q, {
        directory: dir,
        quality: 6,
        dryRun: dry,
        quiet,
        artist: base.primArtist,
        title: base.title,
      });
      if (dry) {
        console.log(`  [dry-run] ${res6?.cmd || ''}`);
        console.log(`  ✓ would try lossless first for: ${q}`);
        matched = true;
        break; // in dry-run we stop at first planned candidate
      }
      if (res6?.ok) {
        console.log(`  ✓ matched (lossless) via: ${q}`);
        for (const p of res6?.added || []) console.log(`    → ${p}`);
        matched = true;
        break;
      }
      if (res6?.mismatch) {
        const key6 = `${res6.mismatch.artistNorm}|${res6.mismatch.titleNorm}`;
        seenMismatches.add(key6);
      }

      // 320 fallback
      const res5 = await runQobuzLuckyStrict(q, {
        directory: dir,
        quality: 5,
        dryRun: false,
        quiet,
        artist: base.primArtist,
        title: base.title,
      });
      if (res5?.ok) {
        console.log(`  ✓ matched (320) via: ${q}`);
        for (const p of res5?.added || []) console.log(`    → ${p}`);
        matched = true;
        break;
      } else {
        // If the 320 fallback produced the same wrong track as lossless, stop trying more candidates.
        if (res5?.mismatch) {
          const key5 = `${res5.mismatch.artistNorm}|${res5.mismatch.titleNorm}`;
          if (seenMismatches.has(key5)) {
            console.log('  · duplicate wrong match encountered; stopping further attempts for this track.');
            break;
          }
          seenMismatches.add(key5);
        }
        // brief tail for debugging
        const tail = (res5?.stderr || res5?.stdout || '').split('\n').slice(-4).join('\n');
        console.log(
          `  · candidate failed: ${q}\n${tail ? '    └─ tail:\n' + indent(tail, 6) : ''}`,
        );
      }
    }

    if (!matched) {
      if (!dry) {
        console.log('  ✗ no candidate matched.');
        const nf = path.join(dir, 'not-found.log');
        fs.appendFileSync(nf, `${line}\n`);
        console.log(`  ↪ appended to ${nf}`);
      } else {
        console.log('  ✗ no candidate matched (dry-run).');
      }
    }
  }
}

function indent(s: string | undefined | null, n = 2) {
  const pad = ' '.repeat(n);
  return (s || '')
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

export default main;

// Only run when executed directly, not when imported by tests or other modules.
// Some environments (Jest + Babel) don't support `import.meta`. Use a pragmatic check
// based on process.argv[1] containing the script filename.
if (
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith('runLuckyForTracklist.ts')
) {
  main().catch((e) => {
    console.error(e?.message || String(e));
    process.exit(1);
  });
}
