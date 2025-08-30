# Spotify → Rekordbox

Helper tools to turn a Spotify playlist/album/track into an organised, Rekordbox-ready AIFF library by:

- Fetching tracklines from the Spotify Web API (Song Title - Artist 1, Artist 2).
- Searching/downloading best matches from Qobuz using `qobuz-dl` (lossless preferred; 320 fallback).
- Converting to AIFF and organising to a genre/artist folder tree with metadata preserved.

Works entirely from the CLI and does not require a Spotify login for public content.

What this repository provides

- High-level runner `script/run` for one-command end-to-end flow.
- TypeScript CLI `run-lucky` to run Qobuz “lucky” searches from a tracklist with validation and logging.
- TypeScript CLI `script/spotify-list` to fetch tracklines via the Spotify Web API.
- Organiser that converts audio to AIFF and places it under `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`.

Requirements

- node: 18+
- qobuz-dl: available in your PATH and configured with your Qobuz credentials
- ffmpeg and ffprobe: required for tag inspection and AIFF conversion

Install

- Clone the repo, then install deps:
  - `yarn install` (preferred) or `npm install`

Configuration

Create a `.env` (or edit the provided example) at repo root:

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`: required for Spotify Web API access (client credentials flow).
- `ORGANISED_AIFF_DIR`: base folder for organised AIFF files. Default: `~/Music/rekordbox/Organised_AIFF`.

See `.env.example:1` for a starting point.

Quick Start

1. Make an output directory (where qobuz-dl writes): `mkdir -p out`
2. Run the end‑to‑end helper:

`script/run <spotify_url> --dir out [--dry] [--quality Q]`

- Supports playlist, album, or single track URLs from `open.spotify.com`.
- Use `--dry` to preview qobuz-dl commands without downloading.

Examples

- Playlist (dry-run):
  - `script/run https://open.spotify.com/playlist/... --dir out --dry`
- Single track:
  - `script/run https://open.spotify.com/track/... --dir out`
- Use an existing file of lines (skip Spotify):
  - `script/run --tracklist path/to/tracklist.txt --dir out`

CLI Details

- `script/run`: top-level wrapper that:
  - Scrapes Spotify into lines via `script/spotify-list` unless `--tracklist` is provided.
  - Calls `run-lucky` (ts-node entry) to run qobuz-dl with validation and logging.
  - Optional placeholder `--convert` exists for additional conversion, but the organiser already converts to AIFF.

- `run-lucky` (bin) / `script/run-lucky` (ts-node shim):
  - Usage: `run-lucky <tracklist.txt> --dir <out> [--dry] [--quiet|--verbose] [--summary-only] [--json]`
  - Writes logs for each query under `<out>/.qobuz-logs/` and summary counters to stdout.
  - Detects “already downloaded” and skips duplicate fallback attempts.
  - Validates downloaded files via tags; on mismatch it deletes the wrong files and logs details.

- `script/spotify-list`:
  - Usage: `script/spotify-list "https://open.spotify.com/{playlist|album|track}/..."`
  - Prints one line per track: `Song Title - Artist 1, Artist 2`.
  - Works for public content; private playlists require appropriate OAuth flows and are not supported.

Options (summary)

- `--dir DIR`: output directory for qobuz-dl downloads (required)
- `--quality Q`: qobuz quality (5=320, 6=LOSSLESS, 7=24b≤96k, 27=>96k; default 6)
- `--dry`: print commands without downloading
- `--tracklist FILE`: use a pre-made "Song - Artist" file; skip Spotify scraping
- `--quiet`/`--verbose`: control qobuz-dl output streaming
- `--summary-only`: only print per-track summaries and final totals
- `--json`: emit final summary as JSON

Output & Logs

- Organised AIFF files are placed under `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`.
- For each qobuz-dl run, a detailed log is written under `<dir>/.qobuz-logs/`.
- When no match is found, the original line is appended to `<dir>/not-found.log`.
- When a wrong match occurs, the downloaded files are removed and a `mismatch` is reported in summary.

Troubleshooting

- qobuz-dl not found: ensure it’s installed and in PATH.
- Spotify API auth errors: ensure `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set and valid. Private playlists are not accessible with client credentials.
- FFmpeg/ffprobe missing: install both and ensure they’re available in PATH.
- Files not appearing in organised folder: check `ORGANISED_AIFF_DIR` and logs in `<dir>/.qobuz-logs`.

Development

- Type-check: `yarn typecheck`
- Tests (Jest): `yarn test`
- Lint: `yarn lint` (autofix: `yarn lint:fix`)
- Format: `yarn format` / `yarn format:check`

Repo Guide

- `src/cli/runLucky.ts`: CLI entry for qobuz-dl flow
- `src/lib/runLuckyForTracklist.ts`: core orchestration (queries, matching, validation, summary)
- `src/cli/spotifyList.ts`: Spotify API-based tracklist fetcher
- `src/lib/normalize.ts`, `src/lib/queryBuilders.ts`: query generation helpers
- `src/qobuzRunner.ts`: qobuz-dl integration, tagging, AIFF conversion, organisation
- `script/run`, `script/run-lucky`, `script/spotify-list`: small shims to run CLIs via ts-node

More docs

- See `docs/USAGE.md:1` for extended examples.
- See `docs/ARCHITECTURE.md:1` for a deeper dive into flow and decisions.
- See `docs/TROUBLESHOOTING.md:1` for common errors and fixes.
- See `docs/DEVELOPMENT.md:1` for local setup tips and scripts.

Legal

Use responsibly and in accordance with Qobuz/Spotify terms. This tool automates search and download via your `qobuz-dl` configuration; ensure you have rights to obtain and use downloaded content.
