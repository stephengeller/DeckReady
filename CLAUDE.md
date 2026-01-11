# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeckReady is a TypeScript CLI tool that converts Spotify/TIDAL URLs into clean, tagged AIFF files organized for DJ use. The pipeline scrapes track metadata from Spotify or TIDAL, searches and downloads audio from TIDAL via `tidal-dl-ng`, converts to AIFF with `ffmpeg`, and organizes files by artist/title/genre.

## Common Commands

### Setup
```bash
script/setup            # Idempotent: installs deps, creates .env, checks external tools
```

### Development
```bash
yarn typecheck          # Type-check without emitting files
yarn test               # Run Jest tests (with --runInBand)
yarn lint               # ESLint check
yarn lint:fix           # Auto-fix linting issues
yarn format             # Format with Prettier
yarn format:check       # Check formatting
```

### Running Tests
```bash
yarn test                                    # All tests
yarn test -- path/to/file.spec.ts          # Single test file
yarn test -- --testNamePattern="pattern"    # Specific test
```

### Main CLI Scripts
```bash
# Unified entrypoint (Spotify/TIDAL URL or tracklist file)
script/run <url|file> --dir out [--quality Q] [--dry] [--by-genre] [--flac-only]

# Individual tools
script/spotify-list <spotify_url>                    # Scrape Spotify tracklist only
script/tidal-list <tidal_url>                        # Scrape TIDAL tracklist only
script/run-lucky <tracklist> --dir out               # Process tracklist with tidal-dl-ng
script/convert-flac-folder <dir> [--by-genre]        # Re-organize existing FLACs

# Quality options: LOW, HIGH, LOSSLESS (default), HI_RES_LOSSLESS
```

## Architecture

### Pipeline Flow
1. **Input**: Spotify/TIDAL URL or text file with `Title - Artist` lines
2. **Scraping** (`src/lib/spotifyApi.ts` or `src/lib/tidalApi.ts`): Fetch track metadata via Spotify Web API or TIDAL API
3. **Query Building** (`src/lib/queryBuilders.ts`, `src/lib/normalize.ts`): Generate ranked search candidates (artist-first, title-first, remix-aware)
4. **Search** (`src/lib/tidalSearch.ts`): Query TIDAL API for matching tracks, get candidate URLs
5. **Download** (`src/tidalRunner.ts`): For each candidate URL, run `tidal-dl-ng` with filesystem snapshots to detect new files
6. **Validation** (`src/provider/validation.ts`): Compare downloaded file tags against expected artist/title; delete wrong matches
7. **Conversion** (`src/lib/organiser.ts`, `src/organiser/ffmpeg.ts`): Convert to AIFF via ffmpeg with metadata preservation
8. **Organization** (`src/lib/organiser.ts`): Move to `ORGANISED_AIFF_DIR` with configurable layout

### Key Modules

**Core Pipeline**
- `src/lib/runLuckyForTracklist.ts`: Main orchestrator for tracklist processing
  - Loops through each track line
  - Tries LOSSLESS first, falls back to HIGH (320kbps) if no explicit quality specified
  - Handles dry-run, quiet/verbose modes
  - Tracks summary counters (matched/already/mismatched/not-found)
  - Caches previous downloads via `.search.txt` sidecar files

**TIDAL Search & Download**
- `src/lib/tidalSearch.ts`: TIDAL API search integration
  - `searchTidalTracks()`: Search TIDAL catalog, return structured results with track IDs and URLs
  - Uses unofficial TIDAL API with public token
  - Returns up to 5 candidates per search query

- `src/tidalRunner.ts`: Wraps `tidal-dl-ng` execution
  - `runTidalDlStrict()`: Search TIDAL, download candidates, validate tags
  - For each candidate: download via `tidal-dl-ng dl <url>`, validate, return on first match
  - Temporarily modifies `~/.config/tidal_dl_ng/settings.json` for quality and directory
  - Filesystem snapshots (before/after) to detect new audio files
  - Writes per-run logs to `<dir>/.download-logs/`
  - Handles "already downloaded" detection to avoid redundant fallback

**Audio Processing**
- `src/lib/organiser.ts`: AIFF conversion and file organization
  - `processDownloadedAudio()`: Convert to AIFF, preserve metadata, move to organized location
  - `findOrganisedAiff()`: Check if track already exists in organized library
  - Supports three layouts: flat (default: `Artist - Title.aiff`), by-genre (`Genre/Artist/Title.aiff`), nested (`Artist/Title.aiff`)

**Metadata & Normalization**
- `src/lib/normalize.ts`: Clean track metadata for search (strip decorations, normalize accents, detect remixes)
- `src/lib/queryBuilders.ts`: Build ranked candidate queries from normalized parts
- `src/lib/tags.ts`: ffprobe wrapper for reading audio file tags
- `src/organiser/ffmpeg.ts`: Build ffmpeg args for AIFF conversion with metadata mapping
- `src/organiser/names.ts`: Path-safe sanitization, genre selection

**CLI Entrypoints**
- `src/cli/runLucky.ts`: Thin wrapper for `runLuckyForTracklist.ts`
- `src/cli/spotifyList.ts`: Spotify scraper CLI
- `src/cli/tidalList.ts`: TIDAL scraper CLI
- `src/cli/tidalSearch.ts`: TIDAL search test CLI (for debugging)
- `src/cli/convertFlacFolder.ts`: Bulk re-organization of existing FLACs

**Shell Scripts**
- `script/run`: Bash wrapper that dispatches to appropriate CLI tool based on input type (Spotify/TIDAL URL or tracklist file)
- `script/setup`: Bootstrap script (deps, .env, directory creation, tool checks)

### Organization Layouts

Three modes (controlled by env vars and CLI flags):
1. **Flat** (default, `ORGANISED_FLAT=true`): `ORGANISED_AIFF_DIR/Artist - Title.aiff`
2. **By-genre** (`--by-genre` flag): `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`
3. **Nested** (`ORGANISED_FLAT=false`): `ORGANISED_AIFF_DIR/Artist/Title.aiff`

### Matching Strategy

1. Generate multiple candidate queries (artist-first, title-first, normalized variants)
2. For each query:
   - Search TIDAL API, get up to 5 candidate track URLs
   - For each candidate URL:
     - Download via `tidal-dl-ng dl <url>` at LOSSLESS quality
     - Validate downloaded tags against expected artist/title
     - On match: return success
     - On mismatch: delete file, log mismatch, STOP trying more candidates
     - On not found: try next candidate
   - If no match at LOSSLESS, retry all candidates at HIGH (320kbps) quality
3. Cache downloads via `.search.txt` sidecar files for reuse
4. Treat "already downloaded" as success (avoid redundant downloads)

### Environment & Config

- `.env` (from `.env.example`):
  - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`: Required for Spotify Web API (for scraping Spotify playlists/albums)
  - `ORGANISED_AIFF_DIR`: Base folder for organized AIFFs (default: `~/Music/rekordbox/DROP_NEW_SONGS_HERE`)
  - `ORGANISED_FLAT`: Boolean toggle for flat vs nested layout (default: true)
- External dependencies: `tidal-dl-ng`, `ffmpeg`, `ffprobe` must be in PATH
- TIDAL authentication: Must run `tidal-dl-ng login` before first use
- tidal-dl-ng config: `~/.config/tidal_dl_ng/settings.json` (automatically managed during downloads)

## Testing

- Framework: Jest with `ts-jest`
- Test setup: `test/jest_shims/silenceConsole.js` silences console output
- Test structure:
  - Unit tests: `test/*.spec.ts`
  - Integration tests: `test/integration/*.spec.ts`
  - Spawn tests: Mock child processes with `spawnStreaming` wrapper
- Key patterns:
  - Mock `src/lib/proc.ts` `spawnStreaming` for isolated tidal-dl-ng tests
  - Mock `src/lib/tidalSearch.ts` `searchTidalTracks` for search API tests
  - Use `Runner` type from `src/lib/tags.ts` to inject test doubles for ffmpeg/ffprobe

## TypeScript Config

- Target: ES2020, CommonJS modules
- `strict: false` (relaxed type checking)
- `noEmit: true` (type-check only, no compilation)
- Source in `src/`, tests in `test/`

## Gotchas

- **TIDAL Authentication**: Must run `tidal-dl-ng login` before first use. Session expires periodically and requires re-authentication.
- **Filesystem snapshots**: `tidalRunner.ts` snapshots the download directory before/after tidal-dl-ng runs to detect which files are new. This is critical for correct validation.
- **Tag validation**: Downloads are validated by comparing ffprobe tags against expected artist/title. Mismatches are deleted immediately to avoid polluting the library.
- **Config file manipulation**: tidalRunner temporarily modifies `~/.config/tidal_dl_ng/settings.json` to set quality and download directory, then restores original values. This is wrapped in try/finally for safety.
- **Search-based matching**: Unlike qobuz-dl's "lucky" mode, we explicitly search TIDAL's catalog via their API, then download candidates by URL until validation passes.
- **Flat layout default**: Flat layout (`Artist - Title.aiff` directly under base dir) is the default. The `--by-genre` flag enables hierarchical organization.
- **Quality fallback**: By default, the runner tries LOSSLESS then HIGH (320kbps). Use `--quality Q` to override and skip fallback.
- **Quality names vs numbers**: Use quality names (LOW, HIGH, LOSSLESS, HI_RES_LOSSLESS) not numbers (5, 6, 7). Old numeric values are auto-mapped for compatibility.
- **Already-downloaded detection**: tidal-dl-ng may report success with no new files. The runner treats this as success to avoid unnecessary HIGH fallback, and checks cached downloads via `.search.txt` sidecars.
- **Console output**: Tests silence console via `silenceConsole.js` setup file. When debugging tests, temporarily disable this shim.
- **TIDAL API integration**:
  - TIDAL URL scraping (`tidalApi.ts`) uses the official TIDAL OpenAPI v2 with an unofficial public token
  - TIDAL search (`tidalSearch.ts`) uses the same API for track search
  - TIDAL uses UUIDs for playlist/album IDs, but numeric IDs for track search results
  - API defaults to country code "US" for content availability
