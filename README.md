# DeckReady-TIDAL

**Convert Spotify playlists to organized AIFF files for your DJ library.**

Drop in a Spotify playlist URL → Get lossless AIFF files ready for Rekordbox/Serato/Traktor.

---

## 🎧 New to This?

**→ [Quick Start Guide for DJs](./QUICKSTART.md)** — Step-by-step setup in 10 minutes

---

## What You Get

**Input**: Spotify playlist URL
**Output**: Organized AIFF files in your DJ library folder

✓ Lossless quality from TIDAL (FLAC → AIFF)
✓ Full metadata (artist, title, album, genre, artwork)
✓ Automatic duplicate detection
✓ Clean filenames: `Artist - Title.aiff`

---

## Setup

```bash
git clone https://github.com/stephengeller/DeckReady-TIDAL.git
cd DeckReady-TIDAL
./script/setup
```

The setup script handles everything:
- ✓ Installs dependencies
- ✓ Guides you through Spotify API credentials
- ✓ Checks for required tools
- ✓ Configures your output folder

Then login to TIDAL:

```bash
tidal-dl-ng login
```

**That's it!** You're ready to download.

**Need help?** See the [Quick Start Guide](./QUICKSTART.md) for detailed instructions.

## Configuration

The setup script will guide you through everything, but if you need to change settings later, edit `.env`:

- `ORGANISED_AIFF_DIR` — Where your organized AIFF files go
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — For reading Spotify playlists

**Getting Spotify credentials**: [QUICKSTART.md](./QUICKSTART.md) has step-by-step instructions.

## Usage

```bash
./script/run "https://open.spotify.com/playlist/..."
```

That's it! Your AIFF files will be organized in the folder you configured during setup.

**Notes**:
- Works with Spotify or TIDAL URLs (playlists, albums, tracks)
- Temp files are automatically cleaned up after conversion
- Final files go to the folder in `.env` (default: `~/Music/rekordbox/DROP_NEW_SONGS_HERE`)

### Common Options

```bash
# Dry run (preview without downloading)
./script/run "<url>" --dry

# 24-bit quality
./script/run "<url>" --quality HI_RES_LOSSLESS

# Organize by genre
./script/run "<url>" --by-genre
```

**More examples**: See [QUICKSTART.md](./QUICKSTART.md)


## Where Files Go

**Your organized AIFF files**: The folder you configured in `.env` (default: `~/Music/rekordbox/DROP_NEW_SONGS_HERE`)

**Temporary downloads**: System temp directory (automatically cleaned up after conversion)

**Logs**: Check the organized folder for `.download-logs/` and `not-found.log`

Files are saved as `Artist - Title.aiff` (or `Genre/Artist/Title.aiff` with `--by-genre`).

## Troubleshooting

**Tool not found**: `pip install tidal-dl-ng` or `brew install ffmpeg`

**TIDAL auth errors**: `tidal-dl-ng login` (needs HiFi/HiFi Plus subscription)

**Spotify API errors**: Check credentials in `.env` or regenerate at [developer.spotify.com](https://developer.spotify.com/dashboard)

**Tracks not found**: Check `not-found.log` in your organized folder — some tracks may not be available in your region

**Files not appearing**: Check `.env` settings and `.download-logs/` in your organized folder for errors

**Need more help?** [File an issue](https://github.com/stephengeller/DeckReady-TIDAL/issues) or see [detailed troubleshooting](./docs/TROUBLESHOOTING.md)

---

## For Developers

**Contributing**: See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for setup, testing, and architecture

**Advanced usage**: See [QUICKSTART.md](./QUICKSTART.md) for batch processing, tracklist files, and more

---

## Legal

Use responsibly. Requires a TIDAL subscription for downloads. Respect TIDAL and Spotify terms of service.

## License

MIT License — See `LICENSE` for details.
