# MOS2 transient localization (#996)

Evidence only. No simulator, corpus fixture, tolerance, or aggregate-report changes.
Measured against ngspice-47 on main `ab17a0eccd357cfcd11c1c9ff5162ce02b10f39c`
(core tree `2fd270ed8ea43e367f6b1ab8fbb9d3e47c86687d`), after #988.
Environment: Apple M5 Pro, arm64, Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1.
No runtime comparison or speed claim is made.

## Original-input localization

“First violation” below means the earliest common-signal sample exceeding the
unchanged corpus-f 1% reference-peak threshold, with its uniform voltage/current
floors. It does not mean the first floating-point difference. `summary.json`
contains every common signal, its initial difference, first violation and maximum
error. Ties at the first time use lexicographic signal order. Diagnostic analysis
uses linear interpolation of ngspice onto the spice-ts grid, without phase
alignment or custom breakpoint snapping. The three original headline errors
reproduce the published #988 receipt.

| Fixture | OP / transient initial state | First violation (time, signal, absolute delta) | Original worst normalized error | Bucket / issue |
| --- | --- | --- | ---: | --- |
| k-5 cram | Different SRAM latch branches already at OP and t=0 | 0 s, v(xi10.10), 4.9999998785166415 V | 3.137159738608177, v(xi30.13) | A, [#1001](https://github.com/mfiumara/spice-ts/issues/1001) |
| k-10 mosrect | OP worst normalized difference 6.91e-7; t=0 v(2) delta 0.250424 uV, I(VDD) delta 1.17085 pA | 482.2800000000044 ns, I(VDD), 0.3027814174721054 uA | 0.015832540193349596, I(VDD) | B, [#1002](https://github.com/mfiumara/spice-ts/issues/1002) |
| k-15 ring | Plain OP agrees within 7.50e-9 normalized; every specified .ic voltage agrees exactly at t=0; I(VDD) initially differs by 16.8591 nA | 2.9137595656308023 ns, v(13), 0.05562019996679767 V | 0.32446133275386674, v(6) | C, [#1003](https://github.com/mfiumara/spice-ts/issues/1003) |

Original point counts (spice-ts / ngspice) are 1132 / 1122, 1008 / 1008,
and 1010 / 1010 respectively. These are all retained losses, not corrected
benchmark outcomes. The initial ring comparison establishes that `.ic` is not
simply ignored; it does not prove equality of all hidden device history.
Plain `.op` does not hold `.ic` nodes, whereas transient initialization without
UIC does. The `no-ic-op` ring control agrees within 1.55e-9 normalized too.

## A. OP solution selection, not a demonstrated constitutive-law defect

For cram, v(xi10.10) starts at 4.999999892194268 V in spice-ts and
1.36776257315173e-8 V in ngspice. Reducing maxstep tenfold leaves the initial
branch mismatch unchanged. The worst fine-step transient error remains 3.15075.
An explicit `.nodeset` experiment also leaves the mismatch in place.

The four-transistor reduction in `repro/latch.cir` removes all transient behavior.
It retains cram#top M3/M4/M5/M6 and both original model cards. spice-ts selects
v(12)=v(13)=1.8426336725257 V, I(VDD)=-125.317095993 uA. ngspice selects
v(12)=4.999999946096958 V, v(13)=1.367762560720779e-8 V,
I(VDD)=-10.5728915065 pA. See `runs/k-5-latch-op.json.gz`.

This circuit has multiple equilibria, including a symmetric metastable state.
An OP-branch disagreement is not, on its own, proof that a transistor equation
or either reference is wrong. Fix-lane investigation should trace initialization,
Newton and homotopy trajectories, including `.nodeset` hold/release semantics,
rather than force a fixture-specific branch. No Xyce or analytic reference
verdict is claimed. No unique stable OP was specified in the original deck.

The uniform tight-tolerance diagnostic fails in BOTH engines at 25 ns, with
`timestep too small`. Its errors are retained in `runs/k-5-tight.json.gz` and
marked not-compared in the summary. It is not evidence of a successful fix.

## B. mosrect finite-step / nonlinear convergence trajectory

The reduced four-NMOS bridge in `repro/mosrect.cir` removes the unused PMOS model
and reproduces the original error exactly. OP and the sampled intrinsic device
laws agree, but default-step transient current errors grow. Original maximum
absolute errors are 0.434714 uA for I(VDD) and 1.5453985768 mA for I(L1)/I(VIN).

Tenfold-smaller maximum step in BOTH engines reduces these errors to 1.39175 nA
and 3.23321 nA, with worst normalized error 0.000129283. A uniform tightened
Newton/LTE tolerance diagnostic also falls below 1% (worst 0.00382799).
This localizes the loss to the numerical transient trajectory rather than an
observed OP or sampled instantaneous VMAX/NEFF/charge-law discrepancy.
It does NOT isolate a particular integration, accepted-history, bypass, or
Newton-stopping line. Those remain the concrete next probes for #1002.

## C. ring startup phase offset, not accumulating frequency drift

After 20 ns, rising v(6)=1.5 V crossings give:

| Quantity | spice-ts | ngspice-47 |
| --- | ---: | ---: |
| Mean period | 10.680200750459978 ns | 10.680249597604729 ns |
| Mean frequency | 93.6311988290 MHz | 93.6307705977 MHz |

Period difference is -4.57360 ppm. Across seven crossings, ngspice lags by
94.63 to 94.99 ps, averaging 94.8951 ps. That nearly fixed offset is evidence
against describing the original loss as accumulating oscillator frequency drift.
For diagnosis only, a constant shift reduces v(6) max error over 20–99 ns from
1.013723 V to 0.065474 V. The remaining shape/interpolation error is nonzero.
Neither shift nor period scoring is used to change the original verdict.

At tenfold-smaller maxstep, v(6) max error is 0.00786713 V and worst normalized
error is 0.00295511. Uniform tighter tolerances give worst 0.00293439. Both
engines' periods also change with step size, so neither default-step waveform
should be treated as a demonstrated continuous-time oracle. Trace early
transient history and convergence before changing MOS2 static formulas.

Reduction controls are retained: three, nine and thirteen stages match the
uniform rule. Five stages fail only supply current near stop (0.0237079
normalized), not the original large voltage/phase symptom. A separate three-stage
control with its capacitor at node 2 also matches. These are not claimed to prove
the same internal cause. The smallest tested reproducer of the original v(6)
phase symptom remains the 17-stage `repro/ring.cir`; further minimization belongs
to #1003. B and C are separate investigation buckets, not an assertion of one
shared core defect.

## Matched-bias device evidence

`device-probes.ts` extracts every MOS2 device's intrinsic terminal voltages from
the original spice-ts trajectory. Each reduced reference instance is clamped to
those exact D/G/S/B voltages. Series resistance parameters are removed only in
these intrinsic-bias probe decks, not in the original benchmark. Both engines
use the same model and instance parameters. OP followed by a one-point 1 Hz AC
load populates ngspice capacitance and depletion-charge readouts. These are
instantaneous device-law comparisons, NOT a replay of transient charge history.

Coverage: cram 60 devices at four distinct times (240 probes), mosrect four at
five times (20), ring 34 at five times (170). The first failing sample is included
unless it duplicates t=0. Additional times are one-third, two-thirds, and stop.
All 430 probes and raw ngspice stdout/stderr plus the exact probe deck are in
`device-probes.json`. Signs follow ngspice MOS2's polarity-domain `id`, `qbs`,
`qbd` convention. The measured `cgs/cgd/cgb` readouts include overlaps.

| Fixture | max abs id delta (A) | gm delta (S) | gds delta (S) | cgs / cgd / cgb delta (F) | qbs / qbd delta (C) |
| --- | ---: | ---: | ---: | --- | --- |
| cram | 4.45e-18 | 1.02e-17 | 2.71e-18 | 6.78e-29 / 2.52e-29 / 6.31e-30 | 5.05e-29 / 4.07e-29 |
| mosrect | 1.69e-20 | 8.13e-20 | 1.48e-21 | 0 / 0 / 2.52e-29 | 3.79e-29 / 5.05e-29 |
| ring | 1.65e-18 | 8.67e-19 | 4.00e-19 | 1.26e-29 / 1.83e-28 / 9.47e-30 | 2.23e-30 / 1.03e-29 |

`qb` is not an ngspice MOS2 output parameter. The explicit `@m0[qb]` request
records `no such parameter qb` in stderr. qbs and qbd are compared separately;
they are not silently relabeled as intrinsic terminal qb. This is a Meyer model,
not a charge-conserving BSIM terminal-charge model. Agreement at sampled biases
cannot exclude unsampled branches or history-dependent defects.

## Reproduce and check

From the repository root:

    pnpm install --frozen-lockfile
    pnpm build
    spice-heavy pnpm exec tsx evidence/996/localize.ts
    python3 evidence/996/analyze.py
    spice-heavy pnpm exec tsx evidence/996/device-probes.ts
    python3 evidence/996/check.py
    pnpm lint
    spice-heavy pnpm test

A single run can be selected with a second argument, e.g. `k-10-reduced` or
`k-15-original`. The generator checks ngspice-47 and original fixture hashes.
All 21 diagnostic runs are retained, including the both-engine tight cram
failure. JSON gzip files contain decks, grid points and raw numeric samples,
not fitted curves or synthesized reference values. Original runs retain all
spice-ts signals (including prime nodes); non-original diagnostics retain all
common signals and omit unpaired spice-ts prime nodes to bound receipt size.
`analyze.py` is offline. `check.py` verifies counts, successful baseline/fine/OP
runs, matched-bias quantities, first-divergence and phase claims.

Local build, lint, guarded full tests, final probe generation and offline checks
passed. `receipt.json` records commands and exits. Required exact-head CI and
independent exact-head review remain the publication/merge gates, not this
README. No merge is performed by the implementation lane.

## Provenance

Original bytes are read from corpus-k commit
`e05f5f1748bb7aaada478e9c3378ec4dfb45e17c`, with manifest SHA-256 checks.
The upstream source is Xyce_Regression revision
`7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, GPL-3.0-or-later under its README
grant. Existing notices, full GPL text, source URLs and hashes are in
`benchmarks/corpus/corpus-k/licenses/xyce`, its manifest, and
`benchmarks/SOURCES.md`. Reduced decks and the probe model cards derive only
from those already-documented inputs. No new external fixture provenance is
introduced. Diagnostic maxstep/tolerance/node-seed variants are explicitly
separate from original-byte scores; they never update corpus receipts.
