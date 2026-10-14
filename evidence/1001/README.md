# MOS2 operating-point continuation (partial #1001)

This continuation closes the original cram OP and transient branch-selection
losses without a seed, per-circuit tuning, tolerance changes or aggregate changes.
The original mosrect/ring controls still lose. No speed claim is made.

## Root cause against ngspice-47

PR [#1018](https://github.com/mfiumara/spice-ts/pull/1018), merged at
`c97498eb5de80ba55ebc75744b2dba5ef31efc28`, added MOS2 model-local INITJCT
and gate/drain limiting. Its inverse-mode junction path then incorrectly
recomputed `vbd = vbsRaw - limitedVds` after gate/drain limiting.

ngspice-47 source at tag commit
[a80f6e3e95d51534905b1f23410a951802666656](https://github.com/imr/ngspice/tree/a80f6e3e95d51534905b1f23410a951802666656),
`src/spicelib/devices/mos2/mos2load.c`:

- Line 236 computes raw `vbd = vbs - vds` before gate/drain limiting.
- Lines 338-352 limit gate/drain voltages against the previous load.
- Lines 353-356, in normal mode, limit raw Vbs then recompute Vbd.
- Lines 358-360, in inverse mode, limit the saved raw Vbd then reconstruct
  `vbs = vbd + limitedVds`.

The fix retains raw Vbd across those limits. No transistor equation, bypass,
solver, homotopy schedule, startup phase or transient charge/history is changed.
Transient stamps have no local gate/drain limit, so their arithmetic is unchanged.

The two-polarity regression makes the divergence explicit. From a zero previous
load, raw polarity-domain Vds=-10 V and Vbs=-10 V give Vbd=0. DEVlimvds
limits Vds to -0.5 V. ngspice reconstructs Vbs=-0.5 V. The old path invented
Vbd=-9.5 V, limited it to -1 V, and evaluated the channel at Vbs=-1.5 V.
That changes body effect and the Newton trajectory. Both cases fail before
this fix and pass after it.

A full-circuit regression loads the exact retained plain-OP cram deck, checks
all 16 latch nodes (eight pairs) and its supply current. Before this fix,
xi40.14 is 1.8426326966768551 V instead of 1.518701644464528e-8 V.
After it, all eight pairs reach the native rail branches. Fresh cram OP supply
current differs from ngspice by 2.866581969679659e-16 A. This is evidence of
ngspice trajectory parity on these decks, not proof of a unique equilibrium.

## Measured before/after, every control

`continuation-before.json` records a fresh run on main c97498eb after PR1018.
`receipt.json` records the final candidate and preserves the older #996
historical baseline in each row's `before` field. The table below compares the
fresh continuation baseline's `after` field to the current receipt's `after`.
Both engines receive identical retained deck bytes on every run.

The unchanged offline #996 metric interpolates native ngspice values onto
spice-ts timepoints, without phase alignment. Uniform peak floors remain
1e-4 V / 1e-10 A, and the match threshold remains 1%. This is not an aggregate
refresh. Receipts record hashes, statuses, point counts, initial error,
worst signal and environment. The worst signal can differ between runs.

| Control | After PR1018 | After inverse-bias fix | Outcome |
| --- | ---: | ---: | --- |
| k-10-fine | 0.00012918699523078547 | 0.00012918699523078547 | match |
| k-10-op | 0.000004998456707317607 | 0.000004998456707317607 | match |
| k-10-original | 0.015832540193349596 | 0.015832540193349596 | loss |
| k-10-reduced | 0.015832540193349596 | 0.015832540193349596 | loss |
| k-10-tight | 0.0038518864825453445 | 0.0038518864825453445 | match |
| k-15-fine | 0.0029551217276694523 | 0.0029551215604537145 | match |
| k-15-no-ic-op | 4.035483561383288e-9 | 4.035483561383288e-9 | match |
| k-15-op | 4.035483561383288e-9 | 4.035483561383288e-9 | match |
| k-15-original | 0.3244613309478497 | 0.32446133098722996 | loss |
| k-15-reduced | 0.0004113405617928305 | 0.00041134046005567005 | match |
| k-15-stages-13 | 0.0004728312717601312 | 0.0004728312767379553 | match |
| k-15-stages-3 | 0.0005539798926476147 | 0.000553979918672651 | match |
| k-15-stages-5 | 0.023707938128149336 | 0.023707938208262856 | loss |
| k-15-stages-9 | 0.00039106604917618485 | 0.0003910660644103626 | match |
| k-15-tight | 0.002202740781938774 | 0.003504324927011608 | match |
| k-5-fine | 1.1508561960417991 | 0.00013482368972306027 | match |
| k-5-latch-op | 2.9476145517568227e-7 | 3.6415039421475455e-7 | match |
| k-5-op | 3194111.7530000396 | 0.0000018266062192895974 | match |
| k-5-original | 1.1501800384706622 | 0.0010298802750966184 | match |
| k-5-seeded | 3.119439127883779 | 0.0007491129587609451 | match |
| k-5-tight | not compared | not compared | both failed |

All successful cram controls now match. Four successful controls remain losses:
original/reduced mosrect and original/five-stage ring. The tightened ring control
worsens from 0.002202740781938774 to 0.003504324927011608, still below 1%.
The reduced latch has a small supply-current rounding regression, also below 1%.
These regressions are retained. Tight cram still fails in both engines and is
not scored as a win or a target.

## Verification and reproduction

    pnpm install --frozen-lockfile
    pnpm build
    pnpm lint
    pnpm -C packages/core exec vitest run src/devices/mos2-inverse-limiting-1001.test.ts src/analysis/latch-op-selection-1001.test.ts src/devices/mos2.test.ts src/devices/mos2-convergence-799.test.ts src/devices/mos2-temperature-995.test.ts src/devices/mos2-series-resistance-982.test.ts src/initial-state.test.ts
    spice-heavy pnpm exec tsx evidence/1001/run.ts
    spice-heavy python3 evidence/1001/check.py

RED on the continuation baseline exits 1 with three failures (both polarities
and the full cram OP). GREEN exits 0 with 94 tests passing. Build, lint,
21-control run and offline verification exit 0. Additional existing mosamp2
stopping guards are recorded in `continuation-verification.json`.

`check.py` verifies all 21 hashes/counts, unchanged historical summaries, newly
matched cram controls, retained mosrect/ring losses and both-engine tight cram
failure. It changes expected outcomes, not tolerances or the metric.
`run.ts` is unchanged and accepts an optional control name; a full run is
required before checking. It writes scalar receipts only.

The final code is bound by `workingTreeCodePatchSha256` relative to the receipt's
`baseHead` (the test-only commit). Required full GitHub CI and independent review
must validate the exact PR head before a supervisor can merge. No local full
suite was run on this continuation, as requested by the card. `verification.json`
is historical PR1018 evidence, not a claim about this continuation.

## Remaining scope and provenance

Original mosrect convergence/integration (#1002) and ring startup (#1003) remain
separate investigations. Do not interpret this OP correction as closing those
transient losses. Tight cram's both-engine failure is retained, not a target.

No new external fixture or source is imported. Decks and model cards come from
`evidence/996/runs`, derived from corpus-k / Xyce_Regression
`7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, GPL-3.0-or-later, with
URLs/licences/hashes in `benchmarks/SOURCES.md`, corpus-k notices and
`evidence/996/README.md`. The reduction reads `evidence/996/repro/latch.cir`.
The new two-polarity unit test is an original diagnostic.
