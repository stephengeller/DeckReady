# Spotify → Rekordbox (helper scripts)

This repository contains helper scripts to take a Spotify playlist, album, or single track and try to download matching tracks from Qobuz using the `qobuz-dl` tool.

Prerequisites
- node (v16+)
- qobuz-dl in your PATH
- Spotify API credentials in `.env` (`SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`)

Quick usage

1. Make an output directory, e.g. `mkdir -p out`
2. Run the high-level helper script:

  ./script/run <spotify_url> --dir out [--dry] [--quality Q]

The `spotify_url` may be a playlist, album, or single track link. The script
uses the Spotify Web API (no browser automation) to resolve the tracklist, so
ensure the above credentials are set.

Example (playlist, dry-run):

  ./script/run https://open.spotify.com/playlist/... --dir out --dry

Example (single track):

  ./script/run https://open.spotify.com/track/... --dir out --dry

Options (summary)
- --dir DIR: output directory for downloads (required for verifying files)
- --quality Q: 5=320, 6=LOSSLESS, 7=24b=>96k, 27=>96k (default 6)
- --dry: dry-run mode — commands will be printed but nothing downloaded
- --tracklist FILE: skip Spotify scraping and use an existing "Song - Artist" file

Notes
- The `run` script calls `node src/runLuckyForTracklist.js` (or the path set in env RUN_LUCKY_JS).
- For tests, this project uses Jest (see package.json). Run `npm install` then `npm test`.
