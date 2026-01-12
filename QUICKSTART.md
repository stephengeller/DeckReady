# 🎧 Quick Start Guide for DJs

Get your Spotify playlists converted to organized AIFF files in 10 minutes.

## What You'll Get

✅ **Input**: Any Spotify playlist URL

✅ **Output**: Clean AIFF files organized in a folder, ready for Rekordbox/Serato/Traktor

✅ **Quality**: Lossless FLAC from TIDAL → AIFF (16-bit by default, 24-bit available)

---

## Prerequisites

Before you start, make sure you have:

- **Mac/Linux/Windows** with command line access
- **Node.js 20+** ([Download here](https://nodejs.org/))
- **Python 3** (usually pre-installed on Mac/Linux, [Windows download](https://www.python.org/downloads/))
- **TIDAL subscription** (HiFi or HiFi Plus for lossless quality)
- **Spotify account** (free account works fine)

---

## Setup (One Time Only)

### Step 1: Install Required Tools

Open your terminal and run:

```bash
# Install tidal-dl-ng (for downloading from TIDAL)
pip install tidal-dl-ng

# Install ffmpeg (for audio conversion)
# Mac (using Homebrew):
brew install ffmpeg

# Ubuntu/Debian:
sudo apt-get install ffmpeg

# Windows:
# Download from https://ffmpeg.org/download.html
```

### Step 2: Clone This Repository

```bash
git clone https://github.com/stephengeller/DeckReady-TIDAL.git
cd DeckReady-TIDAL
```

### Step 3: Run Setup Script

```bash
./script/setup
```

This will:

- Install Node dependencies
- Create a `.env` file for your settings
- Check that all tools are installed

### Step 4: Get Spotify API Keys

**Why?** To read public Spotify playlists (no Premium subscription required).

1. Go to https://developer.spotify.com/dashboard
2. Log in with your Spotify account
3. Click **"Create app"**
4. Name it anything (e.g., "DeckReady")
5. Copy the **Client ID** and **Client Secret**

Open `.env` in the repo folder and paste them:

```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

**💡 Tip**: Detailed steps with screenshots: [docs/CREDENTIALS.md](./docs/CREDENTIALS.md)

### Step 5: Login to TIDAL

```bash
tidal-dl-ng login
```

Follow the prompts to log in with your TIDAL account. This is needed to download tracks.

### Step 6: Set Your Output Folder

Open `.env` and set where you want your organized AIFF files:

```bash
ORGANISED_AIFF_DIR=/Users/yourname/Music/Rekordbox/Imports
```

**Default**: `~/Music/rekordbox/DROP_NEW_SONGS_HERE` (will be created automatically)

---

## Usage

### Convert a Spotify Playlist

```bash
./script/run "https://open.spotify.com/playlist/..."
```

That's it! The script will:

1. Read tracks from the Spotify playlist
2. Search for each track on TIDAL
3. Download lossless FLAC files
4. Convert to AIFF with metadata
5. Organize into your output folder as `Artist - Title.aiff`

### Try it First (Dry Run)

Want to see what will happen without downloading?

```bash
./script/run "https://open.spotify.com/playlist/..." --dry
```

### Other Examples

```bash
# Convert a Spotify album
./script/run "https://open.spotify.com/album/..."

# Convert a single track
./script/run "https://open.spotify.com/track/..."

# Use a TIDAL playlist directly
./script/run "https://tidal.com/playlist/..."

# Use a TIDAL album
./script/run "https://tidal.com/album/270779076"

# Organize by genre (Genre/Artist/Title.aiff)
./script/run "https://open.spotify.com/playlist/..." --by-genre

# Get hi-res 24-bit quality (if available on TIDAL)
./script/run "https://open.spotify.com/playlist/..." --quality HI_RES_LOSSLESS
```

---

## What Happens During Conversion?

When you run the script, here's what you'll see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Configuration:
  Tracklist:     spotify-playlist.txt
  Downloads:     .downloads (temp FLAC storage)
  Organized to:  ~/Music/Rekordbox/Imports
  Quality:       LOSSLESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Starting TIDAL downloads…
✓ Downloaded "Blue Monday" by New Order (LOSSLESS)
✓ Downloaded "Smalltown Boy" by Bronski Beat (LOSSLESS)
...

Summary:
  ✓ matched: 45
  ↺ already: 3
  ✗ mismatched: 0
  Ø not found: 2
```

**Temp files**: FLAC files are downloaded to `.downloads/` and automatically deleted after conversion.

**Final files**: AIFF files appear in your organized folder ready to import.

---

## Troubleshooting

### "tidal-dl-ng: command not found"

```bash
pip install tidal-dl-ng
# or
pip3 install tidal-dl-ng
```

### "ffmpeg: command not found"

Install ffmpeg using your package manager (see Step 1 above).

### "TIDAL authentication errors"

Re-run the login:

```bash
tidal-dl-ng login
```

### "Spotify API errors (401/403)"

Double-check your Client ID and Secret in `.env` are correct. Try regenerating the secret in the Spotify dashboard.

### Tracks not found on TIDAL

Some tracks may not be available on TIDAL:

- Check the `not-found.log` file in your downloads folder
- Try searching manually on TIDAL to confirm availability
- Regional availability varies

### More Help

- Full documentation: [README.md](./README.md)
- Troubleshooting guide: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
- File an issue: [GitHub Issues](https://github.com/stephengeller/DeckReady-TIDAL/issues)

---

## Tips for DJs

### Organize by Genre

Add `--by-genre` to organize as `Genre/Artist/Title.aiff`:

```bash
./script/run "spotify_url" --by-genre
```

### Batch Processing

Have multiple playlists? Create a text file with one URL per line:

```
https://open.spotify.com/playlist/...
https://open.spotify.com/playlist/...
https://open.spotify.com/playlist/...
```

Then run each one:

```bash
for url in $(cat playlists.txt); do
  ./script/run "$url"
done
```

### Check for Duplicates

The tool automatically skips tracks you've already downloaded and organized. Run the same playlist twice - it'll only download new tracks!

### Import to Rekordbox

1. Set `ORGANISED_AIFF_DIR` to your Rekordbox import folder
2. After running the script, open Rekordbox
3. Your tracks will appear in the import folder
4. Rekordbox will automatically analyze them

---

## What's Next?

- Read the full [README.md](./README.md) for advanced options
- Learn about [Architecture](./docs/ARCHITECTURE.md) if you're curious
- Contribute or report issues on [GitHub](https://github.com/stephengeller/DeckReady-TIDAL)

**Enjoy your new AIFF library!** 🎶
