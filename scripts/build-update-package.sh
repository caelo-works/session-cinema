#!/usr/bin/env bash
#
# build-update-package.sh <version> [releaseDate YYYYMMDD]
#
# Produces the standardized DISTRIBUTION ARTIFACT that the CaeloWorks showcase site
# (caelo-works/pixinsight-scripts, served at https://pixinsight-scripts.caelo.works/update/)
# ingests to build the shared, signed updates.xri. This repo does NOT generate or host the
# final updates.xri — it only emits, per release, two files under dist/ (or under
# $OUT_DIR when set):
#
#   dist/<NAME>-<version>.zip     the package, tree RELATIVE TO PixInsight's install dir
#                                   src/scripts/CaeloWorks/<NAME>/<NAME>.js
#                                   src/scripts/CaeloWorks/<NAME>/<NAME>.svg
#                                   src/scripts/CaeloWorks/<NAME>/LICENSE
#                                   rsc/icons/script/<NAME>/<NAME>.svg
#   dist/update-package.json      metadata the site needs to emit the <package> element
#
# The zip is REPRODUCIBLE (sorted entries, fixed mtimes/permissions, entries STORED rather
# than deflated) so identical content always yields the same SHA-1, on any machine — the
# site authenticates the package by that SHA-1.
#
set -euo pipefail

# ----- script identity (bootstrap.sh rewrites these) -------------------------
NAME="SessionCinema"                          # class-case: entry file, package dir, icon
SLUG="session-cinema"                         # kebab-case: site slug
TITLE="Session Cinema"                        # human name
DESCRIPTION_HTML="<p>Session Cinema turns your astrophotography sessions into shareable videos. A <b>progressive-stacking</b> movie builds the integration from your first to your last sub: feed it raw camera subs and it registers them internally (correcting dithering and meridian flips), composites your filters into colour (SHO, HOO, …), grows the integrated light from dark to the optimal stretch, and cross-fades to your finished image at the end. Or a <b>Zoom Odyssey</b> — a &quot;you are here&quot; context zoom from the whole sky down to your image revealing itself, driven by its plate solve. Sober scientific overlays only (frame count, cumulative exposure, measured SNR gain, angular scale). Encodes with ffmpeg when available.</p>"
PI_VERSION_RANGE="1.9.4:1.9.99"
# -----------------------------------------------------------------------------

VERSION="${1:?usage: build-update-package.sh <version> [releaseDate YYYYMMDD]}"
RELEASE_DATE="${2:-$(date +%Y%m%d)}"

# Both inputs travel unescaped into a sed replacement, a file name and a JSON value,
# so they are validated here rather than at the far end of the chain. The optional
# pre-release suffix keeps the synthetic 0.0.0-ci / 0.0.0-test versions valid.
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || {
  echo "error: bad version '$VERSION' (expected MAJOR.MINOR.PATCH[-suffix])" >&2; exit 1; }
# PixInsight reads releaseDate as the YYYYMMDD attribute of the <package> element.
[[ "$RELEASE_DATE" =~ ^[0-9]{8}$ ]] || {
  echo "error: bad releaseDate '$RELEASE_DATE' (expected YYYYMMDD)" >&2; exit 1; }

REPO="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
VENDORDIR="CaeloWorks/$NAME"
ZIPNAME="$NAME-${VERSION}.zip"
# Overridable so a test battery can build into scratch space instead of replacing
# the delivery tree. The release path and CI leave it unset and get dist/.
OUT="${OUT_DIR:-$REPO/dist}"
# This directory is wiped below. A caller-supplied path makes that worth checking.
case "$OUT" in
  /|/*/..*|"") echo "error: refusing to build into '$OUT'" >&2; exit 1 ;;
  /*) ;;
  *)  echo "error: OUT_DIR must be an absolute path, got '$OUT'" >&2; exit 1 ;;
esac
STAGE="$( mktemp -d )"
trap 'rm -rf "$STAGE"' EXIT

# The version sold on the package and the version the script displays must be the
# same number. Nothing else ties them: SC_VERSION is a source constant the build
# never rewrites, so a forgotten bump would ship a 1.2.0 package whose dialog reads
# 1.1.1. Checked here rather than in the workflow so manual builds are covered too.
# The synthetic 0.0.0-* versions are deliberately unrelated to the source constant.
case "$VERSION" in
  0.0.0-*) ;;
  *)
    SRC_VERSION="$( sed -n 's/^#define[[:space:]]\{1,\}SC_VERSION[[:space:]]\{1,\}"\([^"]*\)".*/\1/p' "$REPO/pjsr/$NAME.js" | head -1 )"
    [ -n "$SRC_VERSION" ] || { echo "error: no #define SC_VERSION found in pjsr/$NAME.js" >&2; exit 1; }
    [ "$SRC_VERSION" = "$VERSION" ] || {
      echo "error: building version '$VERSION' but pjsr/$NAME.js declares SC_VERSION \"$SRC_VERSION\"" >&2
      echo "       bump the source constant, or tag the version it already declares." >&2
      exit 1; }
    ;;
esac

DST="$STAGE/src/scripts/$VENDORDIR"
mkdir -p "$DST" "$STAGE/rsc/icons/script/$NAME"
rm -rf "$OUT"; mkdir -p "$OUT"

# 1) entry script — stamp the build
sed -e "s/__BUILD__/${VERSION}/g" "$REPO/pjsr/$NAME.js" > "$DST/$NAME.js"

# 2) optional lib/ and bin/ (per-OS helper binaries, kept 0755 by the zip step)
[ -d "$REPO/pjsr/lib" ] && { mkdir -p "$DST/lib"; cp "$REPO"/pjsr/lib/*.js "$DST/lib/"; }
[ -d "$REPO/bin" ]      && { mkdir -p "$DST/bin"; cp "$REPO"/bin/*        "$DST/bin/"; }

# 3) script icon, shipped twice: the rsc/ copy backs the #feature-icon directive
#    (@script_icons_dir), the copy next to the script backs the dialog header
#    emblem — which is also the only one a manual install outside the PixInsight
#    tree can find.
cp "$REPO/pjsr/assets/$NAME.svg" "$STAGE/rsc/icons/script/$NAME/$NAME.svg"
cp "$REPO/pjsr/assets/$NAME.svg" "$DST/$NAME.svg"

# 3c) the licence travels with the work. GPL-3 §4 asks for a copy to accompany what
#     is distributed; a URL in a source header is tolerated practice, not the letter.
cp "$REPO/LICENSE" "$DST/LICENSE"

# 4) reproducible zip (see scripts/repro-zip.py, which sign-package.sh shares so a
#    signed zip keeps the same layout). The package is built UNSIGNED: signing is a
#    separate step on a machine with PixInsight and the keys (scripts/sign-package.sh).
python3 "$REPO/scripts/repro-zip.py" "$STAGE" "$OUT/$ZIPNAME"

SHA1=$( sha1sum "$OUT/$ZIPNAME" | cut -d' ' -f1 )

# 5) metadata sidecar — exactly the contract the site ingests
cat > "$OUT/update-package.json" <<JSON
{
  "name": "${TITLE}",
  "slug": "${SLUG}",
  "version": "${VERSION}",
  "fileName": "${ZIPNAME}",
  "sha1": "${SHA1}",
  "type": "script",
  "releaseDate": "${RELEASE_DATE}",
  "piVersionRange": "${PI_VERSION_RANGE}",
  "title": "${TITLE} v${VERSION}",
  "descriptionHtml": "${DESCRIPTION_HTML}"
}
JSON

echo "$OUT/$ZIPNAME  ($(du -h "$OUT/$ZIPNAME" | cut -f1), sha1 $SHA1)"
echo "$OUT/update-package.json"
echo "  unsigned: sign the release with scripts/sign-package.sh"
