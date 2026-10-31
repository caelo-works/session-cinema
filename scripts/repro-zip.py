#!/usr/bin/env python3
"""repro-zip.py <stage-dir> <out.zip>

Zips a staged tree reproducibly: sorted entries, fixed mtime (1980-01-01), fixed
permissions (0755 under bin/, 0644 otherwise) and STORED entries. Deflate would
reintroduce the entropy the rest of this removes: the compressed stream depends on
the local zlib's level, memLevel and strategy, none of which the format pins, so
the same content rebuilt against another zlib gives another SHA-1.

Shared by build-update-package.sh and sign-package.sh, so a signed zip is laid
out exactly like the unsigned one it replaces.
"""
import os
import sys
import zipfile

stage, out = sys.argv[1], sys.argv[2]
files = []
for root, _, names in os.walk(stage):
    for n in names:
        full = os.path.join(root, n)
        arc = os.path.relpath(full, stage).replace(os.sep, "/")
        files.append((arc, full))
files.sort(key=lambda x: x[0])
with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
    for arc, full in files:
        zi = zipfile.ZipInfo(arc, date_time=(1980, 1, 1, 0, 0, 0))
        perm = 0o755 if "/bin/" in ("/" + arc) else 0o644
        zi.external_attr = (perm & 0xFFFF) << 16
        zi.compress_type = zipfile.ZIP_STORED
        with open(full, "rb") as f:
            z.writestr(zi, f.read())
