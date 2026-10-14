#!/usr/bin/env bash
# Run after building the local image with build-xyce-serial.sh. No reference tuning.
set -euo pipefail
root=${1:?Usage: run-linux-decks.sh ABSOLUTE_DECK_ROOT}
case "$root" in /*) ;; *) exit 2 ;; esac
xyce=${XYCE_BIN:-/build/install/bin/Xyce}
"$xyce" -v
count=0
for index in $(seq 0 21); do
  cd "$root/$index"
  test -f input.cir
  status=0
  "$xyce" input.cir > stdout.txt 2> stderr.txt || status=$?
  printf '%s\n' "$status" > exit.txt
  printf '%s: exit=%s\n' "$index" "$status"
  test "$status" -eq 0
  test -s output.csv
  count=$((count+1))
done
printf 'EXECUTED_FIXTURES=%s\n' "$count"
