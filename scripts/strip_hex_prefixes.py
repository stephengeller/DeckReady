#!/usr/bin/env python3
import os
import re
import sys

DEFAULT_ROOT = "/Users/stephengeller/Music/rekordbox/ALL_SONGS"
HEX_PREFIX = re.compile(r"^[0-9A-Fa-f]{8}_")

# Restrict to common audio files
EXTENSIONS = {".mp3", ".wav", ".aiff", ".aif"}


def is_audio(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in EXTENSIONS


def ensure_unique_name(dirpath: str, name: str) -> str:
    base, ext = os.path.splitext(name)
    candidate = name
    n = 1
    while os.path.exists(os.path.join(dirpath, candidate)):
        candidate = f"{base} ({n}){ext}"
        n += 1
    return candidate


def main():
    root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else DEFAULT_ROOT
    dry = "--dry-run" in sys.argv or "-n" in sys.argv

    if not os.path.isdir(root):
        print(f"Root does not exist or is not a directory: {root}")
        sys.exit(1)

    total = 0
    renamed = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for fname in sorted(filenames):
            if not is_audio(fname):
                continue
            if not HEX_PREFIX.match(fname):
                continue
            p = os.path.join(dirpath, fname)
            total += 1
            new_name = HEX_PREFIX.sub("", fname)
            new_name = ensure_unique_name(dirpath, new_name)
            dst = os.path.join(dirpath, new_name)
            if dry:
                print(f"DRY: rename {p} -> {dst}")
            else:
                os.replace(p, dst)
                print(f"rename {p} -> {dst}")
            renamed += 1

    print(f"\nDone. Prefixed files found: {total} | Renamed: {renamed}")
    if dry:
        print("(dry run: no changes made)")


if __name__ == "__main__":
    main()
