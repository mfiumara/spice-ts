#!/usr/bin/env bash
# Issue #549 paired A/B: alternate before/after builds per deck, N samples each.
#   ab.sh <dist-before> <dist-after> <runs> <deck>...
# Wrap in spice-heavy. Prints one JSON line per (variant, deck, round).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
before="$1"; after="$2"; runs="$3"; shift 3
for deck in "$@"; do
  for round in 1 2; do
    for variant in before after; do
      dist="$before"; [ "$variant" = after ] && dist="$after"
      SPICE_TS_DIST="$dist" node "$here/run-deck.mjs" "$deck" "$runs" | sed "s/^{/{\"variant\":\"$variant\",\"round\":$round,/"
    done
  done
done
