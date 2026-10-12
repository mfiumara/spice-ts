# Issue #715: MOSFET LEVEL=3 (MOS3) and LEVEL=9 (MOS9)

spice-ts rejected `LEVEL=3` and `LEVEL=9` MOSFET cards with `UNSUPPORTED_MODEL_LEVEL`. They are now
ported from ngspice-47 `src/spicelib/devices/mos3` (mos3set.c, mos3temp.c, mos3load.c, mos3conv.c,
mos3trun.c) as `packages/core/src/devices/mos3.ts`. `mos9` is mos3 with exactly two code differences,
both reproduced: mos9temp.c rejects an effective length/width below 1 µm, and mos9load.c divides by
`argb` without mos3load.c's `argb != 0` guard.

## Corpus-g bucket "model: MOSFET LEVEL=3 (MOS3) and LEVEL=9 (MOS9)" (7 decks)

Byte-identical corpus-g (#711) fixtures through ngspice-47 and spice-ts with the corpus-f runner,
metric and 1% threshold (`runFixture`; worst |error| divided by the ngspice peak of that signal).
No per-circuit tuning. Receipts: `receipts/parity-before.json` (main b04bc1ee), `receipts/parity-after.json` (this branch merged
with main 45d6ea73, which includes the #705 VNTOL/ABSTOL peak floor).

| Fixture | Analysis | Before | After | Worst signal (after) |
|---|---|---|---|---|
| NMOS3_DC/mos3_dc.cir | dc | unsupported | matched, 1.26e-15 | i(vds) |
| OP/comparator_op.cir | op + tran | unsupported | matched, 3.4e-4 | tran v(9) |
| COMPARATOR/comparator.cir | tran | unsupported | matched, 3.4e-4 | v(9) |
| MODEL_BINNING/comparatorBaseline_forGlobal.cir | tran | unsupported | matched, 3.4e-4 | v(9) |
| ACtests/bsim3/gain-stage.cir | ac | unsupported | matched, 3.39e-5 | v(vdd) |
| SUBCKT/subckt_a0.cir | tran | unsupported | **mismatch, 0.246** | i(vdddev) |
| MOS13_IC/invert42_mos3.cir | tran | unsupported | **mismatch, 0.838** | v(vout) |

5 of 7 match. The 2 remaining losses do not come from the MOS3/MOS9 equations; the gain-stage note
explains its worst signal:

- **gain-stage.cir** — `v(vdd)` is an ideal source node: ngspice prints exactly 0 V, spice-ts
  1.7e-9 to 3.4e-9 V of solver rounding (the values are multiples of 2^-69 × 1e12, which suggests one
  ulp divided by the 1e-12 AC gmin; not investigated further), so before #705 the peak-normalised metric
  divided by a 1e-12 floor (3390); with #705's VNTOL floor the score is 3.39e-5. The circuit output `v(3)` agrees to 3.4e-9 V absolute (1.1e-8 of its 0.298 V
  peak) over all 71 points. The same deck with LEVEL=2 (MOS2 on main) shows the identical residual.
  Metric class fixed by #705 (#593).
- **subckt_a0.cir**, **invert42_mos3.cir** — the DC operating points agree (v(OUT) 4.806048 V,
  v(VOUT) 4.782500 V at t = 0) and so does every output edge on average; the error is edge-time
  scatter from step control. `edges.ts` measures the 2.5 V crossings on the identical deck:
  - subckt_a0 v(OUT): 19/19 edges, mean timing delta −2.7 ps, worst 137 ps (period 3.01 µs)
  - invert42 v(VOUT) (end of a 42-stage chain): 19/19 edges, mean −196 ps, worst 852 ps
  The edges fall in ~0.4 ns, so a ~0.1 ns shift is a volt of pointwise error. The deltas change sign
  edge to edge (no systematic delay); ngspice's own spacing between same-direction subckt_a0 edges
  varies by up to 90 ps around the 3.01 µs period.
  The step grid diverges right after t = 0: ngspice-47 dctran.c skips the truncation check on the
  first timepoint (`firsttime ... goto nextTime`) and repeats the first step (0, 0.2 ns, 0.4 ns,
  0.8 ns), spice-ts doubles at once (0, 0.2 ns, 0.6 ns, 1.4 ns). A LEVEL=1 inverter shows the same
  grid, and subckt_a0 with LEVEL=2 (MOS2 on main, RD/RS removed) loses at the same level under the
  same peak-normalised max error (v(OUT) 0.315, i(VDDdev) 0.264). Driver step control is tracked
  in #561.

Device-level parity is pinned in `packages/core/src/devices/mos3.test.ts` (self-authored decks,
ngspice-47 references): DC sweeps agree to rounding (worst relative error 1.6e-15 NMOS with VMAX,
NFS, THETA, ETA, KAPPA, XJ, body bias and inverse mode; 6.3e-15 PMOS with WD/XL/XW, JS, TPG=−1),
series-resistance decks to the Newton tolerance (<1e-4 relative), and a CMOS inverter transient
with RD/RS, RSH×NRD, Meyer and junction charges at a 0.05 ns step bound to 0.2 mV worst over the
run (5 V swing), for both LEVEL=3 and LEVEL=9. The corpus-g checks in the same file run when the
corpus-g fixtures are on disk (on main since #722).

## Not ported (unchanged behaviour)

- Instance `IC=` and `OFF` are accepted and ignored, as for MOS1/MOS2: spice-ts has no MODEINITJCT
  phase for MOSFETs. On invert42_mos3.cir the operating point converges to ngspice's without them.
- `.options badmos3` (CKTbadMos3, default off), mos3noi.c/mos9noi.c (`.noise` rejects both levels),
  sensitivity.

## Reproduce

```sh
pnpm build
spice-heavy pnpm exec tsx benchmarks/results/issue-715/parity.ts --label after   # ngspice-47 on PATH
pnpm exec tsx benchmarks/results/issue-715/edges.ts
pnpm -C packages/core exec vitest run src/devices/mos3.test.ts
```

Machine: macOS 27.0.1 arm64, Node v22.23.1, ngspice-47 (Homebrew, KLU build).
