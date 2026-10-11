#!/usr/bin/env bash
# Issue #611 / #604 reproduction. Usage (from the repo root):
#   CORE_DIST=<spice-ts checkout>/packages/core/dist/index.js \
#   CORE_SRC=<spice-ts checkout>/packages/core/src/index.ts \
#   OUT=<results dir> bash benchmarks/adder-timeout-611/run.sh
# Every engine run is wrapped in spice-heavy (shared-host load rule).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
FIX="$ROOT/benchmarks/corpus/corpus-f/fixtures/examples"
OUT=${OUT:?set OUT}
CORE_DIST=${CORE_DIST:?set CORE_DIST}
CORE_SRC=${CORE_SRC:?set CORE_SRC}
BUDGET_MS=${BUDGET_MS:-120000}
PROFILE_MS=${PROFILE_MS:-30000}
HEAVY=${HEAVY:-spice-heavy}
mkdir -p "$OUT"
cd "$ROOT"
# Wall times, and whether adder_bip finishes inside the bound, depend on host load.
uptime > "$OUT/load.start"

# Decks. adder_bip: the corpus-f fixture bytes. adder_mos: its .control block
# (pre_set/unset/save, which spice-ts rejects before simulating) is removed and
# the outputs it saved are kept with a .save card; both engines read these bytes.
cp "$FIX/digital/compare/adder_bip.cir" "$OUT/adder_bip.cir"
awk '/^\.control/{skip=1} !skip{ if (toupper($0) ~ /^\.END$/) print ".save V(9) V(10) V(11) V(12) V(13)"; print } /^\.endc/{skip=0}' \
  "$FIX/digital/compare/adder_mos.cir" > "$OUT/adder_mos_body.cir"
awk '/^\.control/{skip=1} !skip{print} /^\.endc/{skip=0}' "$FIX/digital/compare/adder_bip.cir" > "$OUT/adder_bip_body.cir"
shasum -a 256 "$OUT"/*.cir > "$OUT/decks.sha256"

# ngspice-47, ASCII raw (same .spiceinit as corpus-f).
NGHOME=$(mktemp -d)
printf 'set filetype=ascii\n' > "$NGHOME/.spiceinit"
for deck in adder_bip adder_bip_body adder_mos_body; do
  start=$(python3 -c 'import time; print(time.time())')
  (cd "$OUT" && HOME="$NGHOME" $HEAVY ngspice -b -r "$deck.raw" "$deck.cir" > "$deck.ngspice.log" 2>&1)
  python3 -c "import time,sys; print(f'{time.time()-float(sys.argv[1]):.2f}')" "$start" > "$OUT/$deck.ngspice.wall"
done
rm -rf "$NGHOME"

measure() { # deck label extra-args...
  local deck=$1 label=$2; shift 2
  $HEAVY pnpm exec tsx benchmarks/adder-timeout-611/measure.mts "$OUT/$deck.cir" --core "$CORE_DIST" \
    --budget-ms "$BUDGET_MS" --out "$OUT/$deck.$label.json" --record "$OUT/$deck.$label.wave.json" \
    --nodes 9,10,11,12,13 "$@" > /dev/null
}
measure adder_bip baseline --diagnose
measure adder_mos_body baseline --diagnose
measure adder_bip no-node-lte --experiment no-node-lte
measure adder_mos_body no-node-lte --experiment no-node-lte
# Opt-in (FULL_BIP_MS, e.g. 900000): diagnostic-only adder_bip run past the 120 s
# bound, to record whether and when it completes at the current host load.
if [ -n "${FULL_BIP_MS:-}" ]; then
  uptime > "$OUT/full.load.start"
  BUDGET_MS=$FULL_BIP_MS measure adder_bip full --diagnose
  uptime > "$OUT/full.load.end"
fi

# CPU profiles of the baseline (source build, so frames carry file URLs).
for deck in adder_bip adder_mos_body; do
  rm -rf "$OUT/prof-$deck"
  $HEAVY env NODE_OPTIONS="--cpu-prof --cpu-prof-dir=$OUT/prof-$deck" pnpm exec tsx \
    benchmarks/adder-timeout-611/measure.mts "$OUT/$deck.cir" --core "$CORE_SRC" --budget-ms "$PROFILE_MS" \
    --out "$OUT/$deck.profile-run.json" > /dev/null
  # NODE_OPTIONS also profiles the pnpm and tsx launchers; keep the simulator's profile.
  biggest=$(grep -l 'packages/core/src/devices' "$OUT/prof-$deck"/*.cpuprofile | head -1)
  pnpm exec tsx benchmarks/adder-timeout-611/profile-split.mts "$biggest" > "$OUT/$deck.profile-split.json"
  rm -rf "$OUT/prof-$deck"
done

# No `|| true`: a failing comparison must stop the run (set -e) instead of
# leaving an empty JSON for summarize.mts to trip over.
for deck in adder_bip adder_mos_body; do
  for label in baseline no-node-lte; do
    pnpm exec tsx benchmarks/adder-timeout-611/compare.ts "$OUT/$deck.$label.wave.json" "$OUT/$deck.raw" \
      > "$OUT/$deck.$label.compare.json"
  done
done
if [ -n "${FULL_BIP_MS:-}" ]; then
  pnpm exec tsx benchmarks/adder-timeout-611/compare.ts "$OUT/adder_bip.full.wave.json" "$OUT/adder_bip.raw" \
    > "$OUT/adder_bip.full.compare.json"
fi
uptime > "$OUT/load.end"
echo "done: $OUT"
