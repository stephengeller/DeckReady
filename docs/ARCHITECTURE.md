# Architecture

## Overview

The pipeline turns Spotify items into organised AIFF files:

1. `spotifyList` scrapes a public Spotify page using Playwright and prints lines like `Title - Artist 1, Artist 2`.
2. `runLuckyForTracklist` reads each line, generates search candidates, and runs `qobuz-dl lucky` with strict validation.
3. Downloaded audio is converted to AIFF and organised to `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`.

## Key modules

- `src/cli/spotifyList.ts`: Headless Chromium browser extracts visible titles and artists with light anti-bloat routing and auto-scrolling to load all items.
- `src/lib/normalize.ts`: Cleans titles/artists into search-friendly strings (strip decorations, normalise accents, detect remix-like variants).
- `src/lib/queryBuilders.ts`: Builds a ranked list of candidate queries (artist-first, title-first, exact phrases, remix-aware).
- `src/qobuzRunner.ts`: Integrates with `qobuz-dl`, snapshots the filesystem to detect new audio, validates metadata with ffprobe, and organises output.
- `src/lib/runLuckyForTracklist.ts`: Orchestrates per-line attempts, handles dry-run/quiet/verbose, tracks summary counters and writes logs.

## Matching strategy

- Attempt lossless (`-q 6`) first; if not found, fallback to 320 (`-q 5`).
- On wrong matches (based on tag comparison vs expected artist/title):
  - Delete the newly downloaded files.
  - Log details and stop further attempts for that track if subsequent candidates produce the same wrong file.
- Treat qobuz-dl "already downloaded" as success to avoid redundant fallback.

## Organisation

- AIFF conversion via ffmpeg (`pcm_s16le`) with metadata mapped and verified.
- Destination path is built from tags with path-safe sanitisation and deduped filenames: `Genre/Artist/Title.aiff`.
- If the input file is already AIFF, it’s moved without conversion.

## Configuration

- `ORGANISED_AIFF_DIR` controls the base folder for organised AIFFs.
- `.env` loading is supported via `dotenv`; Spotify client credentials are optional and currently unused in scraping.

## Logging

- Per-query output (stdout/stderr and the exact qobuz-dl command) is saved under `<dir>/.qobuz-logs/`.
- Summaries include counts for matched, already, mismatched, and not found, plus pointers to log files.
