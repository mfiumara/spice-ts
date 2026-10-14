# #974: three-engine transient triage

## Outcome

No spice-ts core defect established. No core change, RED regression, tolerance change,
benchmark-default change, or fix card is justified by these measurements. #974 remains
open for independent exact-head review and supervisor disposition.

- **Jimi fuzz: comparison-pipeline artefact (translation)**. Identical bytes do not
  establish identical semantics: Xyce 7.10 silently treats this deck's `sine(...)`
  source as DC zero. Its documented capacitor `IC=` semantics also differ from
  ngspice without UIC. The large peak is specifically the startup IC discrepancy;
  the sustained input-waveform discrepancy is the unsupported SINE spelling.
  Thus this receipt is not a valid model/integration parity score. The IC component
  is an explained reference disagreement, not a parser interpolation problem.
- **LC oscillator: reference disagreement (explained)**. This is a *linear* LC
  circuit, not nonlinear. Default integration step selection produces cumulative
  phase error. ngspice and spice-ts use steps up to 0.5 s, Xyce up to 0.04608 s.
  Agreement with ngspice on this coarse run is not agreement with the analytic
  solution. Common small maxsteps collapse the disagreement in all three engines.

All numerical figures below are fresh runs against core base
`c4858434e58fedeeedab142f2479252e0a59e851`, ngspice-47, XyceNF 7.10.0,
Node 22.23.1. Runtime fields are single-run wall times, include exports/startup,
and are **not** performance comparisons. Hardware/OS are in report.json.

## Exact baseline inputs

The saved single-TRAN projections, not reconstructed original decks, were executed.
run.ts verifies each shared and Xyce input against **both** mutual-948/report.json
and hash-manifest.json. Regenerated Xyce export-only decks are byte-equal to the
saved decks. ngspice uses argv `-r output.raw` and local ASCII filetype; spice-ts
receives the shared bytes verbatim. Neither mutual-948 nor any benchmark ledger
was changed.

| Fixture | Shared SHA256 | Xyce export-deck SHA256 |
| --- | --- | --- |
| ngspice/jimi-fuzz | fc23c8e82e791dd0268d8e28086b60f9e470a20b3d774eb4b608a68b4e9d0f99 | 3184f4acfcd175b90b46e6b929f97d67c27e9009322b55855b1f5ff022d03372 |
| corpus-e/lc-oscillator-transient | 59183b63dbfac31926743af5f11400f8cdad60be4b85878f0bf6e7dd99102ffd | 633b664ef94d6cdf258719b9b345ebd2ddb9b587fda26f0574d6ff50984dd1c3 |

## Baseline three-way metrics

Rows are target minus reference, aligned on the **target native grid** by the
existing harness's linear interpolation. Relative errors use the reference
magnitude and exclude exactly zero references. They are ratios, not percentages.
report.json contains every exported signal, both grid directions, point counts,
zero-reference exclusions, absolute/relative max and RMS. These are measurements,
not newly selected acceptance thresholds. Very large relative peaks at zero
crossings are uninformative on their own.

| Fixture/signal | Target vs reference | Max abs (V) | RMS abs (V) | Max rel | RMS rel |
| --- | --- | ---: | ---: | ---: | ---: |
| Jimi v(3) | ngspice vs Xyce | 8.708512476 | 0.220615643 | 2.086082405e14 | 1.918603726e12 |
| Jimi v(3) | spice-ts vs ngspice | 0.086692018 | 0.006335613 | 1062.476326 | 3.593968 |
| Jimi v(3) | spice-ts vs Xyce | 8.708512476 | 0.220613437 | 2.068324189e14 | 1.782146084e12 |
| LC v(1) | ngspice vs Xyce | 8.202397759 | 3.490559288 | 420.733782 | 30.502424 |
| LC v(1) | spice-ts vs ngspice | 3.496306356e-9 | 2.354182736e-9 | 2.065073015e-7 | 1.839243775e-8 |
| LC v(1) | spice-ts vs Xyce | 8.202397756 | 3.490559288 | 420.733237 | 30.502388 |

## Jimi isolation

No `.IC` node statement or UIC exists in the baseline. Three capacitor cards
have `IC=0` (including C_C4 between nodes 4 and 3).

1. Baseline Xyce v(10) is **zero at every exported timepoint**, while ngspice and
   spice-ts reach +/-0.3 V. Changing only `sine(` to `sin(` restores the Xyce
   waveform. Neither ngspice nor spice-ts waveform changes. No Xyce warning
   identifies the ignored waveform, so successful export alone was insufficient.
2. That spelling change leaves the 8.708512476 V startup peak unchanged. Baseline
   t=0 v(3) is 0 V in ngspice/spice-ts and 8.708512476 V in Xyce. Standalone `.op`
   with the same devices reproduces these values. This is not grid interpolation.
3. Removing only device `IC=0` eliminates the Xyce startup offset (v(3) begins
   at 1.4958e-28 V), but leaves the SINE/DC-zero error. ngspice and spice-ts
   baseline waveforms are unchanged by the removed IC parameters.
4. Removing device IC **and** using SIN yields ngspice-vs-Xyce v(3) max/RMS
   0.093378678 / 0.001059861 V. OP without device IC yields maximum difference
   across exported signals 3.288336340e-5 (mixed voltage/current units; see each
   signal in JSON). This bounds, but does not prove the cause of, remaining
   model/default numerical differences. No BJT model bug is established.
5. Reducing the common maxstep from 20.833333 us to 5 us on that diagnostic deck
   gives ngspice-vs-Xyce v(3) max/RMS 0.006723051 / 0.000365102 V and
   spice-ts-vs-ngspice 0.014284184 / 0.000312654 V. Remaining baseline spice-ts
   loss is reported, not hidden; step refinement materially reduces it.
6. A UIC-only diagnostic is retained. ngspice/spice-ts first exports are at
   nonzero time, Xyce also exports a zero-time state; reverse-grid metrics show
   why first-state interpolation can exaggerate a UIC startup mismatch. UIC
   does not repair the missing SINE waveform.
7. Tight trap/RELTOL diagnostic: ngspice succeeds (1,317,899 points), Xyce reaches
   the 120 s timeout. It remains `failed/execution`, convergence `unknown`, **not**
   a nonconvergence/parity loss inferred from a timeout. The surrounding terminal
   later reached its 420 s tool limit while attempting a further unsaved gear
   experiment; no result from that unsaved experiment is claimed or retained.

The common-method diagnostic controls are reference-only: the ngspice options
and Xyce TIMEINT options are engine-specific and saved separately. spice-ts in
these rows deliberately remains the shared-deck default, not a claimed common
method/tolerance run. All engines do share any maxstep in the shared `.tran`.

## LC isolation and analytic cross-check

No nonlinear devices, model cards, `.IC`, or device IC are present. Default OP
is v(1)=0, i(L1)=-5 A in **all three** engines. Adding UIC with the small common
maxstep changes the oscillation amplitude from about 5 V to about 0.25 V in all
three: skipping the pre-TRAN OP is a different experiment, not a parity repair.

For C=L=1, KCL is v' + iL = -iSource and iL'=v. With the DCOP initial state,
the exact solution is:

- 0 <= t <= 0.1: v(t) = 50 (1 - cos(t)).
- t > 0.1: v(t) = 50 (cos(t - 0.1) - cos(t)).

`grid.ts` independently checks this solution, both native grids and a fixed
0.005 s / 20,001-point grid. A native-grid analytic comparison interpolates that
fine analytic grid (not a claim of symbolic evaluation at every native point).

| Common maxstep | ngspice-Xyce max abs on ngspice grid | RMS abs | Fixed-grid max abs | ngspice analytic max abs | Xyce analytic max abs |
| --- | ---: | ---: | ---: | ---: | ---: |
| omitted/default | 8.202397759 | 3.490559288 | 8.203239682 | 8.259698609 | 0.086002799 |
| 0.01 s | 0.000625631 | 0.000025295 | 0.000455549 | 0.004031127 | 0.004024895 |
| 0.005 s | 0.000176045 | 0.000019023 | 0.000137137 | 0.001007689 | 0.000982785 |

Baseline last positive-going crossings are 96.216440232 s in ngspice versus
94.314432264 s in Xyce. At maxstep 0.01 they are 94.298559851 versus 94.298558632 s.
The discrepancy survives reversal of interpolation direction and the uniform-grid
comparison: it is phase in native solutions, not a projection/export/grid artefact.
Halving the common step approximately quarters analytic error, consistent with
second-order integration. spice-ts tracks ngspice, including its coarse-grid phase
loss; none of this establishes a spice-ts-only defect or universal superiority.

Additional reference diagnostics with maxstep 0.01 and RELTOL 1e-6:
- trap: ngspice `METHOD=trap TRTOL=1`, Xyce `TIMEINT METHOD=7`: max/RMS
  ngspice-vs-Xyce 0.003972742 / 0.001647366 V.
- gear: ngspice `METHOD=gear TRTOL=1`, Xyce `TIMEINT METHOD=8`: max/RMS
  0.002364380 / 0.000980435 V.
- A mistaken Xyce `METHOD=2` attempt is retained as `failed/execution`
  (`Invalid integration method 2`), not convergence failure. Correct method 8
  was run separately; no failed receipt was overwritten.

TRTOL has no asserted identical Xyce counterpart here. Trap/gear and RELTOL
controls are diagnostic only; these solver controls are not fully equivalent.

## Semantic documentation

Xyce Reference Guide 7.9 (documentation context; actual execution is 7.10.0):
https://xyce.sandia.gov/files/xyce/Xyce_Reference_Guide_7.9.pdf

- Capacitors, p.189: `IC` is never ignored, unlike SPICE3F5 which respects it only
  with UIC. For DCOP it inserts a voltage source to force the capacitor voltage.
  That explains C_C4 forcing v(3)=v(4), plus the other startup constraints.
- Independent sources, pp.221-229: documented sinusoid spelling is `SIN`, not
  `SINE`. The one-token diagnostic demonstrates actual 7.10 behavior here.
- TIMEINT options, table 2-7: trap/7, gear/8; default variable-order trapezoid,
  RELTOL 1e-3. Controls use those documented selectors.

These observations do not license changing upstream benchmark inputs. Original
sources/licences already reside in benchmarks/SOURCES.md. Only derivative decks
and investigation evidence for these two licensed fixtures are added here.
The reference adapter's semantic acceptance policy is outside this card: the
review/supervisor should route the silent SINE and IC incompatibility findings
without this investigation editing the adapter or mutual-948 receipts.

## Reproduction and verification

From the repo root (XYCE_BIN is an executable path, not a credential):

    pnpm install --frozen-lockfile
    pnpm -C packages/core build
    XYCE_BIN=/path/to/Xyce spice-heavy pnpm exec tsx benchmarks/reference/investigations/974/run.ts
    XYCE_BIN=/path/to/Xyce spice-heavy pnpm exec tsx benchmarks/reference/investigations/974/grid.ts
    pnpm exec tsx --test benchmarks/reference/investigations/974/receipt.test.ts
    pnpm build
    pnpm lint
    spice-heavy pnpm test

`run.ts --resume` skips completed key/variant receipts; use a fresh run without
--resume for independent verification. Small summaries/metrics and logs are
retained, not full multi-megabyte native waveform exports. The offline test
checks all 16 distinct retained experiments, baseline bytes, failure retention,
per-signal coverage, and the isolation/analytic evidence. It is not a RED core
regression test. New investigation tests are explicitly invoked locally; the
existing CI workflow was not broadened by this card.

Local build and lint passed; offline checks passed 4/4. Full-suite status and
exact-head required CI are recorded in the Kanban handoff/PR once available.
No speed or benchmark-baseline improvement is claimed: before/after figures
above are controlled experiments, not changed simulator or benchmark defaults.
