#!/usr/bin/env python3
import os
import sys
import hashlib
import shlex
from collections import defaultdict
from typing import Dict, List, Iterable, Tuple

# Default root (can be overridden by argv[1])
DEFAULT_ROOT = "/Users/stephengeller/Music/rekordbox/ALL_SONGS"

# Consider common audio extensions; set to None to scan all files
EXTENSIONS = {".mp3", ".wav", ".aiff", ".aif", ".flac"}


def is_target(path: str) -> bool:
    if not os.path.isfile(path):
        return False
    ext = os.path.splitext(path)[1].lower()
    return (ext in EXTENSIONS)


def iter_files(root: str) -> Iterable[str]:
    for dirpath, _dirnames, filenames in os.walk(root):
        for fname in filenames:
            p = os.path.join(dirpath, fname)
            if is_target(p):
                yield p


def sha256_range(path: str, start: int = 0, end: int | None = None, bufsize: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    size = os.path.getsize(path)
    if end is None or end > size:
        end = size
    if start < 0:
        start = 0
    if start >= end:
        return h.hexdigest()
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start
        while remaining > 0:
            to_read = bufsize if remaining > bufsize else remaining
            chunk = f.read(to_read)
            if not chunk:
                break
            h.update(chunk)
            remaining -= len(chunk)
    return h.hexdigest()


def mp3_payload_range(path: str) -> Tuple[int, int | None]:
    # Skip ID3v2 header at start and ID3v1 at end if present
    size = os.path.getsize(path)
    start = 0
    end = size
    with open(path, "rb") as f:
        head = f.read(10)
        if len(head) == 10 and head[0:3] == b"ID3":
            # synchsafe size in bytes 6..9
            sz = (head[6] & 0x7F) << 21 | (head[7] & 0x7F) << 14 | (head[8] & 0x7F) << 7 | (head[9] & 0x7F)
            start = 10 + sz
        # Check ID3v1 at end
        if size >= 128:
            f.seek(size - 128)
            tail = f.read(3)
            if tail == b"TAG":
                end = size - 128
    if start >= end:
        start = 0
        end = size
    return start, end


def wav_data_range(path: str) -> Tuple[int, int | None] | None:
    # RIFF header; locate 'data' chunk and return its data range
    try:
        with open(path, "rb") as f:
            if f.read(4) != b"RIFF":
                return None
            f.seek(8)  # skip size + 'WAVE'
            if f.read(4) != b"WAVE":
                return None
            while True:
                hdr = f.read(8)
                if len(hdr) < 8:
                    return None
                cid = hdr[0:4]
                clen = int.from_bytes(hdr[4:8], byteorder="little", signed=False)
                if cid == b"data":
                    start = f.tell()
                    end = start + clen
                    return start, end
                # chunks are padded to even sizes
                skip = clen + (clen % 2)
                f.seek(skip, os.SEEK_CUR)
    except Exception:
        return None


def aiff_ssnd_range(path: str) -> Tuple[int, int | None] | None:
    # FORM header; locate 'SSND' chunk, skip 8 bytes (offset, blockSize)
    try:
        with open(path, "rb") as f:
            if f.read(4) != b"FORM":
                return None
            f.seek(8)  # size + 'AIFF'/'AIFC'
            # Loop chunks
            while True:
                hdr = f.read(8)
                if len(hdr) < 8:
                    return None
                cid = hdr[0:4]
                clen = int.from_bytes(hdr[4:8], byteorder="big", signed=False)
                if cid == b"SSND":
                    # read offset and blockSize
                    off_bs = f.read(8)
                    if len(off_bs) < 8:
                        return None
                    offset = int.from_bytes(off_bs[0:4], "big")
                    start = f.tell() + offset
                    end = start + (clen - 8 - offset)
                    return start, end
                # Chunks are even-sized; AIFF uses big-endian; pad to even
                skip = clen + (clen % 2)
                f.seek(skip, os.SEEK_CUR)
    except Exception:
        return None


def flac_payload_start(path: str) -> int | None:
    # Skip 'fLaC' signature and metadata blocks; return start of frames
    try:
        with open(path, "rb") as f:
            if f.read(4) != b"fLaC":
                return None
            while True:
                hdr = f.read(4)
                if len(hdr) < 4:
                    return None
                is_last = (hdr[0] & 0x80) != 0
                length = int.from_bytes(hdr[1:4], "big")
                f.seek(length, os.SEEK_CUR)
                if is_last:
                    return f.tell()
    except Exception:
        return None


def content_hash(path: str, ignore_metadata: bool = True) -> str:
    ext = os.path.splitext(path)[1].lower()
    if not ignore_metadata:
        return sha256_range(path)
    try:
        if ext == ".mp3":
            s, e = mp3_payload_range(path)
            return sha256_range(path, s, e)
        if ext == ".wav":
            rng = wav_data_range(path)
            if rng:
                return sha256_range(path, rng[0], rng[1])
        if ext in {".aiff", ".aif"}:
            rng = aiff_ssnd_range(path)
            if rng:
                return sha256_range(path, rng[0], rng[1])
        if ext == ".flac":
            start = flac_payload_start(path)
            if start is not None:
                return sha256_range(path, start, None)
    except Exception:
        pass
    # Fallback: whole-file hash
    return sha256_range(path)


def has_numeric_suffix(name_without_ext: str) -> bool:
    # Matches trailing " (number)" before the extension
    return bool(__import__("re").match(r"^.* \((\d+)\)$", name_without_ext))


def collapse_duplicate_exts(filename: str) -> str:
    import re
    name = filename
    exts = [".mp3", ".wav", ".aiff", ".aif", ".flac"]
    for ext in exts:
        m = re.search(rf"({re.escape(ext)})+$", name, flags=re.IGNORECASE)
        if m and len(m.group(0)) > len(ext):
            name = name[: m.start()] + ext
    return name


def base_len_after_normalize(path: str) -> int:
    base = os.path.basename(path)
    normalized = collapse_duplicate_exts(base)
    stem, _ext = os.path.splitext(normalized)
    return len(stem)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else DEFAULT_ROOT
    strict = "--strict" in sys.argv  # when set, hash entire files (include metadata)

    if not os.path.isdir(root):
        print(f"Root does not exist or is not a directory: {root}")
        sys.exit(1)

    files = list(iter_files(root))
    if not files:
        print("No files to examine.")
        return

    # First pass: group by size to avoid hashing unique sizes
    by_size: Dict[int, List[str]] = defaultdict(list)
    for p in files:
        try:
            sz = os.path.getsize(p)
        except OSError:
            continue
        by_size[sz].append(p)

    # Second pass: hash only groups with more than one file
    dup_groups: List[Tuple[str, List[str]]] = []  # (hash, paths)
    for sz, group in sorted(by_size.items()):
        if len(group) < 2:
            continue
        by_hash: Dict[str, List[str]] = defaultdict(list)
        for p in group:
            try:
                h = content_hash(p, ignore_metadata=not strict)
            except OSError as e:
                print(f"[SKIP] {p} ({e})")
                continue
            by_hash[h].append(p)
        for h, paths in by_hash.items():
            if len(paths) > 1:
                dup_groups.append((h, sorted(paths)))

    if not dup_groups:
        print("No exact duplicates found.")
        return

    print("Exact duplicate groups (content-identical by SHA-256):")
    to_rm: List[str] = []
    mv_fixes: List[Tuple[str, str]] = []  # (src, dst) for duplicate-extension cleanup on kept files
    for h, paths in dup_groups:
        print(f"\nHash: {h}")
        for p in paths:
            print(f"  - {p}")
        # Decide which to keep per rules:
        # 1) Prefer files WITHOUT trailing " (n)" before extension
        # 2) Among those, keep the one with the longest base name length after collapsing duplicate extensions
        # 3) Ties: keep lexicographically first; delete the rest

        # Build scoring
        scored = []  # (suffix_flag, -norm_len, path)
        import re
        for p in paths:
            base = os.path.basename(p)
            stem, ext = os.path.splitext(base)
            suffix_flag = 1 if has_numeric_suffix(stem) else 0  # 1 means worse
            norm_len = base_len_after_normalize(p)
            scored.append((suffix_flag, -norm_len, base.lower(), p))

        scored.sort()  # best first
        keep = scored[0][3]
        delete = [t[3] for t in scored[1:]]
        to_rm.extend(delete)

        # If kept file has duplicate extensions, suggest an mv fix to collapse to single extension
        base_keep = os.path.basename(keep)
        collapsed = collapse_duplicate_exts(base_keep)
        if collapsed != base_keep:
            mv_fixes.append((keep, os.path.join(os.path.dirname(keep), collapsed)))

    if to_rm:
        print("\nOne big rm command:")
        quoted = " ".join(shlex.quote(p) for p in to_rm)
        print(f"rm {quoted}")

    if mv_fixes:
        print("\nSuggested mv commands to collapse duplicate extensions on kept files:")
        for src, dst in mv_fixes:
            print(f"mv {shlex.quote(src)} {shlex.quote(dst)}")


if __name__ == "__main__":
    main()
