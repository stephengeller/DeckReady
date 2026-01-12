import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCliArgs } from './parseCliArgs';
import { setColorEnabled, green, yellow, red, magenta, cyan, isTTY, dim } from './ui/colors';
// Load environment variables from .env
import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } from './env';
void SPOTIFY_CLIENT_ID;
void SPOTIFY_CLIENT_SECRET;

import { makeBaseParts } from './normalize';
import { buildQueries } from './queryBuilders';
import { runTidalDlStrict, findOrganisedAiff, processDownloadedAudio } from '../tidalRunner';
import { createSpinner } from './ui/spinner';
import { lineStream, isTrackLine } from '../tracklist/io';
import { indent } from '../tracklist/text';
import { persistLastRunLogs } from '../tracklist/logs';
import { walkFiles } from './fsWalk';

/** Map numeric quality values to TIDAL quality names */
function mapQualityToTidal(q?: number | string): 'LOW' | 'HIGH' | 'LOSSLESS' | 'HI_RES_LOSSLESS' {
  if (typeof q === 'string') {
    const upper = q.toUpperCase();
    if (['LOW', 'HIGH', 'LOSSLESS', 'HI_RES_LOSSLESS'].includes(upper)) {
      return upper as 'LOW' | 'HIGH' | 'LOSSLESS' | 'HI_RES_LOSSLESS';
    }
  }
  if (q === 5 || q === '5') return 'HIGH'; // 320kbps
  if (q === 7 || q === '7') return 'HI_RES_LOSSLESS'; // Hi-Res
  return 'LOSSLESS'; // Default (was q=6)
}

/** Main entrypoint for processing a tracklist with tidal-dl-ng and organising output. */
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

  // Use default temp directory if --dir not provided
  const defaultDir = dir || path.join(os.tmpdir(), 'deckready-downloads');

  const resolveUserPath = (input: string) => {
    if (!input) return input;
    if (input.startsWith('~')) {
      const home = os.homedir() || process.env.HOME || '';
      const tail = input.slice(1);
      return path.resolve(path.join(home, tail.startsWith('/') ? tail.slice(1) : tail));
    }
    return path.resolve(input);
  };
  const targetDir = resolveUserPath(defaultDir);
  type SidecarIndexEntry = { available: string[]; stale: string[] };
  type SidecarIndex = Map<string, SidecarIndexEntry>;
  type ExistingReuseInfo = {
    located: string[];
    stale: string[];
    organisedTo: string[];
  };
  let cachedSidecars: SidecarIndex | null = null;
  const loadSidecarIndex = async (): Promise<SidecarIndex> => {
    if (!targetDir) return new Map();
    if (cachedSidecars) return cachedSidecars;
    const index: SidecarIndex = new Map();
    try {
      const files = await walkFiles(targetDir);
      for (const f of files) {
        if (!f.endsWith('.search.txt')) continue;
        try {
          const query = (await fsp.readFile(f, 'utf8')).trim();
          if (!query) continue;
          const audioPath = f.slice(0, -'.search.txt'.length);
          let isFile = false;
          try {
            const st = await fsp.stat(audioPath);
            isFile = st.isFile();
          } catch {
            isFile = false;
          }
          const entry = index.get(query) ?? { available: [], stale: [] };
          if (isFile) entry.available.push(audioPath);
          else entry.stale.push(audioPath);
          index.set(query, entry);
        } catch {
          /* ignore malformed sidecar */
        }
      }
    } catch {
      /* ignore */
    }
    cachedSidecars = index;
    return index;
  };
  const organiseExistingDownload = async (
    query: string,
    trackParts: { primArtist: string; title: string },
  ): Promise<ExistingReuseInfo | null> => {
    if (dry) return null;
    if (!targetDir) return null;
    const sidecars = await loadSidecarIndex();
    const entry = sidecars.get(query);
    if (!entry) return { located: [], stale: [], organisedTo: [] };
    const located = [...entry.available];
    const organisedTo = new Set<string>();
    for (const audioPath of entry.available) {
      if (!flacOnly) {
        // eslint-disable-next-line no-await-in-loop
        await processDownloadedAudio(audioPath, undefined, { quiet, byGenre });
        try {
          // eslint-disable-next-line no-await-in-loop
          const organised = await findOrganisedAiff(trackParts.primArtist, trackParts.title, {
            byGenre,
          });
          if (organised) organisedTo.add(organised);
        } catch {
          /* ignore */
        }
      }
    }
    if (!flacOnly) sidecars.delete(query);
    return {
      located,
      stale: [...entry.stale],
      organisedTo: Array.from(organisedTo),
    };
  };
  const reportExistingDownload = (info: ExistingReuseInfo | null) => {
    if (!info) return false;
    const { located, organisedTo, stale } = info;
    if (located.length > 0) {
      for (const source of located) {
        console.log(`    ${dim('↪ cached download located')}: ${source}`);
      }
    }
    if (organisedTo.length > 0) {
      const seen = new Set<string>();
      for (const dest of organisedTo) {
        if (seen.has(dest)) continue;
        seen.add(dest);
        console.log(`    ${dim('↪ organised to')}: ${dest}`);
      }
    }
    if (stale.length > 0) {
      for (const missing of stale) {
        console.log(`    ${dim('↪ cached search without audio')}: ${missing}`);
      }
    }
    return located.length > 0;
  };

  let matchedCount = 0;
  let alreadyCount = 0;
  let mismatchCount = 0;
  let notFoundCount = 0;

  const printLogHint = (logPath?: string | null, force = false) => {
    if (!quiet && logPath && (verbose || force)) console.log(`    ${dim('↪ log')}: ${logPath}`);
  };

  const printAlreadyHint = () => {
    if (!quiet) {
      console.log(
        `    ${dim('↪')} tidal-dl-ng reported success but no new audio was detected for this candidate.`,
      );
      console.log(
        `    ${dim('↪')} If this is unexpected, check your organised library or rerun with --verbose.`,
      );
    }
  };

  for await (const raw of lineStream(file)) {
    const line = raw.trim();
    if (!line || !isTrackLine(line)) continue;

    const parts = makeBaseParts(line, { preferredOrder: inputOrder });
    const candidateQueries = buildQueries(parts);

    // Short-circuit: if a matching AIFF already exists, skip tidal-dl-ng (unless --flac-only)
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

    // try each candidate; per-candidate: LOSSLESS, then HIGH
    let didMatch = false;
    let hadMismatch = false;
    const seenMismatchKeys = new Set<string>();

    const spinnerEnabled = isTTY() && !verbose;
    const spinner = createSpinner(spinnerEnabled);
    const updateProgress = spinnerEnabled
      ? (info: { percent?: number }) => {
          if (typeof info.percent === 'number') {
            spinner.setText(`downloading ${info.percent}%`);
          }
        }
      : undefined;

    for (const candidateQuery of candidateQueries) {
      // Primary attempt (default LOSSLESS unless overridden by --quality)
      spinner.setText('downloading');
      spinner.start('downloading');
      const primaryQuality = mapQualityToTidal(qualityArg);
      const losslessResult = await runTidalDlStrict(candidateQuery, {
        directory: targetDir,
        quality: primaryQuality,
        dryRun: dry,
        quiet,
        artist: parts.primArtist,
        title: parts.title,
        progress: spinnerEnabled,
        onProgress: updateProgress,
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
      const primaryLabel = primaryQuality === 'LOSSLESS' ? 'lossless' : primaryQuality;
      if (losslessResult?.already) {
        const reuseInfo = await organiseExistingDownload(candidateQuery, parts);
        const reused = !!(reuseInfo && reuseInfo.located.length > 0);
        if (reused) {
          console.log(`  ${yellow('↺')} reused existing (${primaryLabel}) via: ${candidateQuery}`);
          printAlreadyHint();
          printLogHint(losslessResult?.logPath, true);
          reportExistingDownload(reuseInfo);
          didMatch = true;
          alreadyCount += 1;
          break;
        }
        console.log(
          `  ${yellow('⚠')} tidal-dl-ng reported already-downloaded (${primaryLabel}) via: ${candidateQuery}`,
        );
        printAlreadyHint();
        if (reuseInfo) reportExistingDownload(reuseInfo);
        printLogHint(losslessResult?.logPath, true);
        console.log(
          '    ' + dim('↪ No cached download was found. Continuing with other candidates…'),
        );
        continue;
      }
      if (losslessResult?.ok) {
        console.log(`  ${green('✓')} matched (${primaryLabel}) via: ${candidateQuery}`);
        for (const p of losslessResult?.added || []) console.log(`    ${dim('→')} ${p}`);
        didMatch = true;
        matchedCount += 1;
        break;
      }
      if (losslessResult?.mismatch) {
        const key6 = `${losslessResult.mismatch.artistNorm}|${losslessResult.mismatch.titleNorm}`;
        seenMismatchKeys.add(key6);
        // Stop trying further candidates for this track after the first wrong match
        console.log(`  ${magenta('·')} wrong match (lossless); stopping search for this track.`);
        printLogHint(losslessResult?.logPath, true);
        mismatchCount += 1;
        hadMismatch = true;
        break;
      }
      printLogHint(losslessResult?.logPath);

      // HIGH (320kbps) fallback only if no explicit quality provided
      if (qualityArg) continue;
      // HIGH fallback
      spinner.setText('downloading');
      spinner.start('downloading');
      const bitrate320Result = await runTidalDlStrict(candidateQuery, {
        directory: targetDir,
        quality: 'HIGH',
        dryRun: false,
        quiet,
        artist: parts.primArtist,
        title: parts.title,
        progress: spinnerEnabled,
        onProgress: updateProgress,
        byGenre,
        flacOnly,
      });
      // Ensure we always stop the spinner for the 320 fallback as well
      spinner.stop();
      if (bitrate320Result?.already) {
        const reuseInfo = await organiseExistingDownload(candidateQuery, parts);
        const reused = !!(reuseInfo && reuseInfo.located.length > 0);
        if (reused) {
          console.log(`  ${yellow('↺')} reused existing (320) via: ${candidateQuery}`);
          printAlreadyHint();
          printLogHint(bitrate320Result?.logPath, true);
          reportExistingDownload(reuseInfo);
          didMatch = true;
          alreadyCount += 1;
          break;
        }
        console.log(
          `  ${yellow('⚠')} tidal-dl-ng reported already-downloaded (HIGH) via: ${candidateQuery}`,
        );
        printAlreadyHint();
        if (reuseInfo) reportExistingDownload(reuseInfo);
        printLogHint(bitrate320Result?.logPath, true);
        console.log(
          '    ' + dim('↪ No cached download was found. Continuing with other candidates…'),
        );
        continue;
      }
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
        printLogHint(bitrate320Result?.logPath, true);
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
          const nf = path.join(targetDir, 'not-found.log');
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
  persistLastRunLogs(targetDir);

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
