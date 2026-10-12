# Issue #549 (M2): cpl4_txl_2_line TXL+CPL deck runtime

Host: macOS arm64 (Apple Silicon, shared with other spice-ts lanes), Node
v22.23.1, Homebrew ngspice-47. Base: main `68b64909`. All heavy runs were
wrapped in `spice-heavy`.

## What the profile says

The card asked for the top bottleneck in the TXL (Y) / CPL (P) code. The
profile of the deck says the lines are **not** where the time goes:

- `updateConvolution` (the TXL/CPL history convolution) is 3.7 ms of 5206 ms
  sampled, about 0.1%. The TXL/CPL `stamp`/`evaluateLoad` frames are about 1-3%.
- The top self-time frame on main was `breakdownKneeVoltage` in
  `packages/core/src/devices/diode.ts`, **22.8% self time**
  (`profiles/cpl4_txl_2_line-before.txt`). The deck has 25 diodes in the BJT
  driver and the diode receiver, several with `bv=10`.

`breakdownKneeVoltage` is the ngspice-47 `diotemp.c` fit for the breakdown knee
`tBrkdwnV`: a 26-step `log` fixed point. ngspice runs it once per temperature
update. spice-ts ran it on every junction evaluation: once per
`junctionCurrent` call (up to 13 per stamp, from the series-resistance Newton
loop) and once more per `limitJunctionStep`.

## The fix

The knee is now memoised in a 16-entry ring keyed on all five inputs of the fit
(BV(T), IBV, NBV*vt, vt, IS). The fit itself is unchanged and stays in
`breakdownKneeVoltage`; the lookup sits before it and the store after it. A hit returns the same double the fit would return, so the
waveforms are bit-identical. This puts spice-ts closer to ngspice's structure
(knee solved once per temperature) without changing the algorithm.
`diode-breakdown-knee-memo.test.ts` checks that memoised knees and fresh solves
(cache cleared) are bit-equal across hits, misses and evictions (40 distinct knees, more than the
ring holds), and that changing any one key gives the new fit.

## Paired A/B (process CPU, user+sys)

`scripts/ab.sh` alternates before/after builds per deck in two rounds. Each
round is one warm-up run plus 5 measured runs in one process, so there are 10
samples per variant (`ab.jsonl`). The waveform hash is SHA-256 over the time
axis and every node voltage and branch current (Float64).

| deck | points | median CPU before | median CPU after | change | waveform sha256 before = after |
|---|---|---|---|---|---|
| examples/TransmissionLines/cpl4_txl_2_line.sp | 12224 | 1333.4 ms | 936.2 ms | **-29.8%** | yes (`498ef5a2caa9338f…`) |
| tests/transmission/txl1_1_line.cir (control) | 684 | 12.6 ms | 11.6 ms | -7.9% (noise) | yes (`ea9196160129f9ba…`) |
| tests/transmission/txl2_3_line.cir (control) | 1026 | 14.3 ms | 14.2 ms | -0.7% (noise) | yes (`0127952c37b55866…`) |
| tests/transmission/cpl_ibm2.cir (control) | 1207 | 15.0 ms | 14.9 ms | -0.3% (noise) | yes (`f481479a70fea692…`) |

The three controls have no breakdown diodes, so no change is expected there.
Their first samples in each round are 50-80 ms (JIT warm-up), so their medians
are noisy.

## Against ngspice-47 on the same host (losses included)

`scripts/ngspice-time.py` feeds ngspice the same netlist bytes
(`run-deck.mjs` with `EMIT_NETLIST=1`) plus an appended `.control run / quit`
block. It runs `ngspice -b` 5 times after one dropped warm-up run
(`ngspice.jsonl`). ngspice's wall and CPU **include process start-up**. spice-ts
is measured warm and in-process, so the comparison favours spice-ts on the small
decks.

| deck | ngspice-47 median wall / CPU | ngspice accepted points | spice-ts after, median CPU | spice-ts / ngspice CPU |
|---|---|---|---|---|
| cpl4_txl_2_line.sp | 17.8 ms / 16.0 ms | 285 | 936.2 ms | **59x slower (LOSS)**; was 83x before this change |
| txl1_1_line.cir | 11.7 ms / 10.0 ms | — | 11.6 ms | 1.2x slower |
| txl2_3_line.cir | 12.1 ms / 10.4 ms | — | 14.2 ms | 1.4x slower |
| cpl_ibm2.cir | 11.3 ms / 9.5 ms | 217 | 14.9 ms | 1.6x slower |

## What is left (not fixed here)

1. **Timepoint count is now the dominant factor.** On cpl4_txl_2_line, spice-ts
   accepts 12224 points to ngspice's 285 (ngspice `rusage all`: 360 attempted,
   1904 Newton iterations, 6.8 ms analysis time). Per accepted point spice-ts
   costs about 77 µs and ngspice about 24 µs, so a ~3x per-point gap times a
   ~43x point-count gap. The point count is step control. The #549 thread shows
   ngspice's default-step run on this deck is 18-26% from its own TMAX=0.01n
   run, while spice-ts default is 1-2% from it (#592). Matching ngspice's step
   count would change accuracy behaviour, which this lane does not do. It
   belongs with the #592 step-control work.
2. **Next per-point frames** after this fix (`profiles/cpl4_txl_2_line-after.txt`):
   sparse `factorize` 16.3% and `stampG` 9.2% self time; `breakdownKneeVoltage`
   is down to 0.9 ms of 6798 ms sampled. These are generic
   solver and stamping costs, not TXL/CPL. They are separate from the line
   models and should go to an M2 solver lane.
3. The 27% default-step accuracy gap is unchanged by this PR (bit-identical
   output). Per the #549 thread it is ngspice's unconverged default step (#592).

## Reproduce

```sh
# decks (BSD-3-Clause, ngspice 3ef069fb, from the corpus-f branch)
for f in examples/TransmissionLines/cpl4_txl_2_line.sp tests/transmission/txl1_1_line.cir \
         tests/transmission/txl2_3_line.cir tests/transmission/cpl_ibm2.cir; do
  git show origin/wt/corpus-f-batch1-484:benchmarks/corpus/corpus-f/fixtures/$f > "$S/$(basename $f)"
done
# build "before" (main) and "after" (this branch) into two dist copies
pnpm -C packages/core build && cp -R packages/core/dist "$S/dist-after"   # likewise on main -> dist-before
spice-heavy benchmarks/performance/results/issue-549/scripts/ab.sh "$S/dist-before" "$S/dist-after" 5 "$S"/*.sp "$S"/*.cir
spice-heavy python3 benchmarks/performance/results/issue-549/scripts/ngspice-time.py 5 "$S"/*.sp "$S"/*.cir
# profile
SPICE_TS_DIST="$S/dist-after" node --cpu-prof benchmarks/performance/results/issue-549/scripts/run-deck.mjs "$S/cpl4_txl_2_line.sp" 3
node benchmarks/performance/profile-summary.mjs CPU.*.cpuprofile 25
```

The before profile is 1 warm-up plus 2 runs. The after profile is 1 warm-up
plus 3 runs and was taken while the full test suite ran in the other heavy
slot, so its absolute times are inflated; compare the percentages, not the
sampled totals. The A/B table above was measured without that contention.
