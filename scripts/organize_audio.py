#!/usr/bin/env python3
"""
Organize dropped audio files into /Users/stephengeller/Music/rekordbox/ALL_MUSIC_BY_ARTIST
by Artist/Title based on metadata. Works as a CLI for Automator's "Run Shell Script".

Features
- Accepts files and/or folders (recurses directories)
- Supports common audio formats (mp3, m4a/aac, wav, aiff, flac, ogg, opus)
- Extracts Artist/Title via mutagen when available, falls back to mdls, then filename
- Moves (default) or copies files, with --dry-run support
- Skips duplicates by default; logs and can notify
 - On duplicates, renames the original file to prefix with "[DUPLICATE] " (default behavior)
- Handles name collisions by appending (1), (2), ... when configured

Usage (example)
  python3 scripts/organize_audio.py \
    --dest "/Users/stephengeller/Music/rekordbox/ALL_MUSIC_BY_ARTIST" \
    "$@"   # when used from Automator "Run Shell Script" with input as arguments

Recommended: install mutagen for best tag coverage
  python3 -m pip install --user mutagen
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional, Tuple, Any


# Try mutagen if available for robust multi-format tagging
try:
    from mutagen import File as MFile  # type: ignore
    from mutagen.id3 import ID3  # type: ignore
except Exception:  # noqa: BLE001 - mutagen may not be installed
    MFile = None  # type: ignore
    ID3 = None  # type: ignore


DEFAULT_DEST = "/Users/stephengeller/Music/rekordbox/ALL_MUSIC_BY_ARTIST"

SUPPORTED_EXTS = {
    ".mp3",
    ".m4a",
    ".aac",
    ".wav",
    ".aiff",
    ".aif",
    ".flac",
    ".ogg",
    ".oga",
    ".opus",
}


def is_audio_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_EXTS


def iter_audio_files(inputs: Iterable[Path]) -> Iterable[Path]:
    for p in inputs:
        if p.is_dir():
            for root, _dirs, files in os.walk(p):
                for name in files:
                    fp = Path(root) / name
                    if is_audio_file(fp):
                        yield fp
        elif is_audio_file(p):
            yield p


def _first_str(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        for v in value:
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None
    if isinstance(value, str):
        s = value.strip()
        return s if s else None
    return None


def _from_easy_tags(m: Any) -> Tuple[Optional[str], Optional[str]]:
    tags = getattr(m, "tags", None)
    if not tags:
        return None, None
    artist = (
        _first_str(tags.get("artist"))
        or _first_str(tags.get("albumartist"))
        or _first_str(tags.get("composer"))
        or _first_str(tags.get("artists"))
    )
    title = _first_str(tags.get("title"))
    return artist, title


def _from_raw_tags(m: Any) -> Tuple[Optional[str], Optional[str]]:
    tags = getattr(m, "tags", None)
    if not tags:
        return None, None
    # MP4/ALAC keys
    try:
        artist = None
        title = None
        for key in ("\u00a9ART", "aART", "ART", "artist"):
            if key in tags:
                artist = _first_str(tags.get(key)) or artist
        for key in ("\u00a9nam", "nam", "title"):
            if key in tags:
                title = _first_str(tags.get(key)) or title
        if artist or title:
            return artist, title
    except Exception:
        pass
    # ID3 frames (MP3/AIFF/WAV with ID3)
    try:
        if ID3 and isinstance(tags, ID3):
            def _id3_first(frame_id: str) -> Optional[str]:
                try:
                    frames = tags.getall(frame_id)
                    if not frames:
                        return None
                    fr = frames[0]
                    text = getattr(fr, "text", None)
                    return _first_str(text)
                except Exception:
                    return None

            artist = _id3_first("TPE1") or _id3_first("TCOM") or _id3_first("TPE2")
            title = _id3_first("TIT2")
            return artist, title
    except Exception:
        pass
    # Vorbis/FLAC/Opus common keys
    try:
        def _first_present(keys: Iterable[str]) -> Optional[str]:
            for k in keys:
                if k in tags:
                    v = _first_str(tags.get(k))
                    if v:
                        return v
            return None

        artist = _first_present(["artist", "albumartist", "performer", "composer"])  # type: ignore[arg-type]
        title = _first_present(["title"])  # type: ignore[arg-type]
        return artist, title
    except Exception:
        pass
    return None, None


def get_tags_with_mutagen(path: Path) -> Tuple[Optional[str], Optional[str]]:
    if MFile is None:
        return None, None
    try:
        m_easy = MFile(str(path), easy=True)
        if m_easy:
            artist, title = _from_easy_tags(m_easy)
            if artist or title:
                return artist, title
        m_raw = MFile(str(path))
        if m_raw:
            artist, title = _from_raw_tags(m_raw)
            return artist, title
    except Exception:
        return None, None


def parse_mdls_raw(output: str) -> Optional[str]:
    # mdls -raw prints either a single line, (null), or a parenthesized list
    out = output.strip()
    if not out or out == "(null)":
        return None
    if out.startswith("(") and out.endswith(")"):
        inner = out[1:-1].strip()
        # split lines, take first non-empty token, strip quotes
        for line in inner.splitlines():
            token = line.strip().strip(",").strip().strip("\"")
            if token:
                return token
        return None
    # plain string value
    return out.strip().strip("\"") or None


def get_tags_with_mdls(path: Path) -> Tuple[Optional[str], Optional[str]]:
    try:
        a = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemAuthors", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        aa = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemAlbumArtist", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        ma = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemMusicalArtist", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        c = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemComposer", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        t = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemTitle", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        dn = subprocess.run(
            ["mdls", "-raw", "-name", "kMDItemDisplayName", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        # Prefer Authors, then AlbumArtist, then MusicalArtist, then Composer
        artist = (
            parse_mdls_raw(a.stdout)
            or parse_mdls_raw(aa.stdout)
            or parse_mdls_raw(ma.stdout)
            or parse_mdls_raw(c.stdout)
        )
        title = parse_mdls_raw(t.stdout) or parse_mdls_raw(dn.stdout)
        return artist, title
    except Exception:
        return None, None


_DASH_SPLIT = re.compile(r"\s*[-\u2013\u2014]\s*")


def guess_from_filename(path: Path) -> Tuple[Optional[str], Optional[str]]:
    stem = path.stem
    # common pattern: Artist - Title
    parts = _DASH_SPLIT.split(stem, maxsplit=1)
    if len(parts) == 2:
        artist, title = parts[0].strip(), parts[1].strip()
        return (artist or None), (title or None)
    # fallback: treat entire stem as title
    return None, stem.strip() or None


_ILLEGAL_CHARS = re.compile(r"[\\/:\0]\s*|\s+")


def sanitize_component(name: str) -> str:
    # Replace slashes/backslashes and control chars, collapse whitespace, trim dots/spaces
    name = name.replace("/", "-").replace("\\", "-").replace(":", "-")
    name = re.sub(r"\s+", " ", name)
    name = name.strip(" .")
    # Avoid empty component
    return name or "Unknown"


def safe_unique_path(dest: Path) -> Path:
    if not dest.exists():
        return dest
    base = dest.with_suffix("")
    ext = dest.suffix
    i = 1
    while True:
        candidate = Path(f"{base} ({i}){ext}")
        if not candidate.exists():
            return candidate
        i += 1


def extract_artist_title(path: Path) -> Tuple[str, str]:
    artist, title = get_tags_with_mutagen(path)
    if not artist or not title:
        a2, t2 = get_tags_with_mdls(path)
        artist = artist or a2
        title = title or t2
    if not artist or not title:
        a3, t3 = guess_from_filename(path)
        artist = artist or a3
        title = title or t3
    # Prefer the primary artist if many are listed
    if artist:
        primary = re.split(r"\s*(,|&|;|feat\.|ft\.|featuring)\s*", artist, flags=re.I)[0]
        artist = primary.strip() or artist
    return sanitize_component(artist or "Unknown Artist"), sanitize_component(title or "Unknown Title")


def move_or_copy(src: Path, dest: Path, mode: str, dry_run: bool) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest_final = safe_unique_path(dest)
    if dry_run:
        action = "COPY" if mode == "copy" else "MOVE"
        print(f"[DRY] {action}: {src} -> {dest_final}")
        return dest_final
    if mode == "copy":
        shutil.copy2(src, dest_final)
    else:
        shutil.move(src, dest_final)
    return dest_final


def notify(message: str, title: str = "Audio Organizer") -> None:
    try:
        subprocess.run(
            [
                "osascript",
                "-e",
                f'display notification {message!r} with title {title!r}',
            ],
            check=False,
            capture_output=True,
        )
    except Exception:
        pass


def write_log(line: str, log_path: Optional[Path]) -> None:
    try:
        if not log_path:
            return
        log_path = log_path.expanduser()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def prepend_duplicate_flag(src: Path, dry_run: bool) -> Path:
    """Rename the original file to start with "[DUPLICATE] ".
    Ensures uniqueness if the target name already exists.
    Returns the intended/final new path.
    """
    try:
        if not src.exists():
            return src
        name = src.name
        if name.startswith("[DUPLICATE]"):
            return src
        candidate = src.with_name(f"[DUPLICATE] {name}")
        if candidate.exists():
            i = 1
            while candidate.exists():
                candidate = src.with_name(f"[DUPLICATE] ({i}) {name}")
                i += 1
        if dry_run:
            print(f"[DRY] RENAME: {src} -> {candidate}")
            return candidate
        src.rename(candidate)
        return candidate
    except Exception:
        return src


def organize(
    paths: Iterable[Path],
    dest_root: Path,
    mode: str,
    dry_run: bool,
    on_duplicate: str,
    do_notify: bool,
    log_path: Optional[Path],
) -> int:
    count = 0
    for src in iter_audio_files(paths):
        try:
            artist, title = extract_artist_title(src)
            dest = dest_root / artist / f"{title}{src.suffix.lower()}"
            if dest.exists():
                msg = f"Duplicate found: {src} -> {dest}"
                print(msg)
                write_log(msg, log_path)
                if do_notify:
                    notify(f"Duplicate: {artist} / {title}")
                if on_duplicate == "overwrite":
                    final_path = move_or_copy(src, dest, mode, dry_run)
                    print(f"OVERWRITE: {src} -> {final_path}")
                    write_log(f"Overwrote existing: {final_path}", log_path)
                    count += 1
                elif on_duplicate == "unique":
                    final_path = move_or_copy(src, dest, mode, dry_run)
                    print(f"RENAMED: {src} -> {final_path}")
                    write_log(f"Renamed due to duplicate: {final_path}", log_path)
                    count += 1
                else:
                    dup_path = prepend_duplicate_flag(src, dry_run)
                    info = f"Marked original as duplicate: {src} -> {dup_path}"
                    print(info)
                    write_log(info, log_path)
                    continue
            else:
                final_path = move_or_copy(src, dest, mode, dry_run)
                print(f"OK: {src} -> {final_path}")
                write_log(f"OK: {src} -> {final_path}", log_path)
                count += 1
        except Exception as e:
            err = f"ERROR processing {src}: {e}"
            print(err, file=sys.stderr)
            write_log(err, log_path)
    return count


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Organize audio files into Artist/Title structure")
    p.add_argument(
        "inputs",
        nargs="+",
        help="Files or folders to process",
        type=Path,
    )
    p.add_argument(
        "--dest",
        default=DEFAULT_DEST,
        type=Path,
        help="Destination root folder (default: %(default)s)",
    )
    p.add_argument(
        "--mode",
        choices=["move", "copy"],
        default="move",
        help="Whether to move (default) or copy files",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not modify files; just print actions",
    )
    p.add_argument(
        "--on-duplicate",
        choices=["skip", "unique", "overwrite"],
        default="skip",
        help="When destination exists: skip (default), create unique name, or overwrite",
    )
    p.add_argument(
        "--notify/--no-notify",
        dest="notify",
        default=True,
        action=argparse.BooleanOptionalAction,
        help="Show macOS notification for duplicates/errors (default: on)",
    )
    p.add_argument(
        "--log",
        type=Path,
        default=Path("~/Library/Logs/organize_audio.log"),
        help="Path to log file (default: %(default)s)",
    )
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    processed = organize(
        args.inputs,
        args.dest.expanduser(),
        args.mode,
        args.dry_run,
        args.on_duplicate,
        args.notify,
        args.log,
    )
    if processed == 0:
        print("No audio files found to process.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
