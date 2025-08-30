# Spotify → Rekordbox

> Turn Spotify playlists/albums/tracks into an organised, Rekordbox‑ready AIFF library.

- Fetch track lines from the Spotify Web API (Title - Artist 1, Artist 2)
- Search and download matches from Qobuz via `qobuz-dl` (lossless preferred; 320 fallback)
- Convert to AIFF and organise into `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`

Works entirely from the CLI and does not require a Spotify login for public content.

---

## Contents

- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Output & Logs](#output--logs)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Repository Map](#repository-map)
- [Architecture](#architecture)
- [Legal](#legal)

---

## Getting Started

Requirements:

- Node.js 18+
- `qobuz-dl` in your PATH and configured with your Qobuz credentials
- `ffmpeg` and `ffprobe` in PATH

Install and bootstrap (idempotent):

```bash
script/setup
# or: yarn setup
# or: npm run setup
```

The setup script:

- Installs Node dependencies
- Ensures `.env` exists (copied from `.env.example` if missing)
- Creates `~/Music/rekordbox/Organised_AIFF` by default
- Checks for external tools: `qobuz-dl`, `ffmpeg`, `ffprobe`

## Configuration

Edit `.env` in the repo root:

- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for Spotify Web API access
- `ORGANISED_AIFF_DIR` base folder for organised AIFF files (defaults to `~/Music/rekordbox/Organised_AIFF`)

See the example: [.env.example](./.env.example)

How to get Spotify credentials: [docs/CREDENTIALS.md](./docs/CREDENTIALS.md)

## Quick Start

1. Create an output directory for `qobuz-dl` temporary downloads:

```bash
mkdir -p out
```

2. Run the end‑to‑end helper:

```bash
script/run <spotify_url> --dir out [--dry] [--quality Q]
```

Notes:

- Supports playlist, album, and track URLs from `open.spotify.com`
- Use `--dry` to preview qobuz‑dl commands without downloading

Examples:

```bash
# Playlist (dry run)
script/run https://open.spotify.com/playlist/... --dir out --dry

# Single track
script/run https://open.spotify.com/track/... --dir out

# Use a pre-made "Title - Artist" file, skip Spotify
script/run --tracklist path/to/tracklist.txt --dir out
```

## CLI Reference

### script/run (wrapper)

- Scrapes Spotify into lines via `script/spotify-list` unless `--tracklist` is provided
- Calls `run-lucky` to run qobuz‑dl with validation and logging
- Optional `--convert` flag exists as a placeholder; conversion/organisation already happens automatically

### run-lucky (bin) / script/run-lucky (ts-node shim)

Usage:

```bash
run-lucky <tracklist.txt> --dir <out> [--dry] [--quiet|--verbose] [--summary-only] [--json]
```

Behavior:

- Writes logs for each query under `<out>/.qobuz-logs/`
- Detects “already downloaded” and skips redundant fallbacks
- Validates downloaded files via tags; deletes wrong matches and logs a mismatch

### script/spotify-list

Usage:

```bash
script/spotify-list "https://open.spotify.com/{playlist|album|track}/..."
```

Prints:

```
Title - Artist 1, Artist 2
```

### Common options

- `--dir DIR`: output directory for qobuz-dl downloads (required)
- `--quality Q`: 5=320, 6=LOSSLESS, 7=24b≤96k, 27=>96k (default 6)
- `--dry`: print commands without downloading
- `--tracklist FILE`: use a pre‑made "Title - Artist" file; skip Spotify scraping
- `--quiet` / `--verbose`: control streaming output
- `--summary-only`: suppress per‑file logs; emit summary at the end
- `--json`: JSON summary output

## Output & Logs

- Organised AIFF files land under `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`
- Detailed qobuz‑dl logs: `<dir>/.qobuz-logs/`
- Unmatched lines: appended to `<dir>/not-found.log`
- Wrong matches: files removed and mismatch noted in summary

## Troubleshooting

- `qobuz-dl` not found: install and ensure it’s in PATH
- Spotify API errors (401/403): verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env` (public content only)
- Missing ffmpeg/ffprobe: install both and ensure they’re in PATH
- Files not appearing in organised folder: check `ORGANISED_AIFF_DIR` and logs in `<dir>/.qobuz-logs`

More: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## Development

- Type-check: `yarn typecheck`
- Tests (Jest): `yarn test`
- Lint: `yarn lint` (autofix: `yarn lint:fix`)
- Format: `yarn format` / `yarn format:check`

See: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

## Repository Map

- `script/run`, `script/run-lucky`, `script/spotify-list`: shims to run CLIs via ts-node
- `src/cli/runLucky.ts`: CLI entry for qobuz-dl flow
- `src/lib/runLuckyForTracklist.ts`: orchestration (queries, matching, validation, summary)
- `src/lib/normalize.ts`, `src/lib/queryBuilders.ts`: normalisation and query generation
- `src/qobuzRunner.ts`: qobuz‑dl integration (spawning, validation, logging)
- `src/lib/organiser.ts`: AIFF conversion and organised library placement
- `src/lib/tags.ts`: ffprobe tag helpers
- `src/lib/fsWalk.ts`: filesystem walking/snapshots
- `src/lib/proc.ts`: child-process utility

## Architecture

For a deeper dive into the flow and decisions, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Legal

Use responsibly and in accordance with Qobuz/Spotify terms. This tool automates search and download via your `qobuz-dl` configuration; ensure you have rights to obtain and use downloaded content.
