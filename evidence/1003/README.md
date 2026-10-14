# MOS2 ring startup prediction (#1003)

Production fix, not phase-aligned scoring. Baseline is main
`e119f478428f15e34d5cd3d447607395a56ca6f8`. The branch then
normally merged main `3c046c829d82a9c2213bbe94b11df0cddeabc472`; targeted
original-input scores are unchanged after that merge. No DC/OP code, fixture
bytes, tolerances, maximum steps or comparison rules are changed.

## Identical-input measurements

Both engines use the original netlists and the unchanged 1% reference-peak
rule, with uniform voltage/current floors. All common signals and raw samples
are retained in `runs/`, including negative reduction controls. No runtime or
speed superiority claim is made.

| Circuit | Baseline worst normalized error | Fixed | Result |
| --- | ---: | ---: | --- |
| Original 17-stage ring, k-15 | 0.32446133275386674 | 0.00011575688740904232 | loss to match |
| Reduced 15-stage ring | 0.3766208496667187 | 0.00013604365720627104 | loss to match |
| 11-stage control | 0.0007180260226745825 | 0.00039391822362548965 | match remains match |
| 7-stage control | 0.00025895331382644695 | 0.00019884879255243918 | match remains match |
| Original mosrect, k-10 | 0.015832540193349596 | 0.00014821704250817352 | loss to match |

The original ring's mean ngspice-minus-spice-ts rising v(6)=1.5 V crossing offset
(after 20 ns, seven crossings) changes from 94.89508726225692 ps to
-0.0007915482024642431 ps. Its raw v(6) maximum voltage error changes from
1.0137233926069993 V to 0.0002591493246513754 V. These are measured diagnostics,
not shifts applied to either waveform. The fixed worst signal is v(7), not v(6).
`summary.json` contains every signal, first violation, crossings and periods.

The unchanged mosamp2 guard also passes: final v(5)=9.463972504056203 V,
2.7059437961440835 uV from its existing ngspice-47 default-step reference,
below the unchanged 5 uV limit. `related.json` retains every mosrect/ring score.
The predictor and last-loaded state must be consistent; a predictor-only
candidate failed this guard during development and was not shipped alone.

## Reduction and divergent operation

`ring-15.cir` retains the original models, geometry, .ic alternating pattern,
last-stage 0.1 pF capacitor and .tran .1ns 100ns. It removes two inverter stages.
At 2.9137595669413963 ns, its first violation is still v(13), with 0.0555901433373 V
absolute error, like the original ring's v(13) violation at 2.9137595656308023 ns.
Seven/eleven-stage controls do not retain it. The earlier three/five/nine/thirteen
controls remain in `evidence/996`; the five-stage supply-current failure was
not the same signature. Fifteen is the smallest tested reproducer of this
startup symptom, not a proof of global minimality.

The baseline MOS2 `stamp` at `mos2.ts:931-937` reads the preceding node solution.
It has no `beginTransientNewton` hook, so `transient-step.ts:104-107` cannot
apply MODEINITPRED to it. ngspice-47 `mos2load.c:194-213` instead extrapolates
vgs/vds/vbs from state1/state2, restores state0 limiting references from state1,
and `mos2load.c:1250-1260` independently extrapolates Meyer qgs/qgd/qgb.
The corrected hook is `mos2.ts:947-985`, with charge prediction in
`stampTransientCharge` and `charge-state.ts:93-97`. Acceptance retains the
last-loaded q, voltage and C together instead of re-evaluating them after
NIiter has solved and returned. Retries replace trial state; truncation does
not advance accepted predictor history; reset clears both histories.

`before-trace.json.gz`, `after-trace.json.gz`, `native-trace.json.gz` and
`localization.json` retain the first approximately 3 ns. In the original
first-violation window, mn11's first loaded [vgs,vds,vbs] is:

| Engine | First loaded terminals (V) | Newton iterations |
| --- | --- | ---: |
| Baseline | [1.576236057, -0.135299539, 0.006709824] | 13 |
| Fixed | [0.574123190, -0.210256436, 0.008637037] | 38 |
| Native ngspice-47 | [0.574125806, -0.210256465, 0.008637027] | 38 |

Both fixed/native use a 100 ps, order-2 step there. The native trace is at
2.9137791651028845 ns, the fixed trace at 2.9137792424345007 ns; this is not a
forced common grid. The baseline converges on the different near-zero-drain
trajectory, while the predicted load retains the native negative-drain branch.
The missing prediction is visible already at the second 2 ps timepoint,
retained separately in `localization.json`, before the 1% voltage violation.

External .ic values still agree at t=0. The first two steps are 1 ps and order 1,
then 2 ps and order 2, in both engines. There are no independent-source
breakpoints before the stop in this constant-VDD deck. This is non-UIC startup,
not a new UIC implementation. Native uses four Newton iterations at the first
point versus three in spice-ts. Initial hidden states and floating-point values
are not claimed bitwise identical, nor is the second timepoint claimed the first
absolute floating-point difference. No stopping tolerance was loosened.

The instrumented native build contains fprintf observation only. Its full
1010-point waveform is exactly equal on all 19 common signals to the retained
#996 ngspice-47 reference. This verifies the native build's relevance rather
than assuming configure flags are equivalent.

## Reproduction

From the repository root, after pnpm install --frozen-lockfile:

    pnpm build
    spice-heavy pnpm exec tsx evidence/1003/measure.ts after
    pnpm exec tsx evidence/1003/related.ts
    pnpm exec tsx evidence/1003/trace.ts after
    python3 evidence/1003/check.py
    pnpm lint
    spice-heavy pnpm test

For baseline measurements, use a clean checkout at the exact `base` in
`runs/baseline-17.json.gz`, copy the evidence generator there, build it, and run
`measure.ts baseline` plus `trace.ts before`. A baseline source snapshot in the
ignored .run directory was used for the retained RED logs, not the fixed source.

Native source build (Darwin arm64, libomp from Homebrew):

    mkdir -p evidence/1003/.run
    tar -xzf ngspice-47.tar.gz -C evidence/1003/.run
    python3 evidence/1003/instrument-native.py evidence/1003/.run/ngspice-47
    cd evidence/1003/.run/ngspice-47
    ./configure --enable-xspice --enable-cider --disable-debug --without-x --with-readline=no CPPFLAGS=-I/opt/homebrew/opt/libomp/include LDFLAGS='-L/opt/homebrew/opt/libomp/lib -lomp'
    spice-heavy make -j2
    cd ../../../..
    SPICE_ASCIIRAWFILE=1 evidence/1003/.run/ngspice-47/src/ngspice -n -b -r evidence/1003/.run/native.raw evidence/996/repro/ring.cir > evidence/1003/.run/native.stdout.txt 2> evidence/1003/.run/native.stderr.txt
    python3 evidence/1003/summarize-native.py

Put -lomp in configure's LDFLAGS, not a global make override. An initial global
override removed the code-model bundle flags and failed; the corrected full
build and native verification succeeded. No source equations were changed.

## Verification and publication gate

Baseline RED reports the exact original ring/mosrect losses. Final focused
nine-file run passes 91 tests. Final guarded full suite before merging the later
main additions exits 0; logs are retained. Build, lint, core typecheck, native
reference verification, and offline checks pass. After normally merging main,
focused ring/mosrect/predictor/history/mosamp2 tests and original scores still pass.

PR1021 initially has a required CI build failure in the unrelated EKV retained
series metadata check on newer main, also present in main CI. That baseline repair
is routed separately as #1022. This branch does not edit EKV files. Required CI
must be green on the final exact SHA, followed by independent spice-ts-review,
before supervisor merge. Neither issue is claimed closed while that gate is red.

## Provenance

Original ring SHA-256: 42c2b03804914eeadade29b6bbaea94d9bae575a2eba165e3a8d4a806ae23475.
Source: Xyce_Regression 7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2,
Netlists/CircuitSim90/MOS2/ring.cir, GPL-3.0-or-later under its retained README grant.
The reduced deck derives only from that input. Original corpus-k provenance,
notices and full licence are already in benchmarks/SOURCES.md and corpus-k's
manifest/licence directory; no new external circuit source is introduced.
Synthetic device tests are original MIT project work.

ngspice source: https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/47/ngspice-47.tar.gz
SHA-256: 894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f.
Component licences are in ngspice COPYING, retained under corpus-k/licenses/ngspice.
No C sources or binaries are committed. Environment: Darwin arm64,
Node v22.23.1, pnpm 10.28.1, ngspice-47. No performance claim.
