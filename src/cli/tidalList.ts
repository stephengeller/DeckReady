#!/usr/bin/env node
/**
 * Usage:
 *   node src/cli/tidalList.ts "https://tidal.com/playlist/..."
 *   node src/cli/tidalList.ts "https://tidal.com/album/..."
 *   node src/cli/tidalList.ts "https://tidal.com/track/..."
 *
 * Prints:
 *   Song Title - Artist 1, Artist 2
 */

import { getLinesFromTidalUrl } from '../lib/tidalApi';

function usageAndExit() {
  console.error('Usage: node src/cli/tidalList.ts "<tidal album/playlist/track url>"');
  process.exit(1);
}

(async () => {
  const tidalUrl = process.argv[2];
  if (!tidalUrl) usageAndExit();

  const lines = await getLinesFromTidalUrl(tidalUrl);
  if (!lines.length) {
    console.error('No tracks found (playlist/album may be empty or inaccessible).');
    process.exit(2);
  }
  process.stdout.write(lines.join('\n') + '\n');
})().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
