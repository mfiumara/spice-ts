# MOS2 invert2 / invert2_alt diagnosis (#1081)

Evidence-only. No production model, solver, fixture, corpus outcome or tolerance
change is shipped. The original loss remains **0.38022371053385456** for both
m-19 and m-20. This does not fix or close #1081.

## Findings and limits

1. The alias hypothesis is eliminated for these decks. The compiled UO/VTO and
   U0/VT0 models and instances are identical. NMOS resolves to U0=190,
   VTO=1.679, KP=2.161e-5; PMOS to U0=310, VTO=-1.6, KP=1.711e-5.
   The retained complete executions are identical between the alias decks,
   separately in each engine, for default, fine-TMAX and tight-option runs.
2. The first default-deck 1% output divergence occurs at 6.009059951892151 us.
   The first input fall and subsequent rise closely agree between the default
   engines, but both are materially different from a fine-step native run.
3. Setting the same diagnostic TMAX=0.1 ns in both engines reduces their
   output disagreement to 0.000341052234 V max, normalized 0.000069791610.
   All common signals match the unchanged corpus-f gate on this diagnostic.
4. Both default engines lose against that same fine native reference. The
   max output errors are 1.252788514 V for spice-ts and 1.284324597 V for
   ngspice. This is not merely an interpolation-only explanation and is not
   evidence that default spice-ts is correct.
5. Tightening the same options in both engines reduces output disagreement
   to 0.006397634 V max. The diagnostic still loses the all-signal gate on
   i(vdddev), normalized 0.0163. This loss is retained.

Measured sensitivity localizes the investigation to coarse transient stepping,
load/convergence and charge-history evolution. It does **not** identify which
native-vs-TS state transition causes the original divergence. No native internal
load trace or causal intervention proving a generic fix is present. A model-law
correction, a claim of an ngspice bug, a connection to MOS1 #1080 or MOS3 #1082,
and a tolerance increase would all be unsupported. The next investigation needs
paired native/TS load and retry states at the 6.008843 us timepoint, before the
accepted grids split around the steep switching knee.

## Original-input before/after (both fixtures)

The second run is an evidence-only replay, **not an improvement**. Complete
engine executions are byte-for-byte equal as parsed JSON across these runs.

| Input | Before normalized output error | After normalized output error | Max absolute error | Corpus-f RMS error | Result |
|---|---:|---:|---:|---:|---|
| invert2 | 0.38022371053385456 | 0.38022371053385456 | 1.8560836650731265 V | 0.0935096309647208 V | mismatch |
| invert2_alt | 0.38022371053385456 | 0.38022371053385456 | 1.8560836650731265 V | 0.0935096309647208 V | mismatch |

Unchanged `reduceRow`/corpus-f comparison receipts are in before.json and
after.json. They include all six common signals and both breakpoint-aware and
linear interpolation metrics. Each original ngspice run has 1,961 points and
spice-ts 1,956. Source SHA-256 pins are retained in both receipts. Corpus-m
outcomes.json is intentionally untouched because #1083 owns it.

## First-divergence table

Both aliases have the same table. Values below use linear native interpolation
at spice-ts points, without circuit-specific threshold changes. This diagnostic
RMS is 0.09353225592024875 V, slightly different from the corpus-f
breakpoint-aware RMS above. `check.py` recomputes it and the first threshold
crossing from retained waveforms.

| Event | Time (us) | spice-ts V(vout) | Interpolated ngspice V(vout) | Absolute difference | Peak-normalized difference |
|---|---:|---:|---:|---:|---:|
| First output error above 1% | 6.009059951892151 | 2.831344420963424 | 2.9295579824051154 | 0.09821356144169124 | 0.020119311138182605 |
| Worst output error | 18.0092860626478 | 2.733035761329907 | 0.8769520962567807 | 1.8560836650731265 | 0.38022371053385456 |

Immediately before the grid split, native accepts 6.008843019489889 us at
V(vout)=3.982640655745936 V; TS accepts 6.0088430177134165 us at
3.982584936901978 V. Native next accepts 6.009421509744944 us, whereas TS
first accepts 6.008915329106328 us. Accepted points alone cannot say whether
this is native bypass, limiting, a Newton rejection, or LTE rejection.

## Diagnostics, not replacement headline results

Diagnostic transforms are applied in memory to **both** engines with identical
bytes. No committed fixture is edited. `fine.json`/`tight.json` record the
original and actual input hashes. These are not new public benchmark circuits.

| Diagnostic (both aliases) | Output max error (V) | Output normalized error | Worst all-signal normalized error | Result |
|---|---:|---:|---:|---|
| TMAX=0.1 ns | 0.0003410522335141053 | 0.0000697916096419217 | 0.000266, i(vdddev) | matched |
| RELTOL=1e-6, VNTOL=1e-9, ABSTOL=1e-15 | 0.006397633642367229 | 0.0013091331635032347 | 0.0163, i(vdddev) | mismatch |
| Default TS vs fine native | 1.2527885142355348 | 0.25636579490629074 | output-only diagnostic | loss |
| Default native vs fine native | 1.2843245966250563 | 0.26281921680324466 | output-only diagnostic | loss |

The fine native waveform is a sensitivity reference, not an independently proven
exact solution. No timing/speed claim is made. Versions and host metadata are
recorded in the run receipts (ngspice-47, Node v22.23.1, Apple M5 Pro, arm64).

## Native source audit and provenance

The original public decks and GPL-3.0-or-later licence receipts are already
recorded in [corpus-m/SOURCES.md](../corpus/corpus-m/SOURCES.md), m-19/m-20,
Xyce_Regression commit `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`.
No new upstream fixture is redistributed. Runner, tests and checker are
self-written MIT project work; waveform values are generated measurements.

Read-only ngspice-47 references are pinned to commit
`a80f6e3e95d51534905b1f23410a951802666656`; hashes are in source.json:

- [mos2.c L119-L143](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos2/mos2.c#L119-L143)
  maps VTO/VT0 and U0/UO to the same identifiers.
- [mos2mpar.c L25-L28](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos2/mos2mpar.c#L25-L28)
  and L113-L116 assign threshold and mobility and set their given flags.
- [mos2par.c L45-L75](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos2/mos2par.c#L45-L75)
  assigns instance W/L, areas, perimeters and resistor squares.
- [mos2temp.c L68-L71](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos2/mos2temp.c#L68-L71)
  gives U0 precedence when KP is absent; these decks explicitly provide KP.
  L169-L205 gives direct RD/RS precedence over RSH. L213-L215 temperature-scales
  KP and mobility. Here TEMP=TNOM=27, so the scaling ratio is one.
- [mos2load.c L1190-L1315](https://github.com/imr/ngspice/blob/a80f6e3e95d51534905b1f23410a951802666656/src/spicelib/devices/mos2/mos2load.c#L1190-L1315)
  evaluates Meyer capacitances at loaded voltages, adds state0/state1 halves
  and overlaps, predicts charges for MODEINITPRED, and otherwise advances
  charges from state1. This motivates the next paired-state investigation,
  not a demonstrated defect in the current TS port.

## Reproduce and verification receipts

Run from repository root:

    pnpm install --frozen-lockfile
    pnpm build
    spice-heavy pnpm exec tsx benchmarks/mos2-invert2-1081/run.ts before
    ISSUE1081_RED=1 pnpm -C packages/core exec vitest run src/devices/mos2-invert2-1081.test.ts
    spice-heavy pnpm exec tsx benchmarks/mos2-invert2-1081/run.ts after
    spice-heavy pnpm exec tsx benchmarks/mos2-invert2-1081/run.ts fine fine
    spice-heavy pnpm exec tsx benchmarks/mos2-invert2-1081/run.ts tight tight
    python3 benchmarks/mos2-invert2-1081/check.py --check
    pnpm -C packages/core exec vitest run src/devices/mos2-invert2-1081.test.ts src/devices/mos2.test.ts src/devices/mos2-temperature-995.test.ts src/devices/mos2-series-resistance-982.test.ts src/devices/mos2-convergence-799.test.ts src/devices/mos2-charge-history-1003.test.ts src/devices/mos2-predictor-1003.test.ts
    pnpm lint
    spice-heavy pnpm test

RED commit `d3d147c8` runs ordinary assertions: 2 failed, 1 passed, both failures
at 0.38022371053385456 vs 0.01. Final tests expose the same RED via
ISSUE1081_RED=1 and otherwise mark those two parity cases `it.fails`. GREEN
means the alias guard and explicit known-loss regressions pass, **not** that
parity is fixed. Focused receipt: 85 passed, 2 expected failures (87 tests).

Local build and lint pass. The wrapped full-suite attempt has 4,334 passed,
5 expected failures and two unrelated 5-second host-load timeouts, in
nonlinear-charge-history and pspice-iswitch-848. It is not reported as a green
full suite. Both affected files pass on a scoped rerun (14 tests), retained in
timeout-rerun.log.gz. Required exact-head GitHub CI is the authoritative full gate and
is recorded in the Kanban handoff. Compressed logs retain all these outcomes.
