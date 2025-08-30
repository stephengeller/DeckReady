import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseCliArgs } from './parseCliArgs';
import { setColorEnabled, green, yellow, red, magenta, cyan, isTTY, dim } from './ui/colors';
// Load environment variables from .env
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from './env';
void SPOTIFY_CLIENT_ID;
void SPOTIFY_CLIENT_SECRET;

import { makeBaseParts } from './normalize';
import { buildQueries } from './queryBuilders';
import { runQobuzLuckyStrict, findOrganisedAiff } from './qobuzRunner';
import { createSpinner } from './ui/spinner';

// Yield input lines either from a file path or stdin
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

// Accept only "Title - Artist" style lines (simple guard)
const isTrackLine = (line: string) => /\s-\s/.test(line.trim());

export async function main() {
  const {
    file,
    dir,
    dry,
    quiet: quietArg,
    verbose,
    noColor,
    summaryOnly,
    json,
  } = parseCliArgs(process.argv);
  if (noColor) setColorEnabled(false);
  const quiet = quietArg && !verbose; // verbose overrides quiet
  if (!dir) throw new Error('--dir is required so we can verify files were actually written');

  let matchedCount = 0;
  let alreadyCount = 0;
  let mismatchCount = 0;
  let notFoundCount = 0;

  for await (const raw of lineStream(file)) {
    const line = raw.trim();
    if (!line || !isTrackLine(line)) continue;

    const parts = makeBaseParts(line);
    const candidateQueries = buildQueries(parts);

    // Short-circuit: if a matching AIFF already exists under ORGANISED_AIFF_DIR, skip qobuz-dl
    let alreadyOrganisedPath: string | null = null;
    try {
      if (typeof findOrganisedAiff === 'function') {
        alreadyOrganisedPath = await findOrganisedAiff(parts.primArtist, parts.title);
      }
    } catch {
      // in tests, module mocks may omit findOrganisedAiff; ignore
    }
    if (alreadyOrganisedPath) {
      if (!summaryOnly) console.log(`  ${yellow('↺')} already organised: ${alreadyOrganisedPath}`);
      alreadyCount += 1;
      continue;
    }

    if (!summaryOnly) console.log(cyan(`>>> ${line}`));

    // try each candidate; per-candidate: q=6, then q=5
    let didMatch = false;
    let hadMismatch = false;
    const seenMismatchKeys = new Set<string>();

    const spinner = createSpinner(isTTY() && !verbose && !summaryOnly);

    for (const candidateQuery of candidateQueries) {
      // Lossless
      spinner.start('downloading');
      const losslessResult = await runQobuzLuckyStrict(candidateQuery, {
        directory: dir,
        quality: 6,
        dryRun: dry,
        quiet,
        artist: parts.primArtist,
        title: parts.title,
        progress: false,
        onProgress: undefined,
      });
      spinner.stop();
      if (dry) {
        console.log(`  [dry-run] ${losslessResult?.cmd || ''}`);
        console.log(`  ✓ would try lossless first for: ${candidateQuery}`);
        didMatch = true;
        break; // in dry-run we stop at first planned candidate
      }
      if (losslessResult?.ok) {
        if (!summaryOnly) console.log(`  ${green('✓')} matched (lossless) via: ${candidateQuery}`);
        if (!summaryOnly)
          for (const p of losslessResult?.added || []) console.log(`    ${dim('→')} ${p}`);
        didMatch = true;
        matchedCount += 1;
        break;
      } else if (losslessResult?.already) {
        if (!summaryOnly)
          console.log(`  ${yellow('↺')} already downloaded (lossless) via: ${candidateQuery}`);
        didMatch = true;
        alreadyCount += 1;
        break;
      }
      if (losslessResult?.mismatch) {
        const key6 = `${losslessResult.mismatch.artistNorm}|${losslessResult.mismatch.titleNorm}`;
        seenMismatchKeys.add(key6);
        // Stop trying further candidates for this track after the first wrong match
        if (!summaryOnly)
          console.log(`  ${magenta('·')} wrong match (lossless); stopping search for this track.`);
        mismatchCount += 1;
        hadMismatch = true;
        break;
      }

      // 320 fallback
      spinner.start('downloading');
      const bitrate320Result = await runQobuzLuckyStrict(candidateQuery, {
        directory: dir,
        quality: 5,
        dryRun: false,
        quiet,
        artist: parts.primArtist,
        title: parts.title,
      });
      // Ensure we always stop the spinner for the 320 fallback as well
      spinner.stop();
      if (bitrate320Result?.ok) {
        if (!summaryOnly) console.log(`  ${green('✓')} matched (320) via: ${candidateQuery}`);
        if (!summaryOnly)
          for (const p of bitrate320Result?.added || []) console.log(`    ${dim('→')} ${p}`);
        didMatch = true;
        matchedCount += 1;
        break;
      } else {
        // If the 320 fallback produced the same wrong track as lossless, stop trying more candidates.
        if (bitrate320Result?.mismatch) {
          const key5 = `${bitrate320Result.mismatch.artistNorm}|${bitrate320Result.mismatch.titleNorm}`;
          if (seenMismatchKeys.has(key5)) {
            console.log(
              '  · duplicate wrong match encountered; stopping further attempts for this track.',
            );
            break;
          }
          seenMismatchKeys.add(key5);
          hadMismatch = true;
        }
        if (verbose && !summaryOnly) {
          // brief tail for debugging (verbose only)
          const tail = (bitrate320Result?.stderr || bitrate320Result?.stdout || '')
            .split('\n')
            .slice(-4)
            .join('\n');
          console.log(`  ${magenta('·')} candidate failed: ${candidateQuery}`);
          if (tail) console.log('    └─ tail:\n' + indent(tail, 6));
        }
      }
    }

    if (!didMatch) {
      if (!dry) {
        if (!summaryOnly) console.log(`  ${red('✗')} no candidate matched.`);
        if (!hadMismatch) {
          const nf = path.join(dir, 'not-found.log');
          fs.appendFileSync(nf, `${line}\n`);
          if (!summaryOnly) console.log(`  ${dim('↪')} appended to ${nf}`);
          notFoundCount += 1;
        }
      } else {
        if (!summaryOnly) console.log(`  ${red('✗')} no candidate matched (dry-run).`);
      }
    }
  }

  // Print final summary (quiet-friendly)
  if (json) {
    const summary = {
      matched: matchedCount,
      already: alreadyCount,
      mismatched: mismatchCount,
      notFound: notFoundCount,
      logs: { notMatched: '<dir>/not-matched.log', notFound: '<dir>/not-found.log' },
    };
    console.log(JSON.stringify(summary));
  } else {
    console.log('');
    console.log('Summary:');
    console.log(`  ${green('✓')} matched: ${matchedCount}`);
    console.log(`  ${yellow('↺')} already: ${alreadyCount}`);
    console.log(`  ${red('✗')} mismatched: ${mismatchCount}`);
    console.log(`  Ø not found: ${notFoundCount}`);
    console.log('  Logs:');
    console.log('    not-matched: <dir>/not-matched.log');
    console.log('    not-found:   <dir>/not-found.log');
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
