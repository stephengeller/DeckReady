# Spotify → Rekordbox (helper scripts)

This repository contains helper scripts to take a Spotify playlist/album and try to download matching tracks from Qobuz using the `qobuz-dl` tool.

Prerequisites
- node (v16+)
- qobuz-dl in your PATH

Quick usage

1. Make an output directory, e.g. `mkdir -p out`
2. Run the high-level helper script:

  ./script/run <spotify_url> --dir out [--dry] [--concurrency N] [--quality Q]

Example (dry-run):

  ./script/run https://open.spotify.com/playlist/... --dir out --dry

Options (summary)
- --dir DIR: output directory for downloads (required for verifying files)
- --concurrency N: number of concurrent qobuz jobs (default 3)
- --quality Q: 5=320, 6=LOSSLESS, 7=24b=>96k, 27=>96k (default 6)
- --dry: dry-run mode — commands will be printed but nothing downloaded
- --tracklist FILE: skip Spotify scraping and use an existing "Song - Artist" file

Notes
- The `run` script calls `node src/runLuckyForTracklist.js` (or the path set in env RUN_LUCKY_JS).
- For tests, this project uses Jest (see package.json). Run `npm install` then `npm test`.
