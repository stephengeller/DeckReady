# Usage

## End-to-end flow

- Create an output folder for qobuz-dl (where temporary downloads land):
  - `mkdir -p out`
- Run the wrapper:
  - `script/run <spotify_url> --dir out [--dry] [--quality Q]`
- Examples:
  - Playlist (dry-run): `script/run https://open.spotify.com/playlist/... --dir out --dry`
  - Track: `script/run https://open.spotify.com/track/... --dir out`
  - Use your own lines file: `script/run --tracklist tracklist.txt --dir out`

`script/run` will:

- Generate lines from the Spotify URL via `script/spotify-list` (Spotify Web API) unless `--tracklist` is supplied.
- Call `run-lucky` to run Qobuz searches with validation.
- Convert files to AIFF and organise them under `ORGANISED_AIFF_DIR`.

## Running CLIs directly

### Generate a tracklist from Spotify

- `script/spotify-list "https://open.spotify.com/{playlist|album|track}/..."`
- Prints: `Song Title - Artist 1, Artist 2` per line.
- Good for building your own curated list or auditing what Spotify rendered.

### Run lucky downloads for a tracklist

- `run-lucky <tracklist.txt> --dir <out> [--dry] [--quiet|--verbose] [--json] [--summary-only]`
- Behaviour:
  - Tries multiple search candidates per line, prefers `-q 6` (lossless), falls back to `-q 5` (320) if needed.
  - Writes query logs under `<out>/.qobuz-logs/`.
  - Validates tags in downloaded audio; removes wrong matches and reports `mismatch`.
  - Converts to AIFF and organises to `ORGANISED_AIFF_DIR/Genre/Artist/Title.aiff`.

### Common options

- `--dir DIR` (required): qobuz-dl download directory for verifying writes.
- `--quality Q`: 5=320, 6=LOSSLESS, 7=24b≤96k, 27=>96k (default 6). `run-lucky` manages fallback.
- `--dry`: print commands without downloading.
- `--quiet` / `--verbose`: control streaming of qobuz-dl output.
- `--json`: JSON summary (machine-friendly).
- `--summary-only`: suppress per-file logs; emit summary counters at the end.

## Environment

Add to `.env`:

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`: required for Spotify Web API access (client credentials).
- `SPOTIFY_USER_TOKEN` (optional): a user access token (Authorization Code flow) with `playlist-modify-private` scope to enable automatic creation of a Spotify playlist containing tracks that failed to match or download from Qobuz.
- `ORGANISED_AIFF_DIR`: destination base for AIFF files; default `~/Music/rekordbox/Organised_AIFF`.

## Notes

- You must install and configure `qobuz-dl` with your credentials. This repo does not handle Qobuz auth.
- Install ffmpeg/ffprobe and ensure they’re in your PATH.
