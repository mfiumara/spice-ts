# #1002 closure after the #1003 production correction

This is an evidence-only follow-up. No simulator, tolerance, fixture, aggregate
report, integration fallback policy or release change is introduced here.
The prior rejected patch is retained unapplied. The required fix already landed
in #1021, squash `1e4bd5f1afd62967c0371f50dc6258b6e26dabdc`.

## Measured before / after

Fresh replay of pre-ring `a521e9e221f4445639d899265589e5893a07e165` versus
current main `169d683d89b77c8ccb5a9459bc3888c4ec0aba62`:

| Original input | Before | After | Unchanged bound |
| --- | ---: | ---: | ---: |
| mosrect k-10 worst normalized | 0.015832540193349596 | 0.00014821670590837676 | 0.01 |
| ring k-15 worst normalized | 0.32446133275386674 | 0.00011575725676808068 | 0.01 |
| mosamp2 final v(5) absolute error, V | 0.000002981138859325938 | 0.000002705943744629735 | 0.000005 |

mosrect and ring use every original common signal (10 and 19), linear
interpolation, reference-peak normalization, uniform 1e-4 V / 1e-10 A floors,
and no phase alignment. The score is the maximum over signals and samples,
not an RMS metric or an aggregate refresh. Full per-signal scores and point
counts are in `closure-before.json` / `closure-after.json`.

mosamp2 uses the existing default-step endpoint guard and rounded reference
9.46397521 V, not a refined-step or OP substitute. Before/after v(5) values:
9.46397222886114 / 9.463972504056255 V; 2455 / 2429 points. A fresh ngspice-47
run of the unchanged input produces 2429 points and final v(5)
9.463975209059157 V (rounding difference 0.940842071 nV).

`closure-native.ts` reruns the identical original mosrect/ring decks through
the existing native adapter. All 1008/1010 points and 10/19 common signals
reproduce the retained ngspice-47 goldens with exactly zero time/value delta.
All input hashes are retained in `closure-native.json`. Sources/licences remain
in `benchmarks/SOURCES.md` (#996 corpus-k Xyce_Regression GPL-3.0-or-later;
classic mosamp2 Berkeley SPICE3 provenance). No new external input is added.
Environment: Darwin arm64, Node 22.23.1, pnpm 10.28.1, ngspice-47.

## Why no additional production patch

#1021's `MOS2.beginTransientNewton` reproduces the accepted intrinsic-terminal
predictor; the first transient load uses predicted q and biases. Subsequent
loads use the current Newton solution. `stampTransientCharge` retains the
loaded q, voltage and capacitance together; `acceptCharges` rotates that state
rather than re-evaluating it at the final solved voltage. Predictor history,
truncation trial isolation and accepted-charge history are already covered by
`mos2-predictor-1003.test.ts` and `mos2-charge-history-1003.test.ts`.
See `evidence/1003/README.md` for the ngspice source localization.

This completes the interaction missing from the historical history-only patch.
That earlier candidate's mosamp2 error remains published at 10.2944903038 uV,
above 5 uV; no historical receipt is replaced or retrospectively accepted.

The integration-method confound is still explicitly recorded, not erased:
pre-ring mosrect falls permanently from trapezoidal to Euler at failed trial
438.28000000000374 ns. Current code has no such fallback for this deck. At
482.28 ns before/after use Euler/order 1 versus trapezoidal/order 2, both with
three iterations and the same accepted grid (1007 steps). Therefore these
waveform differences are not claimed to isolate the direct history effect
from avoided retry/fallback. No fallback-policy change is needed to meet the
card's original-input requirements. The observation wrapper's `loadedCharge`
is a recomputation, not authoritative predictor-state instrumentation; the
closure checker relies on actual accepted method/order/fallback observations
and public waveform scores, not that recomputed field.

## Reproduce

From the repository root:

    pnpm install --frozen-lockfile
    spice-heavy pnpm exec tsx evidence/1002/run.ts closure-after
    spice-heavy pnpm exec tsx evidence/1002/mosamp.ts closure-after
    spice-heavy pnpm exec tsx evidence/1002/closure-native.ts
    python3 evidence/1002/closure-check.py

For the historical source replay (isolated below the ignored `.run`):

    mkdir -p evidence/1002/.run/pre-ring
    git archive a521e9e221f4445639d899265589e5893a07e165 | tar -x -C evidence/1002/.run/pre-ring
    ln -s "$PWD/node_modules" evidence/1002/.run/pre-ring/node_modules
    ln -s "$PWD/packages/core/node_modules" evidence/1002/.run/pre-ring/packages/core/node_modules
    mkdir -p evidence/1002/.run/pre-ring/evidence/1002
    cp evidence/1002/run.ts evidence/1002/mosamp.ts evidence/1002/.run/pre-ring/evidence/1002/
    spice-heavy pnpm exec tsx evidence/1002/.run/pre-ring/evidence/1002/run.ts closure-before
    spice-heavy pnpm exec tsx evidence/1002/.run/pre-ring/evidence/1002/mosamp.ts closure-before

Scripts resolve simulator imports from the archive while reading identical
inputs and writing receipts relative to the outer root. No checkout/reset of
the implementation worktree is required.

RED was exercised by copying current
`packages/core/src/analysis/transient-ring-startup-1003.test.ts` into that
archive's corresponding directory and running:

    pnpm -C evidence/1002/.run/pre-ring/packages/core exec vitest run src/analysis/transient-ring-startup-1003.test.ts

Both original mosrect and ring tests fail with the exact before scores above.
This is a historical RED replay of existing upstream tests, not a new
production patch authored in this card.

GREEN on current source: 21 tests pass across six files:

    pnpm -C packages/core exec vitest run src/analysis/transient-ring-startup-1003.test.ts src/devices/mos2-charge-history-1003.test.ts src/devices/mos2-predictor-1003.test.ts src/classic-mos-convergence.test.ts src/analysis/transient-charge-lte.test.ts src/analysis/transient-order-control-742.test.ts

`pnpm build && pnpm lint` passes. Full-suite and required exact-head CI receipts
are recorded in the PR/card handoff. Independent review is mandatory before
merge. No speed claim, superiority claim, merge or release is performed.
