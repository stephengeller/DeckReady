import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnStreaming } from './lib/proc';
import { readTags } from './lib/tags';
import { snapshot, diffNewAudio } from './lib/fsWalk';
import { processDownloadedAudio, findOrganisedAiff } from './lib/organiser';
import { searchTidalTracks } from './lib/tidalSearch';
import { makeProgressHandler } from './provider/progress';
import { cleanupOnNoAudio } from './provider/fsOps';
import { writeRunLog, writeSidecarText } from './provider/logging';
import { validateAddedAudioAgainstExpectation } from './provider/validation';

// Helper functions to manage tidal-dl-ng config
const TIDAL_CONFIG_PATH = path.join(os.homedir(), '.config', 'tidal_dl_ng', 'settings.json');

async function getTidalConfig(): Promise<any> {
  try {
    const content = await fs.readFile(TIDAL_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Failed to read tidal-dl-ng config at ${TIDAL_CONFIG_PATH}. Have you run 'tidal-dl-ng login'?`,
    );
  }
}

async function setTidalConfig(
  quality: string,
  directory?: string,
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
    quality: config.quality_audio,
    basePath: config.download_base_path,
    formatTrack: config.format_track,
    formatAlbum: config.format_album,
    formatPlaylist: config.format_playlist,
    formatMix: config.format_mix,
    formatVideo: config.format_video,
  };

  config.quality_audio = quality;
  if (directory) {
    // Set tidal-dl-ng to download to our target directory with flat format
    config.download_base_path = path.resolve(directory);
    // Use flat format so files land directly in target directory
    config.format_track = '{artist_name} - {track_title}';
    config.format_album = '{album_artist} - {album_title}/{artist_name} - {track_title}';
    config.format_playlist = '{playlist_name}/{artist_name} - {track_title}';
    config.format_mix = '{mix_name}/{artist_name} - {track_title}';
    config.format_video = '{artist_name} - {track_title}';
  }

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
 * Run tidal-dl-ng with TIDAL search for a single query, with strict validation and logging.
 *
 * Unlike qobuz-dl's "lucky" mode, this function:
 * 1. Searches TIDAL API for candidate tracks
 * 2. For each candidate, downloads via tidal-dl-ng
 * 3. Validates tags against expected artist/title
 * 4. Returns on first successful match or validation mismatch
 *
 * - Detects new files by snapshotting the target directory before/after.
 * - Writes per-run logs and search-term sidecar files.
 * - Validates tags against expected artist/title; deletes wrong matches and reports a mismatch.
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
  const dir = directory || '.';

  // First, search TIDAL for candidate tracks
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

  // Try each candidate in order until we get a validated match or a mismatch
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const candidateNum = i + 1;

    if (!quiet) {
      console.log(
        `\nTrying candidate ${candidateNum}/${candidates.length}: ${candidate.title} - ${candidate.artist}`,
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
      originalConfig = await setTidalConfig(quality, directory);
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

    // Validate tags if artist/title provided
    if (addedAudio.length > 0 && (artist || title)) {
      const mismatch = await validateAddedAudioAgainstExpectation(addedAudio, {
        directory,
        query,
        artist,
        title,
      });

      if (mismatch) {
        if (!quiet) {
          console.log(
            `Validation mismatch for candidate ${candidateNum}: expected "${artist} - ${title}", got "${mismatch.artistRaw} - ${mismatch.titleRaw}"`,
          );
          console.log('STOPPING candidate search due to mismatch (wrong match detected).');
        }
        return {
          ok: false,
          added: [],
          cmd,
          logPath,
          mismatch,
          ...proc,
        } as unknown as RunTidalResult;
      }
    }

    const ok = proc.code === 0 && addedAudio.length > 0;

    if (!ok) {
      if (!quiet) console.log(`Download failed for candidate ${candidateNum}, trying next...`);
      continue;
    }

    // SUCCESS! Process the audio files
    if (!quiet) console.log(`✓ Match validated for candidate ${candidateNum}`);

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
      cmd: `tidal-dl-ng dl <${candidates.length} candidates>`,
      stdout: '',
      stderr: '',
      code: 0,
      dry: true,
      mismatch: null,
      logPath: null,
    };
  }

  // Exhausted all candidates without a match
  if (!quiet) console.log('\nNo validated matches found in any candidate.');

  return {
    ok: false,
    added: [],
    cmd: `tidal-dl-ng dl <tried ${candidates.length} candidates>`,
    stdout: '',
    stderr: 'All candidates tried, no validated match',
    code: 1,
    mismatch: null,
    logPath: null,
  };
}

// Re-export existing qobuz functions for backward compatibility during transition
export { findOrganisedAiff, processDownloadedAudio } from './lib/organiser';
