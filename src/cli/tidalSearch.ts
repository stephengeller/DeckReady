#!/usr/bin/env node
/**
 * Test CLI for TIDAL search functionality.
 *
 * Usage:
 *   node src/cli/tidalSearch.ts "Rick Astley Never Gonna Give You Up"
 *   node src/cli/tidalSearch.ts "Rick Astley Never Gonna Give You Up" --limit 10
 *
 * Outputs:
 *   ID, Title, Artist, Album, Quality, URL
 */

import { searchTidalTracks } from '../lib/tidalSearch';

function usageAndExit() {
  console.error('Usage: node src/cli/tidalSearch.ts "<search query>" [--limit N]');
  console.error('');
  console.error('Examples:');
  console.error('  node src/cli/tidalSearch.ts "Rick Astley Never Gonna Give You Up"');
  console.error('  node src/cli/tidalSearch.ts "Daft Punk" --limit 10');
  process.exit(1);
}

(async () => {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    usageAndExit();
  }

  const query = args[0];
  let limit = 5;

  // Parse --limit flag
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit < 1) {
      console.error('Error: --limit must be a positive integer');
      process.exit(1);
    }
  }

  console.error(`Searching TIDAL for: "${query}" (limit: ${limit})\n`);

  const tracks = await searchTidalTracks(query, { limit });

  if (tracks.length === 0) {
    console.error('No tracks found.');
    process.exit(2);
  }

  console.error(`Found ${tracks.length} track(s):\n`);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    console.log(`[${i + 1}] ${track.title} - ${track.artist}`);
    console.log(`    ID: ${track.id}`);
    console.log(`    Album: ${track.album}`);
    console.log(`    Artists: ${track.artists.join(', ')}`);
    console.log(`    Quality: ${track.audioQuality}`);
    if (track.duration) {
      const mins = Math.floor(track.duration / 60);
      const secs = track.duration % 60;
      console.log(`    Duration: ${mins}:${secs.toString().padStart(2, '0')}`);
    }
    console.log(`    URL: ${track.url}`);
    console.log('');
  }

  console.error(`\nTo download, use: tidal-dl-ng dl "${tracks[0].url}"`);
})().catch((err) => {
  console.error('Error:', err?.message || String(err));
  process.exit(1);
});
