import os
import re
import unicodedata
from collections import defaultdict
from mutagen import File
import sys
import shlex

FOLDER = "/Users/stephengeller/Music/rekordbox/ALL_SONGS"
EXTENSIONS = (".mp3", ".aiff")

HEX_PREFIX = re.compile(r"^[0-9A-F]{8}_", re.IGNORECASE)

def norm(text: str) -> str:
    # lowercase, strip, collapse spaces, remove some punctuation noise
    text = unicodedata.normalize("NFKC", text).lower().strip()
    text = re.sub(r"[‘’´`]", "'", text)
    text = re.sub(r"[_]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text

def infer_from_filename(path: str):
    """
    Try to infer (artist, title) from filename and folder structure.
    Returns (artist or '', title or '').
    """
    base = os.path.basename(path)
    stem, _ = os.path.splitext(base)
    stem = HEX_PREFIX.sub("", stem)                  # drop leading hex ids like 0F9427F0_
    stem = re.sub(r"^$begin:math:display$duplicate$end:math:display$\s*", "", stem, flags=re.IGNORECASE)

    # Prefer "Artist - Title" patterns
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        return norm(artist), norm(title)

    # If no dash, try parent folder as artist, filename as title
    parent = os.path.basename(os.path.dirname(path))
    artist = norm(parent) if parent and parent.lower() not in ("unknown", "various", "va") else ""
    title = norm(stem)

    return artist, title

def read_tags(path: str):
    try:
        audio = File(path, easy=True)
        if not audio:
            return {}, None
        tags = {
            "artist": norm(", ".join(audio.get("artist", []))) if audio.get("artist") else "",
            "title":  norm(", ".join(audio.get("title",  []))) if audio.get("title")  else "",
            "album":  norm(", ".join(audio.get("album",  []))) if audio.get("album")  else "",
        }
        length = int(audio.info.length) if getattr(audio, "info", None) and getattr(audio.info, "length", None) else None
        return tags, length
    except Exception as e:
        print(f"[SKIP] {path} ({e})")
        return {}, None

def make_key(path: str):
    tags, length = read_tags(path)
    size = os.path.getsize(path)

    artist = tags.get("artist", "") if tags else ""
    title  = tags.get("title",  "") if tags else ""

    if not title or not artist:
        inf_artist, inf_title = infer_from_filename(path)
        artist = artist or inf_artist
        title  = title  or inf_title

    # If we still can’t get even a title, skip – avoids 'unknown/unknown' buckets.
    if not title:
        return None

    # Build a conservative key:
    # include artist (may be ''), title, rounded length (if known), and exact size
    # size helps separate different songs with same title/length
    key = (artist, title, int(length) if length else None, size)
    return key

def find_duplicates(folder: str):
    buckets = defaultdict(list)
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(EXTENSIONS):
                path = os.path.join(root, f)
                key = make_key(path)
                if key:
                    buckets[key].append(path)

    dup_count = 0
    for key, paths in buckets.items():
        if len(paths) > 1:
            artist, title, length, size = key
            length_str = f"{length}s" if length is not None else "len=?"
            print(f"\nDUPLICATE: ({artist or '∅-artist'}, {title}, {length_str}, {size}B)")
            for p in sorted(paths):
                print(f"   {p}")
            dup_count += 1

    if dup_count == 0:
        print("No duplicates found.")

# replace the final reporting loop with this:
def report_and_optionally_emit_rm(buckets):
    dup_count = 0
    emit_rm = "--emit-rm" in sys.argv
    for key, paths in buckets.items():
        if len(paths) > 1:
            artist, title, length, size = key
            length_str = f"{length}s" if length is not None else "len=?"
            print(f"\nDUPLICATE: ({artist or '∅-artist'}, {title}, {length_str}, {size}B)")
            paths = sorted(paths)
            for p in paths:
                print(f"   {p}")
            if emit_rm:
                # keep the first; suggest removing the rest
                for p in paths[1:]:
                    print(f"rm {shlex.quote(p)}")
            dup_count += 1
    if dup_count == 0:
        print("No duplicates found.")

def report_and_emit_big_rm(buckets):
    dupes = []
    for key, paths in buckets.items():
        if len(paths) > 1:
            artist, title, length, size = key
            length_str = f"{length}s" if length is not None else "len=?"
            print(f"\nDUPLICATE: ({artist}, {title}, {length_str}, {size}B)")
            paths = sorted(paths)
            for p in paths:
                print(f"   {p}")
            # keep the first file; mark the rest for deletion
            dupes.extend(paths[1:])

    if dupes:
        quoted = " ".join(shlex.quote(p) for p in dupes)
        print("\nOne big rm command:\n")
        print(f"rm {quoted}\n")
    else:
        print("No duplicates found.")

if __name__ == "__main__":
    buckets = defaultdict(list)
    for root, _, files in os.walk(FOLDER):
        for f in files:
            if f.lower().endswith(EXTENSIONS):
                path = os.path.join(root, f)
                key = make_key(path)
                if key:
                    buckets[key].append(path)
    report_and_emit_big_rm(buckets)
