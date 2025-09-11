#!/usr/bin/env python3
import os
import sys
import shutil
from typing import Iterable, Tuple

# Default root (can be overridden by argv[1])
DEFAULT_ROOT = "/Users/stephengeller/Music/rekordbox/ALL_SONGS"

# File extensions to flatten (lowercased)
EXTENSIONS = {".mp3", ".aiff", ".aif", ".wav", ".m4a"}

# Junk files that prevent directories from being empty on macOS/Windows
JUNK_FILES = {".DS_Store", "Thumbs.db"}


def is_target_file(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in EXTENSIONS


def iter_files(root: str) -> Iterable[str]:
    for dirpath, _dirnames, filenames in os.walk(root):
        for fname in filenames:
            if is_target_file(fname):
                yield os.path.join(dirpath, fname)


def ensure_unique_name(root: str, filename: str) -> str:
    base, ext = os.path.splitext(filename)
    candidate = filename
    n = 1
    while os.path.exists(os.path.join(root, candidate)):
        candidate = f"{base} ({n}){ext}"
        n += 1
    return candidate


def move_to_root(root: str, path: str, dry_run: bool = False) -> Tuple[str, str]:
    """Move a file to the root directory, resolving collisions by suffixing.
    Returns (src, dest)."""
    src = os.path.abspath(path)
    dest_name = ensure_unique_name(root, os.path.basename(src))
    dest = os.path.join(root, dest_name)

    # If already at root with the final name, skip
    if os.path.abspath(os.path.dirname(src)) == os.path.abspath(root) and os.path.basename(src) == dest_name:
        return src, dest

    if dry_run:
        print(f"DRY: move {src} -> {dest}")
        return src, dest

    os.replace(src, dest)
    print(f"move {src} -> {dest}")
    return src, dest


def cleanup_empty_dirs(root: str, dry_run: bool = False) -> None:
    # Walk bottom-up so children are removed before parents
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        if os.path.abspath(dirpath) == os.path.abspath(root):
            continue  # never remove the root

        # Remove junk files if they are the only content blocking deletion
        entries = [*filenames]
        # Remove junk files
        for j in list(entries):
            if j in JUNK_FILES:
                junk_path = os.path.join(dirpath, j)
                if dry_run:
                    print(f"DRY: rm {junk_path}")
                else:
                    try:
                        os.remove(junk_path)
                        print(f"rm {junk_path}")
                    except FileNotFoundError:
                        pass

        # After junk removal, decide if the directory is empty
        try:
            after = os.listdir(dirpath)
        except FileNotFoundError:
            continue

        if not after:
            if dry_run:
                print(f"DRY: rmdir {dirpath}")
            else:
                try:
                    os.rmdir(dirpath)
                    print(f"rmdir {dirpath}")
                except OSError:
                    # Directory not empty or cannot remove; skip
                    pass


def main():
    root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else DEFAULT_ROOT
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    if not os.path.isdir(root):
        print(f"Root does not exist or is not a directory: {root}")
        sys.exit(1)

    # Collect all target files first to avoid walking issues while moving
    files = list(iter_files(root))

    moved = 0
    for src in files:
        # Skip files already at root
        if os.path.abspath(os.path.dirname(src)) == os.path.abspath(root):
            continue
        move_to_root(root, src, dry_run=dry_run)
        moved += 1

    cleanup_empty_dirs(root, dry_run=dry_run)

    print(f"\nDone. Files considered: {len(files)} | Moved: {moved}")
    if dry_run:
        print("(dry run: no changes made)")


if __name__ == "__main__":
    main()
