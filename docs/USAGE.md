# Usage

Quickest way:

- `mkdir -p out`
- `script/run <spotify_url|qobuz_url|tracklist_file> --dir out [--dry] [--quality Q]`

Notes:

- You can pass a text file of `Title - Artist` lines instead of a URL.
- For Spotify URLs, the wrapper fetches lines via `script/spotify-list`.
- Downloads are validated, converted to AIFF, and organised under `ORGANISED_AIFF_DIR`.
- Default layout: flat `Title.aiff`; use `--by-genre` for `Genre/Artist/Title.aiff`.

Flags:

- `--dir DIR`: where qobuz-dl downloads land (required)
- `--quality Q`: prefer 6; 5 used as fallback when needed
- `--dry`: preview commands without making changes
- `--quiet` / `--verbose`: hide or show underlying qobuz-dl output
- `--by-genre`: organise as `Genre/Artist/Title.aiff` instead of the flat default

Direct CLIs:

- `script/spotify-list https://open.spotify.com/{playlist|album|track}/...`
- `run-lucky <tracklist.txt> --dir <out> [--dry] [--quiet|--verbose] [--by-genre]`

Environment:

- `.env` requires `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` for the Web API.
- `ORGANISED_AIFF_DIR` controls the organised AIFF base; default `~/Music/rekordbox/DROP_NEW_SONGS_HERE`.
- `ORGANISED_FLAT` controls flat vs nested layout. Default is flat; set to `false` to use `Artist/Title.aiff`.
