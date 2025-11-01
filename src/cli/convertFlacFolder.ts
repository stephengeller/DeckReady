#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { processDownloadedAudio } from '../lib/organiser';
import { walkFiles } from '../lib/fsWalk';

type CliOptions = {
  byGenre: boolean;
  quiet: boolean;
  verbose: boolean;
  dryRun: boolean;
};

function printUsage(code = 0) {
  const out = code === 0 ? console.log : console.error;
  out(`Usage:
  convert-flac-folder <directory> [options]

Options:
  --by-genre    Organise into Genre/Artist/Title.aiff tree instead of flat layout
  --quiet       Suppress per-file logs (overridden by --verbose)
  --verbose     Print progress for each file
  --dry-run     Show what would be converted without calling ffmpeg
  -h, --help    Show this help text
`);
  process.exit(code);
}

function expandUserPath(input: string) {
  if (!input) return input;
  if (input.startsWith('~')) {
    const home = os.homedir() || process.env.HOME || '';
    const remainder = input.slice(1);
    return path.resolve(path.join(home, remainder.startsWith('/') ? remainder.slice(1) : remainder));
  }
  return path.resolve(input);
}

function parseArgs(argv: string[]): { targetDir: string; options: CliOptions } {
  let dirArg: string | null = null;
  let byGenre = false;
  let quiet = false;
  let verbose = false;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') printUsage(0);
    else if (arg === '--by-genre') byGenre = true;
    else if (arg === '--quiet') quiet = true;
    else if (arg === '--verbose') {
      verbose = true;
      quiet = false;
    } else if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      printUsage(1);
    } else if (!dirArg) {
      dirArg = arg;
    } else {
      console.error(`Unexpected argument: ${arg}`);
      printUsage(1);
    }
  }

  if (!dirArg) {
    console.error('Error: directory is required.');
    printUsage(1);
  }

  const targetDir = expandUserPath(dirArg);
  return { targetDir, options: { byGenre, quiet, verbose, dryRun } };
}

async function collectFlacFiles(dir: string): Promise<string[]> {
  const files = await walkFiles(dir);
  return files.filter((f) => /\.flac$/i.test(f)).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const { targetDir, options } = parseArgs(process.argv.slice(2));

  let stats;
  try {
    stats = await fs.stat(targetDir);
  } catch (err) {
    console.error(`Error: could not access ${targetDir}:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (!stats.isDirectory()) {
    console.error(`Error: ${targetDir} is not a directory.`);
    process.exit(1);
  }

  const flacFiles = await collectFlacFiles(targetDir);
  if (flacFiles.length === 0) {
    console.log('No FLAC files found to convert.');
    return;
  }

  if (options.dryRun) {
    console.log('Dry run: the following files would be processed:');
    for (const file of flacFiles) {
      console.log(`  ${file}`);
    }
    console.log(`Total FLAC files: ${flacFiles.length}`);
    return;
  }

  const quiet = options.quiet && !options.verbose;
  let success = 0;
  let failures = 0;
  for (const file of flacFiles) {
    if (options.verbose) {
      console.log(`Processing ${file}`);
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await processDownloadedAudio(file, undefined, {
        quiet,
        verbose: options.verbose,
        byGenre: options.byGenre,
      });
      success += 1;
    } catch (err) {
      failures += 1;
      console.error(`Failed to process ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  if (!quiet || options.verbose) {
    console.log(`Done. Converted ${success} file(s).`);
    if (failures > 0) console.log(`Failed conversions: ${failures}.`);
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
