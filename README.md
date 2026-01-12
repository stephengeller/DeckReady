# DeckReady-TIDAL — Spotify Playlists → Organized AIFF Files

**For DJs**: Drop in a Spotify playlist URL, get back clean AIFF files ready for Rekordbox/Serato/Traktor.

## What It Does

1. **Input**: Any Spotify or TIDAL playlist/album/track URL
2. **Download**: Fetches lossless audio from TIDAL (FLAC, falls back to 320kbps)
3. **Convert**: Creates AIFF files with full metadata (title, artist, album, genre, artwork)
4. **Organize**: Saves to your DJ library folder as `Artist - Title.aiff`
5. **Skip Duplicates**: Detects tracks you already have and won't re-download

**New to this?** → Start with the [Quick Start Guide for DJs](./QUICKSTART.md)

## Requirements

- **Mac/Linux/Windows** with command line
- **Node.js 18+** ([download](https://nodejs.org/))
- **TIDAL subscription** (HiFi or HiFi Plus for lossless quality)
- **Spotify account** (free account works — no login needed for public playlists)

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

## Installation

The setup script will check for these and guide you through installation:

- Node.js 18+ ([download](https://nodejs.org/))
- Python 3 (for `tidal-dl-ng`)
- `ffmpeg` (audio conversion)

```bash
git clone https://github.com/stephengeller/DeckReady-TIDAL.git
cd DeckReady-TIDAL
./script/setup
```

The setup script will:
- Install all dependencies
- Guide you through getting Spotify API credentials
- Check for required tools (`tidal-dl-ng`, `ffmpeg`)
- Set up your output directory

Then authenticate with TIDAL:

```bash
tidal-dl-ng login
```

## Configuration

After running `./script/setup`, edit the `.env` file to configure:

### 1. Output Directory (Where Your Tracks Go)

```bash
# Where organized AIFF files end up
ORGANISED_AIFF_DIR=~/Music/rekordbox/DROP_NEW_SONGS_HERE
```

This is the folder where your final, organized AIFF files will be saved. Point it to your DJ software's import folder.

### 2. Spotify API Credentials

```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

**Why needed?** To read public Spotify playlists (no Spotify login required).

**How to get them:** See [QUICKSTART.md](./QUICKSTART.md) or [docs/CREDENTIALS.md](./docs/CREDENTIALS.md)

**Note**: TIDAL playlists work without any API credentials.

## Quick Start

### First Time Setup

```bash
# 1. Clone and setup
git clone https://github.com/stephengeller/DeckReady-TIDAL.git
cd DeckReady-TIDAL
./script/setup

# 2. Login to TIDAL
tidal-dl-ng login
```

The setup script will guide you through getting Spotify API credentials and configuring your output folder.

**Detailed setup guide**: [QUICKSTART.md](./QUICKSTART.md)

### Basic Usage

```bash
# Convert a Spotify playlist
./script/run "https://open.spotify.com/playlist/..." --dir out

# That's it! Your AIFF files will be organized and ready to import.
```

The `--dir out` flag is just temporary working space. Your organized files go to the folder you configured in `.env` (default: `~/Music/rekordbox/DROP_NEW_SONGS_HERE`).

### More Examples

```bash
# Try it first without downloading (dry run)
./script/run "https://open.spotify.com/playlist/..." --dir out --dry

# Use a TIDAL playlist directly
./script/run "https://tidal.com/playlist/0d5165ae-81e3-4864-ab7c-2cd0b03f3572" --dir out

# Get 24-bit quality (if available on TIDAL)
./script/run "https://open.spotify.com/playlist/..." --dir out --quality HI_RES_LOSSLESS

# Organize by genre (Genre/Artist/Title.aiff)
./script/run "https://open.spotify.com/playlist/..." --dir out --by-genre
```

## Usage

### Main Command: `script/run`

This is what you'll use most of the time. It handles everything end-to-end.

```bash
./script/run <spotify_or_tidal_url> --dir out [options]
```

**Common Options**:

- `--dir out` - Temporary download folder (will be cleaned up after organizing)
- `--dry` - Preview what will happen without downloading
- `--by-genre` - Organize as `Genre/Artist/Title.aiff` (default is `Artist - Title.aiff`)
- `--quality HI_RES_LOSSLESS` - Request 24-bit quality (default: `LOSSLESS`)
- `--quiet` - Hide detailed output
- `--verbose` - Show detailed output including TIDAL API responses

**What happens**:
1. Scrapes track list from Spotify/TIDAL
2. Downloads from TIDAL (FLAC format)
3. Converts to AIFF with metadata
4. Organizes into your configured folder
5. Cleans up temporary files

### Advanced Usage

#### Export Track Lists Only

```bash
# Get track list from Spotify playlist
./script/spotify-list "https://open.spotify.com/playlist/..." > tracklist.txt

# Get track list from TIDAL playlist
./script/tidal-list "https://tidal.com/playlist/..." > tracklist.txt
```

#### Process Existing Track List

```bash
./script/run-lucky tracklist.txt --dir out
```

#### Batch Process Multiple Playlists

```bash
for url in $(cat playlists.txt); do
  ./script/run "$url" --dir out
done
```

#### Re-organize Existing FLAC Files

```bash
./script/convert-flac-folder /path/to/flac/folder --by-genre
```

## Where Files Go

### Organized AIFF Files
Your final tracks go to `ORGANISED_AIFF_DIR` (configured in `.env`):
- **Default layout**: `Artist - Title.aiff`
- **With `--by-genre`**: `Genre/Artist/Title.aiff`

### Temporary Files
The `--dir out` folder contains:
- Downloaded FLAC files (deleted after conversion)
- `.download-logs/` - Detailed logs for each download
- `not-found.log` - Tracks that couldn't be found on TIDAL

### What Happens to Duplicates
- If you already have a track in your organized folder, it won't be downloaded again
- Remix variations are treated as different tracks
- Multi-artist tracks are matched intelligently (e.g., "Drum Origins" matches "Drum Origins, Emery, Dreazz")

## Troubleshooting

### Common Issues

**"tidal-dl-ng: command not found"**
```bash
pip install tidal-dl-ng
# or: pip3 install tidal-dl-ng
```

**TIDAL authentication errors**
```bash
tidal-dl-ng login
```
You need a TIDAL HiFi or HiFi Plus subscription for lossless quality.

**Spotify API errors (401/403)**
- Check `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`
- Try regenerating the secret in [Spotify Dashboard](https://developer.spotify.com/dashboard)

**Tracks not found on TIDAL**
- Some tracks may not be available in your region
- Check `out/not-found.log` for details
- Try searching manually on TIDAL to confirm availability

**Files not appearing in organized folder**
- Check `ORGANISED_AIFF_DIR` setting in `.env`
- Look at logs in `out/.download-logs/` for errors
- Run with `--verbose` flag to see detailed output

**More help**: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) or [file an issue](https://github.com/stephengeller/DeckReady-TIDAL/issues)

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
