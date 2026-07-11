#!/usr/bin/env bash
# ============================================================================
# tests/packaging.sh — packaging battery for build-update-package.sh
# ============================================================================
#
# Runs locally and in CI (same script):
#   1. build twice -> determinism on this environment (same sha1)
#   2. zip -> install layout and exact entry set (entry script + icon, twice:
#      menu icon under rsc/, dialog emblem next to the script)
#   3. update-package.json -> valid JSON with the exact ingestion contract
#   4. __BUILD__ token -> stamped with the version, none left behind
#
# WARNING: rebuilds dist/. Rebuild deliberately before publishing anything.
#
# Usage: tests/packaging.sh [version]
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-0.0.0-test}"

echo "--- build twice: determinism on this environment"
rm -rf dist
scripts/build-update-package.sh "$VERSION" 20000101 > /dev/null
first=$(sha1sum "dist/SessionCinema-$VERSION.zip" | cut -d' ' -f1)
rm -rf dist
scripts/build-update-package.sh "$VERSION" 20000101 > /dev/null
second=$(sha1sum "dist/SessionCinema-$VERSION.zip" | cut -d' ' -f1)
echo "sha1: $first / $second"
test "$first" = "$second"

echo "--- zip: install layout and exact entry set"
entries="$(unzip -Z1 "dist/SessionCinema-$VERSION.zip" | sort)"
expected="$(printf '%s\n' \
   "rsc/icons/script/SessionCinema/SessionCinema.svg" \
   "src/scripts/CaeloWorks/SessionCinema/SessionCinema.js" \
   "src/scripts/CaeloWorks/SessionCinema/SessionCinema.svg" | sort)"
if [ "$entries" != "$expected" ]; then
   echo "ERROR: unexpected zip entry set:" >&2
   printf '%s\n' "$entries" >&2
   exit 1
fi

echo "--- update-package.json: ingestion contract"
python3 - "$VERSION" <<'PY'
import json, sys
with open("dist/update-package.json") as f:
    meta = json.load(f)
required = ["name", "slug", "version", "fileName", "sha1", "type",
            "releaseDate", "piVersionRange", "title", "descriptionHtml"]
missing = [k for k in required if k not in meta]
assert not missing, f"missing keys: {missing}"
assert meta["slug"] == "session-cinema", meta["slug"]
assert meta["type"] == "script"
assert meta["version"] == sys.argv[1]
assert meta["fileName"] == f"SessionCinema-{sys.argv[1]}.zip"
assert meta["releaseDate"] == "20000101"
assert len(meta["sha1"]) == 40
PY

echo "--- __BUILD__ stamped in the packaged entry script"
unzip -p "dist/SessionCinema-$VERSION.zip" \
   "src/scripts/CaeloWorks/SessionCinema/SessionCinema.js" > dist/.packaged.js
if grep -q "__BUILD__" dist/.packaged.js; then
   echo "ERROR: __BUILD__ token left unstamped in the packaged script" >&2
   exit 1
fi
grep -q "SESSIONCINEMA_BUILD \"$VERSION\"" dist/.packaged.js
rm -f dist/.packaged.js

echo "packaging battery passed"
