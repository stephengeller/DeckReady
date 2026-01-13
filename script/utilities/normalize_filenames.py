#!/usr/bin/env python3
import os
import re
import sys
import shlex
from typing import Tuple, Optional
from mutagen import File as MutagenFile
from pathlib import Path

# Load .env file if available
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(env_path)
except ImportError:
    pass

# Extensions to process (lowercased)
EXTENSIONS = {".mp3", ".aiff", ".aif", ".wav"}


def is_audio(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in EXTENSIONS


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def sanitize_filename_component(s: str) -> str:
    # Normalize quotes and collapse whitespace
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201C", '"').replace("\u201D", '"')
    s = norm_ws(s)
    # Replace path separators with readable joiner and strip disallowed characters
    s = re.sub(r"[\\/]+", " & ", s)
    s = re.sub(r"[\0\n\r\t]", " ", s)
    s = re.sub(r"[:*?\"<>|]", "", s)
    s = norm_ws(s)
    return s


def read_artist_title(path: str) -> Tuple[str, str]:
    """Best-effort to read artist/title across MP3/AIFF/WAV using mutagen.
    Returns (artist, title) or ('','') if not found.
    """
    artist, title = "", ""

    try:
        audio_easy = MutagenFile(path, easy=True)
    except Exception:
        audio_easy = None

    if audio_easy and getattr(audio_easy, "tags", None):
        # Easy tags provide 'artist' and 'title' for many formats
        if not artist:
            a = audio_easy.tags.get("artist") if hasattr(audio_easy.tags, "get") else None
            if a:
                artist = norm_ws(", ".join(a))
        if not title:
            t = audio_easy.tags.get("title") if hasattr(audio_easy.tags, "get") else None
            if t:
                title = norm_ws(", ".join(t))

    if artist and title:
        return artist, title

    # Fallback to raw tags (e.g., ID3 in MP3/AIFF/WAV, or RIFF INFO in WAV)
    try:
        audio = MutagenFile(path)
    except Exception:
        audio = None

    tags = getattr(audio, "tags", None)
    if not tags:
        return artist, title

    # ID3 frames (MP3/AIFF/WAV with ID3)
    try:
        # Mutagen ID3 frames expose .getall / .text
        tpe1 = tags.get("TPE1")
        if not artist and tpe1 and getattr(tpe1, "text", None):
            artist = norm_ws("; ".join(map(str, tpe1.text)))
        tit2 = tags.get("TIT2")
        if not title and tit2 and getattr(tit2, "text", None):
            title = norm_ws("; ".join(map(str, tit2.text)))
    except Exception:
        pass

    # WAV RIFF INFO chunks (INAM=title, IART=artist) may be present
    if hasattr(tags, "get"):
        if not artist:
            iart = tags.get("IART")
            if isinstance(iart, (list, tuple)):
                iart = iart[0] if iart else None
            if iart:
                artist = norm_ws(str(iart))
        if not title:
            inam = tags.get("INAM")
            if isinstance(inam, (list, tuple)):
                inam = inam[0] if inam else None
            if inam:
                title = norm_ws(str(inam))

    return artist, title


def ensure_unique_name(dirpath: str, name: str) -> str:
    base, ext = os.path.splitext(name)
    candidate = name
    n = 1
    while os.path.exists(os.path.join(dirpath, candidate)):
        candidate = f"{base} ({n}){ext}"
        n += 1
    return candidate


def compute_target_name(path: str) -> Optional[str]:
    dirpath, fname = os.path.split(path)
    ext = os.path.splitext(fname)[1]
    artist, title = read_artist_title(path)

    if not title:
        return None

    if not artist:
        artist = "Unknown Artist"

    safe_artist = sanitize_filename_component(artist)
    safe_title = sanitize_filename_component(title)
    if not safe_title:
        return None

    return f"{safe_artist} - {safe_title}{ext}"


def main():
    # Get directory from command line or environment variable
    if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
        root = sys.argv[1]
    else:
        root = os.environ.get("MUSIC_LIBRARY_DIR")
        if not root:
            print("Error: No directory specified.")
            print("Usage: python3 normalize_filenames.py <directory> [--dry-run|-n]")
            print("Or set MUSIC_LIBRARY_DIR in your .env file")
            sys.exit(1)

    root = os.path.expanduser(root)
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    if not os.path.isdir(root):
        print(f"Root does not exist or is not a directory: {root}")
        sys.exit(1)

    # Process only files at root level (assuming flattened). If you want recursive, change to os.walk.
    entries = [os.path.join(root, f) for f in os.listdir(root)]
    files = [p for p in entries if os.path.isfile(p) and is_audio(p)]

    # Precompute targets and collect duplicates
    targets: dict[str, list[str]] = {}
    planned: list[tuple[str, str]] = []  # (src, target_name)
    skipped: list[str] = []

    for p in sorted(files):
        target = compute_target_name(p)
        if not target:
            print(f"[SKIP] Missing/invalid tags: {p}")
            skipped.append(p)
            continue
        planned.append((p, target))
        targets.setdefault(target.lower(), []).append(p)

    # Perform renames, resolving collisions with (n) suffixes
    for src, target in planned:
        dirpath, fname = os.path.split(src)
        if fname == target:
            continue
        final_name = ensure_unique_name(dirpath, target)
        dst = os.path.join(dirpath, final_name)
        if dry_run:
            print(f"DRY: rename {src} -> {dst}")
        else:
            os.replace(src, dst)
            print(f"rename {src} -> {dst}")

    # Summary: list duplicates (same computed target)
    dupes = {k: v for k, v in targets.items() if len(v) > 1}
    if dupes:
        print("\nDuplicates (same intended filename before suffixes):")
        for k, paths in dupes.items():
            # Show canonical name without lowercasing for readability
            example = next((t for (_, t) in planned if t.lower() == k), k)
            print(f"  {example}")
            for p in paths:
                print(f"    - {p}")
    else:
        print("\nNo duplicates based on tags.")

    # Rescan root after any renames to compute filename-based duplicates
    def base_without_suffix(name: str) -> Tuple[str, str]:
        base, ext = os.path.splitext(name)
        m = re.match(r"^(.*) \((\d+)\)$", base)
        if m:
            return m.group(1), ext.lower()
        return base, ext.lower()

    entries_after = [os.path.join(root, f) for f in os.listdir(root)]
    files_after = [p for p in entries_after if os.path.isfile(p) and is_audio(p)]
    groups: dict[Tuple[str, str], list[str]] = {}
    for p in files_after:
        base, ext = base_without_suffix(os.path.basename(p))
        groups.setdefault((base.lower(), ext), []).append(p)

    suffix_dupes = {k: v for k, v in groups.items() if len(v) > 1}
    if suffix_dupes:
        print("\nFilename duplicates (suffix variants like ' (1)'):")
        to_delete: list[str] = []
        for (base, ext), paths in sorted(suffix_dupes.items()):
            print(f"  {base}{ext}")
            # Sort paths so unsuffixed comes first (if present), then (n) in order
            def sort_key(p: str):
                name = os.path.splitext(os.path.basename(p))[0]
                m = re.match(r"^(.*) \((\d+)\)$", name)
                return (0, 0) if not m else (1, int(m.group(2)))

            for p in sorted(paths, key=sort_key):
                print(f"    - {p}")
            # Mark any with (n) for deletion
            for p in paths:
                name = os.path.splitext(os.path.basename(p))[0]
                if re.match(r"^(.*) \((\d+)\)$", name):
                    to_delete.append(p)

        if to_delete:
            quoted = " ".join(shlex.quote(p) for p in sorted(to_delete))
            print("\nOne big rm command (suffix duplicates):\n")
            print(f"rm {quoted}\n")
        else:
            print("\nNo '(n)' suffix files to delete.")
    else:
        print("\nNo filename-based duplicates found.")

    if dry_run:
        print("\n(dry run: no changes made)")


if __name__ == "__main__":
    main()
