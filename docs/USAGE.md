# Usage

## Entrypoints at a Glance

- `script/setup`: one-time (or occasional) bootstrap that installs deps, prepares `.env`, validates required CLIs.
- `script/run`: primary workflow — accept Spotify/Qobuz URLs or tracklist files and orchestrate scraping + downloading.
- `script/run-lucky`: process a prepared `Title - Artist` list directly with `qobuz-dl`.
- `script/qobuz-dl-url`: download a single Qobuz playlist/album/track without Spotify scraping.
- `script/spotify-list`: print Spotify tracks as `Title - Artist` lines.
- `script/convert-flac-folder`: re-run organiser/AIFF conversion on an existing folder of FLACs.

Each helper lives under `./script/` and can also be executed via `yarn <name>` (for example, `yarn setup`).

## script/setup

```bash
script/setup
# or: yarn setup / npm run setup
```

- Installs Node dependencies using Yarn/NPM.
- Copies `.env.example` to `.env` (or appends missing keys) so you can add Spotify credentials.
- Ensures `~/Music/rekordbox/DROP_NEW_SONGS_HERE` exists for organised AIFF output.
- Verifies `qobuz-dl`, `ffmpeg`, and `ffprobe` are on your `PATH` and prints install hints if not.

Run it after cloning, when dependencies change, or if you switch machines.

## script/run (recommended)

```bash
script/run <spotify_url|qobuz_url|tracklist_file> --dir out [options]
```

- Accepts Spotify playlist/album/track URLs, Qobuz URLs, or local text files of `Title - Artist` lines.
- For Spotify URLs it invokes `script/spotify-list` under the hood, then feeds the results to the lucky runner.
- Handles download orchestration, logging, AIFF conversion, and library organisation.

Key options:

- `--dir DIR`: output directory for qobuz-dl downloads (required).
- `--quality Q`: 5=320, 6=LOSSLESS (default), 7=24-bit ≤96k, 27=>96k.
- `--dry`: print the qobuz-dl commands without downloading.
- `--quiet` / `--verbose`: collapse or expand underlying qobuz-dl output.
- `--by-genre`: organise as `Genre/Artist/Title.aiff` instead of the flat layout.
- `--flac-only`: skip AIFF conversion/organisation and keep the raw downloads.
- `--convert`: experimental — use `ffmpeg` to convert downloads to AIFF in place.
- `--artist-first` / `--title-first`: override how `Title - Artist` lines are parsed.
- Any additional `--flag` is forwarded to `script/run-lucky`.

Environment variables:

- `.env` must supply `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
- `ORGANISED_AIFF_DIR` controls the organised output location (default `~/Music/rekordbox/DROP_NEW_SONGS_HERE`).
- `ORGANISED_FLAT=false` switches to `Artist/Title.aiff` layout (otherwise `Artist - Title.aiff`).

## script/run-lucky (advanced tracklist runner)

```bash
script/run-lucky tracklist.txt --dir out [--quality Q] [--dry] [--by-genre] [--flac-only] [--artist-first|--title-first]
```

- Processes an existing tracklist file line-by-line; great for exporting from other tools or editing manually.
- Requires `--dir` so the runner can find downloads and stash logs.
- Shares flags with `script/run`, including `--dry`, `--quiet`/`--verbose`, `--progress`, and `--no-color`.
- Reuses prior downloads when matching `.search.txt` sidecars are present in the output directory.

## script/qobuz-dl-url (direct Qobuz helper)

```bash
script/qobuz-dl-url https://open.qobuz.com/album/... --dir out [--quality Q] [--dry] [--by-genre] [--flac-only]
```

- Wraps `qobuz-dl` for a single Qobuz playlist/album/track URL.
- Provides nicer progress output plus the organiser/AIFF pipeline.
- Ideal when you already have Qobuz URLs and want to bypass Spotify scraping.

## script/spotify-list (tracklist exporter)

```bash
script/spotify-list https://open.spotify.com/playlist/... > tracklist.txt
```

- Prints `Title - Artist` entries for Spotify playlists, albums, or single tracks.
- Useful for capturing a list once and reusing it with `script/run-lucky`.

## script/convert-flac-folder (reprocess existing downloads)

```bash
script/convert-flac-folder out [--by-genre] [--quiet|--verbose] [--dry-run]
```

- Walks the specified directory, finds `.flac` files, and re-runs the organiser to produce AIFF output.
- Handy for cleaning up older downloads or restoring the organised library after manual edits.
- `--dry-run` shows which files would be processed without calling `ffmpeg`.

## Environment Recap

- `.env` requires `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` for API access.
- `ORGANISED_AIFF_DIR` determines where AIFFs are placed; defaults to `~/Music/rekordbox/DROP_NEW_SONGS_HERE`.
- `ORGANISED_FLAT` (default `true`) toggles flat vs nested library layout.
