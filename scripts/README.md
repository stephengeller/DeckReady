**Python Utilities**

- Overview: Small, standalone helpers for cleaning and organizing a local audio library (Rekordbox-friendly). Each script runs from the command line and prints a clear, dry-run preview when supported.
- Location: All scripts live under `scripts/`.
- Dependencies: Some scripts use `mutagen`. Install with `python3 -m pip install mutagen`.

**Conventions**

- Default root: Several scripts default to `~/Music/rekordbox/ALL_SONGS`. Pass a path as the first argument to target a different folder.
- Dry runs: Where available, use `--dry-run` or `-n` to preview actions.

**Scripts**

- `scripts/organize_audio.py`: Organizes dropped audio into `~/Music/rekordbox/ALL_MUSIC_BY_ARTIST/Artist/Title.ext`.
  - Features: Accepts files/folders, reads tags via mutagen (falls back to macOS `mdls` and filename), move/copy modes, duplicate handling (skip, unique, overwrite), optional notifications and logging.
  - Example: `python3 scripts/organize_audio.py --dest "~/Music/rekordbox/ALL_MUSIC_BY_ARTIST" /path/to/files --mode move --dry-run`

- `scripts/flatten_all_songs.py`: Flattens a directory tree by moving all audio files into the root, resolving name collisions with `(n)` suffixes and removing empty subfolders.
  - Use: `python3 scripts/flatten_all_songs.py [ROOT] [--dry-run|-n]`
  - Notes: Targets common audio extensions; safely skips junk files like `.DS_Store`.

- `scripts/strip_hex_prefixes.py`: Removes leading 8-hex-digit prefixes (e.g., `0F9427F0_Track.aiff`) from filenames across a tree.
  - Use: `python3 scripts/strip_hex_prefixes.py [ROOT] [--dry-run|-n]`
  - Collision handling: Appends `(1)`, `(2)`, … if the cleaned name already exists.

- `scripts/find_duplicates.py`: Finds probable duplicates by combining normalized artist/title (from tags or filename) with file length and size.
  - Use: `python3 scripts/find_duplicates.py` (edit `FOLDER` inside, or pass in code), or move to a custom path and run.
  - Options: Emits a suggested `rm` command for duplicates when adapted (`--emit-rm` support in the reporting helper).
  - Requires: `mutagen`.

- `scripts/find_exact_duplicates.py`: Detects exact duplicates by hashing just the audio payload (ignoring metadata) for MP3/WAV/AIFF/FLAC where possible; falls back to whole-file.
  - Use: `python3 scripts/find_exact_duplicates.py [ROOT]` (default root is embedded).
  - Options: `--strict` hashes entire files including metadata.
  - Output: Prints groups and a single `rm ...` command for deletions; suggests `mv` commands to collapse double extensions.

- `scripts/normalize_filenames.py`: Renames files at the root to `Artist - Title.ext` using tags; falls back to defaults and sanitizes names.
  - Use: `python3 scripts/normalize_filenames.py [ROOT] [--dry-run|-n]`
  - Behavior: Ensures unique names with `(n)` suffixes; reports both tag-based and suffix-based duplicates and prints a single `rm` command for `(n)` variants.
  - Requires: `mutagen`.

**Tips**

- Backups: These tools are conservative, but consider running with `--dry-run` first and/or backing up your library.
- Order: For a messy library, a typical flow is: `strip_hex_prefixes` → `flatten_all_songs` → `normalize_filenames` → `find_exact_duplicates`/`find_duplicates`.
