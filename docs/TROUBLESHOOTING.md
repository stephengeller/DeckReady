# Troubleshooting

## qobuz-dl not found

- Install `qobuz-dl` and ensure it’s in your PATH. Verify with `qobuz-dl --help`.
- Configure your Qobuz credentials per the qobuz-dl docs.

## Playwright fails to launch

- Run: `npx playwright install chromium`.
- Ensure Node 18+ and no corporate proxy blocks the browser download.

## Private playlists/albums

- Headless scraping can’t access private content. Make playlists public or export a tracklist manually and use `--tracklist`.

## FFmpeg/ffprobe missing

- Install both tools and add them to PATH. Verify: `ffmpeg -version`, `ffprobe -version`.

## Files not appearing in organised folders

- Confirm `ORGANISED_AIFF_DIR` is set (or use the default). Check console output for lines like `Organised (converted -> AIFF): ...`.
- Inspect `<dir>/.qobuz-logs/` for per-query logs and `<dir>/not-found.log` for unfound tracks.

## Frequent mismatches

- Some titles include remix/edit tokens that vary cross‑platforms. The tool uses relaxed matching (base title and remix parentheticals) but will delete suspected wrong matches.
- Consider editing the tracklist line to be more specific (e.g., add "remix" term) or try a manual query.

## Slow or incomplete Spotify scraping

- The scraper auto‑scrolls for up to ~60s. Huge playlists may need more time; re‑run if truncated.
- Regional or A/B UI changes can affect selectors. Report issues with the URL and a short description.
