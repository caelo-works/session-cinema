#!/usr/bin/env bash
#
# check-package.sh [--signed] <zip>
#
#   --signed   the package is a release: it must carry the CaeloWorks code
#              signature. Without it the package is checked as a development
#              build (CI has neither PixInsight nor the keys, so cannot sign).
#
# Verifies a built package against the contract the CaeloWorks update site
# enforces on ingest (scripts/build-update-repo.sh in caelo-works/pixinsight-scripts),
# plus the things only this repo can know. Catching a violation here costs a red
# CI run; catching it there costs a published release that has to be pulled.
#
set -euo pipefail

SIGNED=0
if [ "${1:-}" = "--signed" ]; then SIGNED=1; shift; fi
ZIP="${1:?usage: check-package.sh [--signed] <zip>}"
NAME="SessionCinema"
VENDOR="src/scripts/CaeloWorks/$NAME"

fail=0
note() { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

tree="$( unzip -Z1 "$ZIP" )"
# No `producer | grep -q` anywhere: grep -q exits on the first match, the producer
# then dies of SIGPIPE, and under pipefail a match reads as a failure, at random.
# Every listing and file is captured first, then searched.
has() { grep -qx -- "$1" <<< "$tree"; }

echo "Package contract: $(basename "$ZIP")"

# The site refuses a package whose tree does not extract relative to the
# PixInsight install directory.
if grep -q '^src/' <<< "$tree"; then
   note "extracts relative to the PixInsight install directory"
else
   bad "no src/... tree: the site's ingest would reject this"
fi

# Code signature (CPD Program Rules, rule 5.1). Exactly one, for the entry
# script: its signature covers every file the entry #includes, and a signature
# on any other file is never verified - PixInsight's documentation calls that
# misleading. Validity can only be checked by PixInsight itself, which
# build-update-package.sh does at signing time; this checks the shape and the
# identity the signature claims.
sigs="$( printf '%s\n' "$tree" | grep -i '\.xsgn$' || true )"
if [ -z "$sigs" ]; then
   if [ "$SIGNED" -eq 1 ]; then
      bad "no code signature: a release must ship $VENDOR/$NAME.xsgn"
   else
      note "unsigned: a development build, not a release"
   fi
elif [ "$sigs" != "$VENDOR/$NAME.xsgn" ]; then
   bad "the only signature must be $VENDOR/$NAME.xsgn, found:"
   printf '%s\n' "$sigs" | sed 's/^/          /'
elif ! grep -q "<Signature [^>]*scriptId=\"$NAME\"[^>]*developerId=\"CaeloWorks\"" \
       <<< "$( unzip -p "$ZIP" "$VENDOR/$NAME.xsgn" )"; then
   bad "$NAME.xsgn is not a CaeloWorks signature of script $NAME"
else
   note "signed by CaeloWorks ($NAME.xsgn)"
fi

# Everything the script needs at runtime.
if has "$VENDOR/$NAME.js"; then note "entry script is in place"; else bad "no $VENDOR/$NAME.js"; fi

# The icon, shipped twice: the menu icon where #feature-icon looks for it, and
# the dialog emblem next to the script.
if has "rsc/icons/script/$NAME/$NAME.svg"; then
   note "menu icon is installed under rsc/icons/script/"
else
   bad "no menu icon at rsc/icons/script/$NAME/$NAME.svg"
fi
if has "$VENDOR/$NAME.svg"; then note "dialog emblem is next to the script"; else bad "no $VENDOR/$NAME.svg"; fi

# GPL-3 section 4: the licence travels with every copy.
if has "$VENDOR/LICENSE"; then note "LICENSE ships with the script"; else bad "LICENSE is missing"; fi

# The version stamp has to have been substituted, or the dialog shows the
# literal placeholder and no user can report which build they are on.
entry_js="$( unzip -p "$ZIP" "$VENDOR/$NAME.js" )"
if grep -q '__BUILD__' <<< "$entry_js"; then
   bad "the __BUILD__ placeholder was not stamped"
else
   note "the version stamp was substituted"
fi

# Nothing from the development tree belongs in a user's PixInsight install. A
# whitelist rather than a blacklist: the package unpacks over someone's
# PixInsight directory, so the question is not "is this file unwanted" but
# "is this file one of the two places we are allowed to write".
stray="$( printf '%s\n' "$tree" \
          | grep -v '/$' \
          | grep -vE "^(${VENDOR}|rsc/icons/script/${NAME})/" || true )"
if [ -n "$stray" ]; then
   bad "the package writes outside its two allowed directories:"
   printf '%s\n' "$stray" | sed 's/^/          /'
else
   note "every file lands under $VENDOR/ or rsc/icons/script/$NAME/"
fi

echo
[ "$fail" -eq 0 ] && echo "PASS" || echo "FAILED"
exit "$fail"
