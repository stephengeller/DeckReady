import fs from 'node:fs';
import path from 'node:path';
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
import { lineStream, isTrackLine } from '../tracklist/io';
import { indent } from '../tracklist/text';
import { persistLastRunLogs } from '../tracklist/logs';

/** Main entrypoint for processing a tracklist with qobuz-dl and organising output. */
export async function main() {
  const {
    file,
    dir,
    dry,
    quiet: quietArg,
    verbose,
    noColor,
    byGenre,
    flacOnly,
    quality: qualityArg,
    inputOrder,
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

    const parts = makeBaseParts(line, { preferredOrder: inputOrder });
    const candidateQueries = buildQueries(parts);

    // Short-circuit: if a matching AIFF already exists, skip qobuz-dl (unless --flac-only)
    if (!flacOnly) {
      let alreadyOrganisedPath: string | null = null;
      try {
        if (typeof findOrganisedAiff === 'function') {
          alreadyOrganisedPath = await findOrganisedAiff(parts.primArtist, parts.title, {
            byGenre,
          });
        }
      } catch {
        // in tests, module mocks may omit findOrganisedAiff; ignore
      }
      if (alreadyOrganisedPath) {
        console.log(`  ${yellow('↺')} already organised: ${alreadyOrganisedPath}`);
        alreadyCount += 1;
        continue;
      }
    }

    console.log(cyan(`>>> ${line}`));

    // try each candidate; per-candidate: q=6, then q=5
    let didMatch = false;
    let hadMismatch = false;
    const seenMismatchKeys = new Set<string>();

    const spinner = createSpinner(isTTY() && !verbose);

    for (const candidateQuery of candidateQueries) {
      // Primary attempt (default q=6 unless overridden by --quality)
      spinner.start('downloading');
      const primaryQuality = typeof qualityArg === 'number' && qualityArg > 0 ? qualityArg : 6;
      const losslessResult = await runQobuzLuckyStrict(candidateQuery, {
        directory: dir,
        quality: primaryQuality,
        dryRun: dry,
        quiet,
        artist: parts.primArtist,
        title: parts.title,
        progress: false,
        onProgress: undefined,
        byGenre,
        flacOnly,
      });
      spinner.stop();
      if (dry) {
        console.log(`  [dry-run] ${losslessResult?.cmd || ''}`);
        console.log(`  ✓ would try lossless first for: ${candidateQuery}`);
        didMatch = true;
        break; // in dry-run we stop at first planned candidate
      }
      if (losslessResult?.ok) {
        const label = primaryQuality === 6 ? 'lossless' : `q=${primaryQuality}`;
        console.log(`  ${green('✓')} matched (${label}) via: ${candidateQuery}`);
        for (const p of losslessResult?.added || []) console.log(`    ${dim('→')} ${p}`);
        didMatch = true;
        matchedCount += 1;
        break;
      } else if (losslessResult?.already) {
        const label = primaryQuality === 6 ? 'lossless' : `q=${primaryQuality}`;
        console.log(`  ${yellow('↺')} already downloaded (${label}) via: ${candidateQuery}`);
        didMatch = true;
        alreadyCount += 1;
        break;
      }
      if (losslessResult?.mismatch) {
        const key6 = `${losslessResult.mismatch.artistNorm}|${losslessResult.mismatch.titleNorm}`;
        seenMismatchKeys.add(key6);
        // Stop trying further candidates for this track after the first wrong match
        console.log(`  ${magenta('·')} wrong match (lossless); stopping search for this track.`);
        mismatchCount += 1;
        hadMismatch = true;
        break;
      }

      // 320 fallback only if no explicit quality provided
      if (typeof qualityArg === 'number' && qualityArg > 0) continue;
      // 320 fallback
      spinner.start('downloading');
      const bitrate320Result = await runQobuzLuckyStrict(candidateQuery, {
        directory: dir,
        quality: 5,
        dryRun: false,
        quiet,
        artist: parts.primArtist,
        title: parts.title,
        byGenre,
        flacOnly,
      });
      // Ensure we always stop the spinner for the 320 fallback as well
      spinner.stop();
      if (bitrate320Result?.ok) {
        console.log(`  ${green('✓')} matched (320) via: ${candidateQuery}`);
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
        if (verbose) {
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
        console.log(`  ${red('✗')} no candidate matched.`);
        if (!hadMismatch) {
          const nf = path.join(dir, 'not-found.log');
          fs.appendFileSync(nf, `${line}\n`);
          console.log(`  ${dim('↪')} appended to ${nf}`);
          notFoundCount += 1;
        }
      } else {
        console.log(`  ${red('✗')} no candidate matched (dry-run).`);
      }
    }
  }

  // Convenience: persist last run dir and copy summary logs into repo-local logs/last-run
  persistLastRunLogs(dir);

  // Print final summary (quiet-friendly)
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

// indent now sourced from ../tracklist/text

export default main;
