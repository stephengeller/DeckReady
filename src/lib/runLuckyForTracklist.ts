import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseCliArgs } from './parseCliArgs';
import { setColorEnabled, green, yellow, red, magenta, cyan, isTTY, dim } from './ui/colors';
// Load environment variables from .env
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_USER_TOKEN } from './env';
void SPOTIFY_CLIENT_ID;
void SPOTIFY_CLIENT_SECRET;

import { makeBaseParts } from './normalize';
import { buildQueries } from './queryBuilders';
import { runQobuzLuckyStrict, findOrganisedAiff } from './qobuzRunner';
import { createSpinner } from './ui/spinner';
import { createPlaylistFromProblemLines } from './spotifyApi';

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
  const notFoundLines: string[] = [];
  const notMatchedLines: string[] = [];

  for await (const raw of lineStream(file)) {
    const line = raw.trim();
    if (!line || !validLine(line)) continue;

    const base = makeBaseParts(line);
    const candidates = buildQueries(base);

    // Short-circuit: if a matching AIFF already exists under ORGANISED_AIFF_DIR, skip qobuz-dl
    let existing: string | null = null;
    try {
      if (typeof findOrganisedAiff === 'function') {
        existing = await findOrganisedAiff(base.primArtist, base.title);
      }
    } catch {
      // in tests, module mocks may omit findOrganisedAiff; ignore
    }
    if (existing) {
      if (!summaryOnly) console.log(`  ${yellow('↺')} already organised: ${existing}`);
      alreadyCount += 1;
      continue;
    }

    if (!summaryOnly) console.log(cyan(`>>> ${line}`));

    // try each candidate; per-candidate: q=6, then q=5
    let matched = false;
    let hadMismatch = false;
    const seenMismatches = new Set<string>();

    const spinner = createSpinner(isTTY() && !verbose && !summaryOnly);

    for (const q of candidates) {
      // Lossless
      spinner.start('downloading');
      const res6 = await runQobuzLuckyStrict(q, {
        directory: dir,
        quality: 6,
        dryRun: dry,
        quiet,
        artist: base.primArtist,
        title: base.title,
        progress: false,
        onProgress: undefined,
      });
      spinner.stop();
      if (dry) {
        console.log(`  [dry-run] ${res6?.cmd || ''}`);
        console.log(`  ✓ would try lossless first for: ${q}`);
        matched = true;
        break; // in dry-run we stop at first planned candidate
      }
      if (res6?.ok) {
        if (!summaryOnly) console.log(`  ${green('✓')} matched (lossless) via: ${q}`);
        if (!summaryOnly) for (const p of res6?.added || []) console.log(`    ${dim('→')} ${p}`);
        matched = true;
        matchedCount += 1;
        break;
      } else if (res6?.already) {
        if (!summaryOnly) console.log(`  ${yellow('↺')} already downloaded (lossless) via: ${q}`);
        matched = true;
        alreadyCount += 1;
        break;
      }
      if (res6?.mismatch) {
        const key6 = `${res6.mismatch.artistNorm}|${res6.mismatch.titleNorm}`;
        seenMismatches.add(key6);
        // Stop trying further candidates for this track after the first wrong match
        if (!summaryOnly)
          console.log(`  ${magenta('·')} wrong match (lossless); stopping search for this track.`);
        mismatchCount += 1;
        hadMismatch = true;
        break;
      }

      // 320 fallback
      spinner.start('downloading');
      const res5 = await runQobuzLuckyStrict(q, {
        directory: dir,
        quality: 5,
        dryRun: false,
        quiet,
        artist: base.primArtist,
        title: base.title,
      });
      // Ensure we always stop the spinner for the 320 fallback as well
      spinner.stop();
      if (res5?.ok) {
        if (!summaryOnly) console.log(`  ${green('✓')} matched (320) via: ${q}`);
        if (!summaryOnly) for (const p of res5?.added || []) console.log(`    ${dim('→')} ${p}`);
        matched = true;
        matchedCount += 1;
        break;
      } else {
        // If the 320 fallback produced the same wrong track as lossless, stop trying more candidates.
        if (res5?.mismatch) {
          const key5 = `${res5.mismatch.artistNorm}|${res5.mismatch.titleNorm}`;
          if (seenMismatches.has(key5)) {
            console.log(
              '  · duplicate wrong match encountered; stopping further attempts for this track.',
            );
            break;
          }
          seenMismatches.add(key5);
          hadMismatch = true;
        }
        if (verbose && !summaryOnly) {
          // brief tail for debugging (verbose only)
          const tail = (res5?.stderr || res5?.stdout || '').split('\n').slice(-4).join('\n');
          console.log(`  ${magenta('·')} candidate failed: ${q}`);
          if (tail) console.log('    └─ tail:\n' + indent(tail, 6));
        }
      }
    }

    if (!matched) {
      if (!dry) {
        if (!summaryOnly) console.log(`  ${red('✗')} no candidate matched.`);
        if (!hadMismatch) {
          const nf = path.join(dir, 'not-found.log');
          fs.appendFileSync(nf, `${line}\n`);
          if (!summaryOnly) console.log(`  ${dim('↪')} appended to ${nf}`);
          notFoundCount += 1;
          notFoundLines.push(line);
        }
        if (hadMismatch) notMatchedLines.push(line);
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

  // Optionally create a Spotify playlist with unfound or mismatched tracks
  try {
    const problemLines = Array.from(new Set([...notFoundLines, ...notMatchedLines]));
    if (!dry && problemLines.length > 0 && (SPOTIFY_USER_TOKEN || '').trim()) {
      const { url, added, resolved } = await createPlaylistFromProblemLines(problemLines).catch(
        (e) => {
          console.error(
            'Failed to create Spotify playlist for unfound tracks:',
            e?.message || String(e),
          );
          return { url: '', added: 0, resolved: 0 };
        },
      );
      if (url && !summaryOnly) {
        console.log('');
        console.log(
          `Created Spotify playlist for unresolved tracks (${added}/${problemLines.length} added):`,
        );
        console.log(`  ${url}`);
        if (resolved < problemLines.length) {
          console.log(
            `  Note: ${problemLines.length - resolved} items could not be resolved on Spotify search.`,
          );
        }
      }
    }
  } catch (e) {
    console.error('Error during Spotify playlist creation:', e?.message || String(e));
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
