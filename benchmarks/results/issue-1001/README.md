# Current-main MOS2 residuals: #1001 / #1019

Evidence only, based on `90584d8b` (full base/core-tree identity and host in
`receipt.json`). Refs #1001 and #1019; neither is closed. No production,
device, tolerance, pin, fixture or scoring edits. No performance claim.

The card's original premise has changed: #1031 fixed the original cram
OP-selection loss; #1021 fixed the original mosrect and ring startup losses.
Current remeasurement must not manufacture RED tests for those closed buckets.
One remaining real default-step loss is reduced and retained as a skipped
Vitest regression. The fine-step passing test is a diagnostic control, NOT a
production solution or permission to force this fixture's step size.

## Measurements

18 jobs, 18 distinct byte hashes. Every engine pair receives the SAME Buffer.
All complete inputs, signals and time grids are retained as `<name>.json.gz`.
The original input hashes are checked against corpus-k's manifest. Original and
reduced mosrect are different text hashes but the same topology, not independent
coverage. `receipt.json` retains all signal errors and unchanged shared scorer
outputs; `check.ts` recomputes every field from the captures.

Historical #996 diagnostic: linear interpolation of native onto TS timepoints,
uniform reference-peak floors 1e-4 V / 1e-10 A, unchanged 1% limit, no phase
alignment. RMS here is over the TS sample grid, not a time-weighted integral.
The canonical shared scorer is also retained separately (right-sided handling
at exactly shared corners). Do not mix these two columns or compare rounded
shared scores with unrounded historical scores.

| Case | Linear worst normalized | Shared worst normalized | TS / native points |
|---|---:|---:|---:|
| cram original TRAN | 0.00269509421215 | 0.00270 | 1122 / 1122 |
| cram plain OP | 1.82660621929e-6 | 1.83e-6 | 1 / 1 |
| cram fine (#996 retained variant) | 0.000134825417001 | 0.000135 | 8143 / 8143 |
| reduced four-MOS latch OP | 3.64150394215e-7 | 3.64e-7 | 1 / 1 |
| mosrect original | 0.000148216705908 | 0.000148 | 1008 / 1008 |
| mosrect OP | 4.99845670732e-6 | 5.00e-6 | 1 / 1 |
| mosrect fine | 0.0000441476584116 | 0.0000441 | 10005 / 10005 |
| mosrect reduced | 0.000148216705908 | 0.000148 | 1008 / 1008 |
| ring original | 0.000115757248630 | 0.000116 | 1010 / 1010 |
| ring OP | 4.03548356138e-9 | 4.04e-9 | 1 / 1 |
| ring fine | 0.0000490437445132 | 0.0000490 | 10005 / 10005 |
| ring five-stage reduction | 0.000261480543452 | 0.000261 | 1009 / 1009 |
| pump original | **0.222949988799** | **0.0630** | 867 / 868 |
| pump OP | 7.51803765932e-12 | 7.52e-12 | 1 / 1 |
| pump fine, 10 ps maxstep | 0.000317817178280 | 0.000318 | 10195 / 10195 |
| pump reduced (50 ns) | **0.0630049081540** | **0.0630** | 428 / 428 |
| reduced pump OP | 7.51803765932e-12 | 7.52e-12 | 1 / 1 |
| reduced pump fine, 10 ps maxstep | 0.000317817178280 | 0.000318 | 5095 / 5095 |

These are BEFORE numbers for future fix cards, not a before/after improvement
claim: this PR deliberately changes no simulator behavior. Cram's current
headline differs from the older #1031 transient receipt; the current worst is
`i(vprecharg)` at 400.015149771 ns (2.223827808 uA), still below 1%.

## Attribution and explicit limits

* Cram: historical OP-selection / inverse junction limiting, now matched.
  Plain OP and the four-transistor latch both match; current transient and fine
  controls also match. No currently demonstrated OP-selection or MOS2 equation
  loss remains on these inputs. Historical source localization is in
  `evidence/1001/README.md`; no new OP RED is appropriate.
* Mosrect: historical predictor/loaded-charge-history interaction with avoided
  Euler fallback, now matched. OP, reduced and fine controls all match. See
  `evidence/1002/CLOSURE.md`; it explicitly does not isolate direct charge-history
  benefit from avoided fallback. No additional production fix is justified.
* Ring: historical transient startup predictor/accepted-charge history, now
  matched. Original, OP, fine and former failing five-stage control all match.
  See `evidence/1003/README.md`. This is not a phase-aligned score.
* Pump: remaining **adaptive-step-sensitive charge/integration trajectory**
  bucket, with a separately observed **corner reconstruction artefact**. OP
  matches; original and reduced default-step runs fail; applying the same
  TSTEP/20 maxstep in BOTH engines reduces the error below 1%. This localizes
  the symptom but does not prove the scheduler is the root bug or exclude a
  near-zero-Vds channel/Meyer arithmetic difference amplified by LTE control.
  No MOS2 equation or limiting defect is established by this card.

The original pump's naive linear max is 69.142579474 uA at 60.2009596044 ns;
unchanged right-sided shared reconstruction instead reports 19.539446179 uA
at the approximately 45.024 ns window (unrounded normalized 0.0630048710928
in the previously verified receipt). The reduction ends at 50 ns so does not
include the later linear-corner maximum; it STILL loses 19.539446179 uA at
45.0237323018 ns under both metrics. Thus this is not merely a scoring artefact.
No scorer adjustment or tolerance loosening is proposed.

`localization.json` also compares each default run to the SAME native fine-step
reference. Original TS/default differs by 0.0393608663; native/default itself
differs by 0.0349096112. Reduced default values are 0.0329276635 (TS) and
0.0327539861 (native). These are diagnostic linear comparisons, not native
truth proofs: both coarse runs have several-percent current discretization
sensitivity. Fine/fine parity is not proof of identical forced accepted grids.

Fresh original pump native AND TS grids/samples are exactly equal to
`evidence/1019/experiments/baseline-waveforms.json.gz`. The relevant MOS2,
charge-state and transient-step files have zero diff from that baseline.
The checker verifies both facts; historical accepted-state diagnostics are
relevant, not presented as newly instrumented current traces:

* first common-time loaded Vgs drift >1 nV: 5.0185195890911405 ns;
  TS minus native -6.833099325809222e-7 V, qgb delta 4.517685251731772e-21 C;
* first indexed grid split >1 as, freshly recomputed: index 37,
  TS 5.027387875826269 ns, native 5.027387877402101 ns;
* both paths use order 1 / Euler (MAXORD=1), excluding method-order fallback;
* prior E1 bypass-off and E3 loaded-voltage-charge experiments leave the loss;
  E2 limiting/first-iterate candidates regress the mosamp2 guard;
* E4 relabeling one 15.2 ns breakpoint reduces only the early score, leaving
  the 45 ns loss. Those experiments remain negative evidence, not shipped fixes.

## Reduction and RED receipt

`pump-reduced.cir`: one active MOS2 transistor, two 50 fF grounded capacitors,
one PWL gate source, active NMOS model and MAXORD=1 retained. Removes unused
PMOS model/comments/print and final five cycles. At 50 ns it retains the same
45 ns absolute-error maximum. This is a topology-minimal useful MOS pump
reproducer, not proof that every model parameter or cycle is necessary.

`packages/core/src/analysis/pump-residual-1001.test.ts` contains the default
skipped RED and fine-step passing control. Exercised RED with ISSUE1001_RED=1:
exit 1, one failing test, expected 0.0630049081539719 <= 0.01. Normal targeted
run: exit 0, 9 passed / 1 skipped across four files. Fixed cram/ring/mosrect and
mosamp2 retain their existing passing regressions. No production change turns
RED green in this evidence-only PR.

## Audited native source

Pinned ngspice-47 object `a80f6e3e95d51534905b1f23410a951802666656`.
`source-receipt.json` records freshly fetched raw URLs, SHA-256 and line counts;
no C sources or binaries are distributed. Line references below are to that
exact object, not current upstream HEAD:

* `mos2load.c:194-213`: MODEINITPRED terminal prediction/limiting references;
  `:236,338-360`: raw Vbd and normal/inverse junction limiting (cram fix).
* `mos2load.c:1188-1191`: stores loaded terminal state;
  `:1200-1211`: DEVqmeyer uses loaded channel von/vdsat with mode-dependent
  capacitance ordering; `:1224-1232`: current/previous half caps + overlap;
  `:1250-1269`: predicted charge or capacitance-averaged charge increments;
  `:1304-1315`: charge companion integration/stamping.
* `mos2trun.c:24-26`: LTE checks qgs/qgd/qgb; `ckttrunc.c:33-53`:
  minimum device truncation bound with a 2x growth cap.
* `niinteg.c:25-30,77-78`: order-1 charge current and companion conductance.

These are the mechanisms for a next controlled investigation, not evidence
that a specific line needs changing.

## Bounded proposed follow-ups (supervisor routing, not implemented here)

1. Pump matched-bias channel/Meyer metadata investigation. Evidence scripts in
   `benchmarks/results/issue-1019-meyer/`; observation-only native mos2load.c
   wrapper; if proven, production scope ONLY `packages/core/src/devices/mos2.ts`
   plus focused MOS2 tests. Compare retained channel von/vdsat versus recomputed
   values and arithmetic at near-zero Vds; never clamp tiny Vds or tune a deck.
   This lane must coordinate with #1068's MOS junction owner. Acceptance: a
   one-variable trace divergence explanation, default reduced/original scores,
   mosamp2 5 uV guard, unchanged mosrect/ring and MAXORD RC guards. No speculative
   combined limiting/predictor/history changes.
2. PWL exact-corner scheduler/reconstruction investigation, separate from (1).
   Candidate scope `packages/core/src/analysis/breakpoint-queue.ts` and its tests,
   plus PWL breakpoint scheduling at
   `packages/core/src/devices/voltage-source.ts:246-292` and its tests (shared
   current-source consumer only if the same defect is proven there). Reproduce
   mathematically identical 15.2 ns labels and same-time
   source current left/right samples. Distinguish real source sampling from
   harness reconstruction before proposing anything. If only a metric issue is
   proven, scope the fix to `benchmarks/comparison-harness.ts` and its tests, not
   production. Must preserve the published 45 ns residual; no score-only closure.

## Reproduction / verification

From repository root:

    pnpm install --frozen-lockfile
    pnpm build
    spice-heavy pnpm exec tsx benchmarks/results/issue-1001/run.ts
    pnpm exec tsx benchmarks/results/issue-1001/check.ts
    ISSUE1001_RED=1 pnpm -C packages/core exec vitest run src/analysis/pump-residual-1001.test.ts
    pnpm -C packages/core exec vitest run src/analysis/pump-residual-1001.test.ts src/analysis/latch-op-selection-1001.test.ts src/analysis/transient-ring-startup-1003.test.ts src/classic-mos-convergence.test.ts
    pnpm lint

Install/build/18-job run/check/targeted/lint exit 0. RED exits 1 as intended.
Only targeted tests locally; full required exact-head GitHub CI is the final
full-suite gate, recorded in the PR/card handoff. An initial foreground queued
heavy run hit the tool's 420 s timeout before executing; the subsequent tracked
background spice-heavy run completed exit 0. No heavy bypass was used.

Sources/licences: Xyce_Regression revision 7bb7e98f, GPL-3.0-or-later, corpus-k
retained README/full licence and `benchmarks/SOURCES.md`. Existing #996 reductions
are reused, not imported anew. Scripts/tests are project MIT; capture input text
and reduced deck retain upstream GPL provenance. No issue closure, merge, npm
publish, changeset, pin, aggregate refresh or speed claim is included.
