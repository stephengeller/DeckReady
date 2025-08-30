#!/usr/bin/env node
/**
 * Usage:
 *   node src/cli/spotifyList.ts "https://open.spotify.com/playlist/..."
 *   node src/cli/spotifyList.ts "https://open.spotify.com/album/..."
 *   node src/cli/spotifyList.ts "https://open.spotify.com/track/..."
 *
 * Prints:
 *   Song Title - Artist 1, Artist 2
 */

import { getLinesFromSpotifyUrl } from '../lib/spotifyApi';

function usageAndExit() {
  console.error('Usage: node src/cli/spotifyList.ts "<spotify album/playlist/track url>"');
  process.exit(1);
}

(async () => {
  const url = process.argv[2];
  if (!url) usageAndExit();

  const lines = await getLinesFromSpotifyUrl(url);
  if (!lines.length) {
    console.error('No tracks found (playlist/album may be empty or inaccessible).');
    process.exit(2);
  }
  process.stdout.write(lines.join('\n') + '\n');
})().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
