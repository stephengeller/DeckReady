**Python Utilities**

- Overview: Small, standalone helpers for cleaning and organizing a local audio library (Rekordbox-friendly). Each script runs from the command line and prints a clear, dry-run preview when supported.
- Location: All scripts live under `script/utilities/`.
- Dependencies: Some scripts use `mutagen` and `python-dotenv`. Install with:
  ```bash
  python3 -m pip install mutagen python-dotenv
  ```

**Configuration**

Set `MUSIC_LIBRARY_DIR` in your `.env` file (in the project root) to specify your music library directory:

```bash
# In .env
MUSIC_LIBRARY_DIR=~/Music/DJLibrary
```

All scripts will use this directory by default. You can still override by passing a directory as the first argument.

**Scripts**

- `script/utilities/organize_audio.py`: Organizes audio files into `Artist/Title.ext` structure
  - Features: Accepts files/folders, reads tags via mutagen (falls back to macOS `mdls` and filename), move/copy modes, duplicate handling (skip, unique, overwrite), optional notifications and logging
  - Uses: `MUSIC_LIBRARY_DIR` from `.env` or `--dest` flag
  - Example: `python3 script/utilities/organize_audio.py /path/to/files --mode move --dry-run`

- `script/utilities/flatten_all_songs.py`: Flattens a directory tree by moving all audio files into the root, resolving name collisions with `(n)` suffixes and removing empty subfolders
  - Uses: `MUSIC_LIBRARY_DIR` from `.env` or pass directory as first argument
  - Example: `python3 script/utilities/flatten_all_songs.py [--dry-run|-n]`
  - Notes: Targets common audio extensions; safely skips junk files like `.DS_Store`

- `script/utilities/strip_hex_prefixes.py`: Removes leading 8-hex-digit prefixes (e.g., `0F9427F0_Track.aiff`) from filenames across a tree
  - Uses: `MUSIC_LIBRARY_DIR` from `.env` or pass directory as first argument
  - Example: `python3 script/utilities/strip_hex_prefixes.py [--dry-run|-n]`
  - Collision handling: Appends `(1)`, `(2)`, … if the cleaned name already exists

- `script/utilities/find_duplicates.py`: Finds probable duplicates by combining normalized artist/title (from tags or filename) with file length and size
  - Uses: `MUSIC_LIBRARY_DIR` from `.env` or pass directory as first argument
  - Example: `python3 script/utilities/find_duplicates.py`
  - Options: Emits a suggested `rm` command for duplicates
  - Requires: `mutagen`

- `script/utilities/find_exact_duplicates.py`: Detects exact duplicates by hashing just the audio payload (ignoring metadata) for MP3/WAV/AIFF/FLAC where possible; falls back to whole-file
  - Uses: `MUSIC_LIBRARY_DIR` from `.env` or pass directory as first argument
  - Example: `python3 script/utilities/find_exact_duplicates.py [--strict]`
  - Options: `--strict` hashes entire files including metadata
  - Output: Prints groups and a single `rm ...` command for deletions; suggests `mv` commands to collapse double extensions

- `script/utilities/normalize_filenames.py`: Renames files at the root to `Artist - Title.ext` using tags; falls back to defaults and sanitizes names
  - Uses: `MUSIC_LIBRARY_DIR` from `.env` or pass directory as first argument
  - Example: `python3 script/utilities/normalize_filenames.py [--dry-run|-n]`
  - Behavior: Ensures unique names with `(n)` suffixes; reports both tag-based and suffix-based duplicates and prints a single `rm` command for `(n)` variants
  - Requires: `mutagen`

**Tips**

- Configuration: Set `MUSIC_LIBRARY_DIR` in your `.env` file once and all scripts will use it
- Dry runs: Always use `--dry-run` first to preview changes before applying them
- Backups: These tools are conservative, but consider backing up your library before running
- Order: For a messy library, a typical flow is: `strip_hex_prefixes` → `flatten_all_songs` → `normalize_filenames` → `find_exact_duplicates`/`find_duplicates`
