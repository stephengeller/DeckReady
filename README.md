# DeckReady — Spotify/TIDAL → AIFF Library

Turn Spotify or TIDAL links into clean, tagged AIFF files organised on disk. Great for DJs who want tracks in a consistent, import‑ready format for software like Rekordbox, without manual cleanup.

What it does:

- Gets tracks from a Spotify or TIDAL URL (or a text file of `Title - Artist` lines).
- Searches TIDAL's catalog and downloads the source audio (via `tidal-dl-ng`) — typically FLAC when available; falls back to 320kbps when needed.
- Converts to AIFF and preserves metadata (title/artist/album/genre/cover, etc.).
- Organises files into a neat folder layout: `ORGANISED_AIFF_DIR/Artist - Title.aiff` by default (flat). Use `--by-genre` for `Genre/Artist/Title.aiff`, or set `ORGANISED_FLAT=false` for `Artist/Title.aiff`.
- Avoids duplicates: detects "already downloaded" runs and short‑circuits if an organised AIFF already exists.

Works entirely from the CLI. No Spotify login is required for public content. TIDAL access requires authentication via `tidal-dl-ng login` (requires TIDAL subscription for lossless quality).

---

## Contents

- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Output & Logs](#output--logs)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Utility Scripts](#utility-scripts)

---

## Getting Started

Requirements:

- Node.js 18+
- `tidal-dl-ng` in your PATH (install: `pip install tidal-dl-ng`)
- `ffmpeg` and `ffprobe` in PATH
- TIDAL account (HiFi or HiFi Plus subscription for lossless/hi-res quality)

Install and bootstrap (idempotent):

```bash
script/setup
# or: yarn setup
# or: npm run setup
```

The setup script:

- Installs Node dependencies
- Ensures `.env` exists (copied from `.env.example` if missing)
- Creates `~/Music/rekordbox/DROP_NEW_SONGS_HERE` by default
- Checks for external tools: `tidal-dl-ng`, `ffmpeg`, `ffprobe`

**Important**: After running setup, authenticate with TIDAL:

```bash
tidal-dl-ng login
```

## Configuration

Edit `.env` in the repo root:

- `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for Spotify Web API access
- `ORGANISED_AIFF_DIR` base folder for organised AIFF files (defaults to `~/Music/rekordbox/DROP_NEW_SONGS_HERE`)

See the example: [.env.example](./.env.example)

How to get Spotify credentials: [docs/CREDENTIALS.md](./docs/CREDENTIALS.md)

**Note**: TIDAL support does not require API credentials. Public playlists, albums, and tracks are accessible directly.

## Quick Start

1. Run the setup helper (installs Node deps, scaffolds `.env`, checks required CLI tools):

```bash
script/setup
# or: yarn setup
```

2. Authenticate with TIDAL:

```bash
tidal-dl-ng login
```

3. Create an output directory for `tidal-dl-ng` temporary downloads:

```bash
mkdir -p out
```

4. Run the end‑to‑end helper:

```bash
script/run <spotify_url|tidal_url|tracklist_file> --dir out [--dry] [--quality Q]
```

Notes:

- Supports playlist, album, and track URLs from `open.spotify.com` and `tidal.com`.
- Use `--dry` to preview tidal‑dl-ng commands without downloading.
- Quality options: `LOW`, `HIGH`, `LOSSLESS` (default), `HI_RES_LOSSLESS`

Examples:

```bash
# Spotify playlist (dry run)
script/run https://open.spotify.com/playlist/... --dir out --dry

# Spotify single track
script/run https://open.spotify.com/track/... --dir out

# TIDAL playlist
script/run https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572 --dir out

# TIDAL album
script/run https://tidal.com/album/... --dir out

# Use a pre-made "Title - Artist" file (skip scraping)
script/run path/to/tracklist.txt --dir out

# Specify quality
script/run <url> --dir out --quality HI_RES_LOSSLESS
```

## Usage

### script/setup (first run)

- Installs Node dependencies via Yarn/NPM.
- Creates `.env` from `.env.example` (or appends missing keys).
- Ensures `~/Music/rekordbox/DROP_NEW_SONGS_HERE` exists.
- Verifies `tidal-dl-ng`, `ffmpeg`, and `ffprobe` are on your `PATH`.

Run it anytime you change machines or update dependencies:

```bash
script/setup           # or: yarn setup / npm run setup
```

**Remember**: Run `tidal-dl-ng login` after setup to authenticate.

### script/run (recommended)

- Pass a Spotify or TIDAL URL, or a local text file of `Title - Artist` lines.
- Under the hood: scrapes Spotify (when given a Spotify URL), searches TIDAL, downloads via tidal-dl-ng, and organises output.

Options:

- `--dir DIR`: output directory for tidal-dl-ng downloads (required)
- `--quality Q`: `LOW`, `HIGH`, `LOSSLESS` (default), `HI_RES_LOSSLESS`
- `--dry`: print commands without downloading
- `--quiet` / `--verbose`: control streaming output
- `--by-genre`: organise AIFFs into `Genre/Artist/Title.aiff` instead of the flat default (`Artist - Title.aiff`)
- `--flac-only`: skip AIFF conversion/organisation and keep the raw downloads
- `--convert`: (experimental) convert downloaded audio to AIFF in-place using `ffmpeg`
- `--artist-first` / `--title-first`: override how `Title - Artist` lines are interpreted
- Extra `--flag` arguments are forwarded to `script/run-lucky`

#### Flags

- `--dir DIR`: where tidal-dl-ng downloads land (required)
- `--quality Q`: `LOSSLESS` by default; `HIGH` used as fallback when needed
- `--dry`: preview commands without making changes
- `--quiet` / `--verbose`: hide or show underlying tidal-dl-ng output
- `--by-genre`: organise as `Genre/Artist/Title.aiff` instead of the flat default (`Artist - Title.aiff`)

### script/run-lucky (advanced)

- Processes an existing tracklist text file via `tidal-dl-ng`.
- Accepts the same flags as `script/run` (including `--quality`, `--by-genre`, `--flac-only`).
- Set `--dir DIR` to tell the runner where downloads land and where to look for cached results.

Example:

```bash
script/run-lucky tracklist.txt --dir out --quality HI_RES_LOSSLESS --verbose
```

### script/spotify-list (export Spotify tracklist only)

- Scrapes Spotify playlists/albums/tracks and prints `Title - Artist` lines to stdout.
- Combine with shell redirection to build reusable tracklist files.

```bash
script/spotify-list https://open.spotify.com/playlist/... > tracklist.txt
```

### script/tidal-list (export TIDAL tracklist only)

- Scrapes TIDAL playlists/albums/tracks and prints `Title - Artist` lines to stdout.
- Combine with shell redirection to build reusable tracklist files.

```bash
script/tidal-list https://tidal.com/playlist/... > tracklist.txt
```

### script/convert-flac-folder (reprocess downloads)

- Walks a directory of `.flac` files, converts each file through the organiser pipeline, and writes AIFFs into your organised library.
- Handy for re-running the organisation logic on old downloads.

```bash
script/convert-flac-folder out --by-genre --dry-run
```

## Output & Logs

- Organised AIFF files land under `ORGANISED_AIFF_DIR/Artist - Title.aiff` by default
- Detailed tidal‑dl-ng logs: `<dir>/.download-logs/`
- Unmatched lines: appended to `<dir>/not-found.log`
- Wrong matches: files removed and mismatch noted in summary

## Troubleshooting

- `tidal-dl-ng` not found: install via `pip install tidal-dl-ng` and ensure it's in PATH
- TIDAL authentication errors: run `tidal-dl-ng login` to re-authenticate
- Spotify API errors (401/403): verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env` (public content only)
- TIDAL scraping errors: TIDAL support uses unofficial API; if playlists fail to load, the underlying API may have changed
- Missing ffmpeg/ffprobe: install both and ensure they're in PATH
- Files not appearing in organised folder: check `ORGANISED_AIFF_DIR` and logs in `<dir>/.download-logs`
- Quality not available: Some tracks may only be available at lower quality (e.g., HIGH instead of LOSSLESS)

More: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## Development

- Type-check: `yarn typecheck`
- Tests (Jest): `yarn test`
- Lint: `yarn lint` (autofix: `yarn lint:fix`)
- Format: `yarn format` / `yarn format:check`

See: [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)

## Utility Scripts

- Python helpers for organizing/cleaning an existing library live in `scripts/`.
- Overview and usage: see `scripts/README.md`.

## Repository Map (short)

- `script/run`: unified entrypoint for Spotify/TIDAL/file input
- `script/spotify-list`: fetches `Title - Artist` lines from Spotify
- `script/tidal-list`: fetches `Title - Artist` lines from TIDAL
- `script/run-lucky`: process a tracklist file with tidal-dl-ng
- `script/convert-flac-folder`: re-run AIFF organisation for existing FLACs
- `script/setup`: idempotent environment bootstrapper
- `src/tidalRunner.ts`: tidal‑dl-ng integration (search, spawning, validation, logging)
- `src/lib/tidalSearch.ts`: TIDAL API search integration
- `src/lib/organiser.ts`: AIFF conversion and organised library placement
- `src/lib/tags.ts`: ffprobe tag helpers
- `src/lib/fsWalk.ts`: filesystem walking/snapshots
- `src/lib/proc.ts`: child-process utility

## Architecture

For a deeper dive into the flow and decisions, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Legal

Use responsibly and in accordance with TIDAL/Spotify terms. This tool automates search and download via your `tidal-dl-ng` configuration; ensure you have rights to obtain and use downloaded content (requires TIDAL subscription).

## License

Released under the MIT License. See `LICENSE` for details.
