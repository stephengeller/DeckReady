# DeckReady — Spotify/Qobuz → AIFF Library

Turn Spotify or Qobuz links into clean, tagged AIFF files organised on disk. Great for DJs who want tracks in a consistent, import‑ready format for software like Rekordbox, without manual cleanup.

What it does:

- Gets tracks from either a Spotify or Qobuz URL (or a text file of `Title - Artist` lines).
- Downloads the source audio (via `qobuz-dl`) — typically FLAC when available; falls back to 320 when needed.
- Converts to AIFF and preserves metadata (title/artist/album/genre/cover, etc.).
- Organises files into a neat folder layout: `ORGANISED_AIFF_DIR/Artist/Title.aiff` (or `Genre/Artist/Title.aiff` with `--by-genre`).
- Avoids duplicates: detects “already downloaded” runs and short‑circuits if an organised AIFF already exists.

Works entirely from the CLI. No Spotify login is required for public content. Qobuz access uses your local `qobuz-dl` configuration/credentials.

---

## Contents

- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Output & Logs](#output--logs)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

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
script/run <spotify_url|qobuz_url|tracklist_file> --dir out [--dry] [--quality Q]
```

Notes:

- Supports playlist, album, and track URLs from `open.spotify.com` and `open.qobuz.com`.
- Use `--dry` to preview qobuz‑dl commands without downloading.

Examples:

```bash
# Playlist (dry run)
script/run https://open.spotify.com/playlist/... --dir out --dry

# Single track
script/run https://open.spotify.com/track/... --dir out

# Use a pre-made "Title - Artist" file (skip scraping)
script/run path/to/tracklist.txt --dir out

# Qobuz direct URL (playlist, track, album)
script/run https://open.qobuz.com/playlist/35590683 --dir out
script/run https://open.qobuz.com/track/349546995 --dir out
script/run https://open.qobuz.com/album/... --dir out
```

## Usage

### script/run (recommended)

- Pass a Spotify or Qobuz URL, or a local text file of `Title - Artist` lines.
- Under the hood: scrapes Spotify (when given a Spotify URL), then calls the qobuz runner and organises output.

Options:

- `--dir DIR`: output directory for qobuz-dl downloads (required)
- `--quality Q`: 5=320, 6=LOSSLESS, 7=24b≤96k, 27=>96k (default 6)
- `--dry`: print commands without downloading
- `--quiet` / `--verbose`: control streaming output
- `--by-genre`: organise AIFFs into `Genre/Artist/Title.aiff` instead of `Artist/Title.aiff`

#### Flags

- `--dir DIR`: where qobuz-dl downloads land (required)
- `--quality Q`: prefer 6; 5 used as fallback when needed
- `--dry`: preview commands without making changes
- `--quiet` / `--verbose`: hide or show underlying qobuz-dl output
- `--by-genre`: organise as `Genre/Artist/Title.aiff` instead of `Artist/Title.aiff`

### Qobuz URLs

You can skip Spotify entirely and download directly from Qobuz links using the same wrapper.
Supported: playlist, album, track (and other pages supported by `qobuz-dl dl`).

Example:

```bash
script/run https://open.qobuz.com/{playlist|album|track}/... --dir out [--dry] [--quality Q] [--quiet|--verbose]
```

## Output & Logs

- Organised AIFF files land under `ORGANISED_AIFF_DIR/Artist/Title.aiff` by default
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

## Repository Map (short)

- `script/run`: unified entrypoint for Spotify/Qobuz/file input
- `script/spotify-list`: fetches `Title - Artist` lines from Spotify
- `script/qobuz-dl-url`: download from Qobuz URLs
- `src/qobuzRunner.ts`: qobuz‑dl integration (spawning, validation, logging)
- `src/lib/organiser.ts`: AIFF conversion and organised library placement
- `src/lib/tags.ts`: ffprobe tag helpers
- `src/lib/fsWalk.ts`: filesystem walking/snapshots
- `src/lib/proc.ts`: child-process utility

## Architecture

For a deeper dive into the flow and decisions, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Legal

Use responsibly and in accordance with Qobuz/Spotify terms. This tool automates search and download via your `qobuz-dl` configuration; ensure you have rights to obtain and use downloaded content.

## License

Released under the MIT License. See `LICENSE` for details.
