import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnStreaming } from './lib/proc';
import { snapshot, diffNewAudio } from './lib/fsWalk';
import { processDownloadedAudio, findOrganisedAiff } from './lib/organiser';
import { searchTidalTracks, type TidalSearchTrack } from './lib/tidalSearch';
import { makeProgressHandler } from './provider/progress';
import { cleanupOnNoAudio } from './provider/fsOps';
import { writeRunLog, writeSidecarText } from './provider/logging';
import { normaliseTag, normaliseTitleBase } from './lib/tags';

// Helper functions to manage tidal-dl-ng config
const TIDAL_CONFIG_PATH = path.join(os.homedir(), '.config', 'tidal_dl_ng', 'settings.json');

/**
 * Pre-filter TIDAL candidates based on expected artist/title to reduce unnecessary downloads.
 * Uses the same normalization logic as validation, but filters BEFORE downloading.
 */
function filterCandidates(
  candidates: TidalSearchTrack[],
  expectedArtist?: string,
  expectedTitle?: string,
): TidalSearchTrack[] {
  if (!expectedArtist && !expectedTitle) {
    // No filtering criteria, return all
    return candidates;
  }

  const normExpectedArtist = expectedArtist ? normaliseTag(expectedArtist) : '';
  const normExpectedTitle = expectedTitle ? normaliseTitleBase(expectedTitle) : '';

  return candidates.filter((candidate) => {
    // Normalize candidate metadata
    const normCandidateTitle = normaliseTitleBase(candidate.title);
    const normCandidateArtist = normaliseTag(candidate.artist);

    // Check title match (if provided)
    if (expectedTitle && normCandidateTitle !== normExpectedTitle) {
      // Allow partial match for remixes/versions
      if (!normCandidateTitle.includes(normExpectedTitle)) {
        return false;
      }
    }

    // Check artist match (if provided)
    if (expectedArtist) {
      // Primary artist match
      if (normCandidateArtist === normExpectedArtist) {
        return true;
      }

      // Check all artists
      const allArtists = candidate.artists.map((a) => normaliseTag(a));
      if (allArtists.some((a) => a === normExpectedArtist)) {
        return true;
      }

      // No artist match found
      return false;
    }

    return true;
  });
}

async function getTidalConfig(): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(TIDAL_CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Failed to read tidal-dl-ng config at ${TIDAL_CONFIG_PATH}. Have you run 'tidal-dl-ng login'?`,
    );
  }
}

async function setTidalConfig(
  quality: string,
  directory: string,
): Promise<{
  quality: string;
  basePath: string;
  formatTrack: string;
  formatAlbum: string;
  formatPlaylist: string;
  formatMix: string;
  formatVideo: string;
}> {
  const config = await getTidalConfig();
  const original = {
    quality: String(config.quality_audio ?? ''),
    basePath: String(config.download_base_path ?? ''),
    formatTrack: String(config.format_track ?? ''),
    formatAlbum: String(config.format_album ?? ''),
    formatPlaylist: String(config.format_playlist ?? ''),
    formatMix: String(config.format_mix ?? ''),
    formatVideo: String(config.format_video ?? ''),
  };

  config.quality_audio = quality;
  // Set tidal-dl-ng to download to our target directory with flat format
  config.download_base_path = path.resolve(directory);
  // Use flat format so files land directly in target directory
  config.format_track = '{artist_name} - {track_title}';
  config.format_album = '{album_artist} - {album_title}/{artist_name} - {track_title}';
  config.format_playlist = '{playlist_name}/{artist_name} - {track_title}';
  config.format_mix = '{mix_name}/{artist_name} - {track_title}';
  config.format_video = '{artist_name} - {track_title}';

  await fs.writeFile(TIDAL_CONFIG_PATH, JSON.stringify(config, null, 4));
  return original;
}

async function restoreTidalConfig(original: {
  quality: string;
  basePath: string;
  formatTrack: string;
  formatAlbum: string;
  formatPlaylist: string;
  formatMix: string;
  formatVideo: string;
}): Promise<void> {
  const config = await getTidalConfig();
  config.quality_audio = original.quality;
  config.download_base_path = original.basePath;
  config.format_track = original.formatTrack;
  config.format_album = original.formatAlbum;
  config.format_playlist = original.formatPlaylist;
  config.format_mix = original.formatMix;
  config.format_video = original.formatVideo;
  await fs.writeFile(TIDAL_CONFIG_PATH, JSON.stringify(config, null, 4));
}

export type RunTidalResult = {
  /** True if tidal-dl-ng returned success and at least one new audio file was detected. */
  ok: boolean;
  /** Files detected as newly added by the run (post-snapshot). */
  added: string[];
  /** Exact tidal-dl-ng command used. */
  cmd: string;
  /** Aggregated tidal-dl-ng stdout. */
  stdout: string;
  /** Aggregated tidal-dl-ng stderr. */
  stderr: string;
  /** Exit code from tidal-dl-ng. */
  code: number;
  /** True when invoked with dryRun (no process spawned). */
  dry?: boolean;
  /** Full per-run log path on disk, when available. */
  logPath?: string | null;
  /** Present when a wrong file was matched; used to short-circuit further candidates. */
  mismatch?: {
    artistNorm: string;
    titleNorm: string;
    artistRaw: string;
    titleRaw: string;
  } | null;
  /** True when tidal-dl-ng reported success but no new audio landed (already downloaded). */
  already?: boolean;
};

/**
 * Run tidal-dl-ng with TIDAL search for a single query.
 *
 * Simplified approach leveraging TIDAL API metadata:
 * 1. Check if track already exists in organized library (short-circuit)
 * 2. Search TIDAL API for candidate tracks
 * 3. Pre-filter candidates using TIDAL metadata (no download needed)
 * 4. For first matching candidate, download via tidal-dl-ng
 * 5. Use TIDAL metadata directly (no tag validation needed - we know the track ID)
 *
 * - Detects new files by snapshotting the target directory before/after.
 * - Writes per-run logs and search-term sidecar files.
 * - Much faster than qobuz-dl approach (no ffprobe validation, pre-filtering)
 */
export async function runTidalDlStrict(
  query: string,
  {
    directory,
    quality = 'LOSSLESS',
    dryRun = false,
    quiet = false,
    artist,
    title,
    progress = false,
    onProgress,
    byGenre = false,
    flacOnly = false,
    candidateLimit = 5,
  }: {
    directory?: string;
    quality?: 'LOW' | 'HIGH' | 'LOSSLESS' | 'HI_RES_LOSSLESS';
    dryRun?: boolean;
    quiet?: boolean;
    artist?: string;
    title?: string;
    progress?: boolean;
    onProgress?: (info: { raw: string; percent?: number; bytes?: number; total?: number }) => void;
    byGenre?: boolean;
    flacOnly?: boolean;
    candidateLimit?: number;
  } = {},
): Promise<RunTidalResult> {
  const dir = directory || '.downloads';

  // Short-circuit: Check if track already exists in organized library (unless --flac-only)
  if (!flacOnly && artist && title) {
    const existing = await findOrganisedAiff(artist, title, { byGenre });
    if (existing) {
      if (!quiet) console.log(`✓ Already in organized library: ${existing}`);
      return {
        ok: true,
        added: [],
        cmd: 'tidal-dl-ng dl <already organized>',
        stdout: '',
        stderr: '',
        code: 0,
        already: true,
        mismatch: null,
        logPath: null,
      };
    }
  }

  // Search TIDAL for candidate tracks
  if (!quiet) console.log(`Searching TIDAL for: "${query}"...`);

  let candidates;
  try {
    candidates = await searchTidalTracks(query, { limit: candidateLimit });
  } catch (err) {
    const error = err as Error;
    if (!quiet) console.error(`TIDAL search failed: ${error.message}`);
    return {
      ok: false,
      added: [],
      cmd: 'tidal-dl-ng dl <search failed>',
      stdout: '',
      stderr: `TIDAL search error: ${error.message}`,
      code: 1,
      mismatch: null,
      logPath: null,
    };
  }

  if (candidates.length === 0) {
    if (!quiet) console.log('No TIDAL candidates found.');
    return {
      ok: false,
      added: [],
      cmd: 'tidal-dl-ng dl <no candidates>',
      stdout: '',
      stderr: 'No tracks found in TIDAL search',
      code: 1,
      mismatch: null,
      logPath: null,
    };
  }

  if (!quiet) {
    console.log(`Found ${candidates.length} candidate(s):`);
    for (let i = 0; i < candidates.length; i++) {
      console.log(`  [${i + 1}] ${candidates[i].title} - ${candidates[i].artist}`);
    }
  }

  // Pre-filter candidates using TIDAL metadata (before downloading!)
  const filteredCandidates = filterCandidates(candidates, artist, title);

  if (filteredCandidates.length === 0) {
    if (!quiet) {
      console.log(
        `No candidates match expected artist/title after filtering (expected: ${artist} - ${title})`,
      );
    }
    return {
      ok: false,
      added: [],
      cmd: 'tidal-dl-ng dl <filtered out all candidates>',
      stdout: '',
      stderr: 'All candidates filtered out based on metadata',
      code: 1,
      mismatch: null,
      logPath: null,
    };
  }

  if (!quiet && filteredCandidates.length < candidates.length) {
    console.log(
      `Filtered to ${filteredCandidates.length} candidate(s) based on artist/title match`,
    );
  }

  // Try each filtered candidate in order until successful
  for (let i = 0; i < filteredCandidates.length; i++) {
    const candidate = filteredCandidates[i];
    const candidateNum = i + 1;

    if (!quiet) {
      console.log(
        `\nTrying candidate ${candidateNum}/${filteredCandidates.length}: ${candidate.title} - ${candidate.artist}`,
      );
    }

    const args = ['dl', candidate.url];
    const cmd = `tidal-dl-ng ${args.join(' ')}`;

    if (dryRun) {
      if (!quiet) console.log(`[DRY RUN] ${cmd}`);
      continue; // Try next candidate in dry run
    }

    // Take a filesystem snapshot before running
    const before = await snapshot(dir);

    // Optional progress parser
    let bytes = 0;
    let total = 0;
    const onStdout = makeProgressHandler(progress, (info) => {
      bytes = info.bytes ?? bytes;
      total = info.total ?? total;
      if (onProgress) onProgress(info);
    });

    // Set quality and directory by temporarily modifying tidal-dl-ng config
    let originalConfig: {
      quality: string;
      basePath: string;
      formatTrack: string;
      formatAlbum: string;
      formatPlaylist: string;
      formatMix: string;
      formatVideo: string;
    } | null = null;
    try {
      originalConfig = await setTidalConfig(quality, dir);
    } catch (err) {
      if (!quiet) console.error(`Warning: Failed to set config: ${(err as Error).message}`);
    }

    let proc;
    try {
      proc = await spawnStreaming('tidal-dl-ng', args, {
        quiet,
        onStdout,
        onStderr: onStdout,
      });
    } finally {
      // Always restore original config
      if (originalConfig) {
        try {
          await restoreTidalConfig(originalConfig);
        } catch (err) {
          if (!quiet) console.error(`Warning: Failed to restore config: ${(err as Error).message}`);
        }
      }
    }

    const after = await snapshot(dir);
    const addedAudio = diffNewAudio(before.files, after.files);

    // Write the original search term next to each downloaded audio file for debugging
    if (addedAudio.length > 0) await writeSidecarText(addedAudio, query);

    // If no audio landed, clean up and try next candidate
    if (addedAudio.length === 0) {
      await cleanupOnNoAudio(before, after, directory);

      // Check if already downloaded (success with no new files)
      if (proc.code === 0) {
        if (!quiet) console.log('Already downloaded, checking organized library...');
        // Check if we have it in organized library
        if (artist && title) {
          const organised = await findOrganisedAiff(artist, title, { byGenre });
          if (organised) {
            if (!quiet) console.log(`Found in organized library: ${organised}`);
            return {
              ok: true,
              added: [],
              cmd,
              logPath: null,
              already: true,
              mismatch: null,
              ...proc,
            } as unknown as RunTidalResult;
          }
        }
      }

      if (!quiet) console.log(`No audio downloaded for candidate ${candidateNum}, trying next...`);
      continue;
    }

    // Write full tidal-dl-ng output to a per-run log file
    const safeQuery = query.replace(/[^a-z0-9_\-.]/gi, '_').slice(0, 120);
    const logPath = await writeRunLog(
      directory,
      `${Date.now()}_${quality}_${candidate.id}_${safeQuery}`,
      cmd,
      proc.stdout,
      proc.stderr,
    );

    const ok = proc.code === 0 && addedAudio.length > 0;

    if (!ok) {
      if (!quiet) {
        console.log(
          `Download failed for "${candidate.title}" by ${candidate.artist} (ID: ${candidate.id}), trying next...`,
        );
      }
      continue;
    }

    // SUCCESS! We know this is correct because we downloaded by track ID from TIDAL
    if (!quiet) {
      console.log(
        `✓ Downloaded "${candidate.title}" by ${candidate.artist} (${candidate.audioQuality})`,
      );
    }

    if (flacOnly) {
      return {
        ok,
        added: addedAudio,
        cmd,
        logPath,
        mismatch: null,
        ...proc,
      } as unknown as RunTidalResult;
    }

    // Convert to AIFF and organize
    if (addedAudio.length > 0) {
      for (const f of addedAudio) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await processDownloadedAudio(f, undefined, { quiet, byGenre });
        } catch (e) {
          console.error('processDownloadedAudio failed for', f, e);
        }
      }
    }

    return {
      ok,
      added: addedAudio,
      cmd,
      logPath,
      mismatch: null,
      ...proc,
    } as unknown as RunTidalResult;
  }

  // If we get here in dry run mode, return success
  if (dryRun) {
    return {
      ok: true,
      added: [],
      cmd: `tidal-dl-ng dl <${filteredCandidates.length} filtered candidates>`,
      stdout: '',
      stderr: '',
      code: 0,
      dry: true,
      mismatch: null,
      logPath: null,
    };
  }

  // Exhausted all filtered candidates without a successful download
  if (!quiet) console.log('\nNo successful downloads from any candidate.');

  return {
    ok: false,
    added: [],
    cmd: `tidal-dl-ng dl <tried ${filteredCandidates.length} filtered candidates>`,
    stdout: '',
    stderr: 'All filtered candidates tried, no successful download',
    code: 1,
    mismatch: null,
    logPath: null,
  };
}

// Re-export existing qobuz functions for backward compatibility during transition
export { findOrganisedAiff, processDownloadedAudio } from './lib/organiser';
