# Floating diode OP recovery experiments

Refs #917. Evidence-only partial work after CKTgmin PR #1074 landed.
The requested simulator fix is NOT implemented. Both vendor execution losses
remain. Production `analysis/dc.ts` is byte-identical to main `fd22b16a`.
No tolerance, fixture, model, solver, corpus outcome or aggregate is changed.

## Results

Measured on macOS with Node/ngspice versions retained in each receipt.
Input preparation and pins are unchanged from
[the prior diagnosis](../ticket795-singular-917/README.md).
The native runs use the identical `.OP` deck bytes and include hashes.

| Input | Baseline factor attempts | Schedule candidate | Schedule + driver OPtran candidate | ngspice-47 default |
| --- | ---: | ---: | ---: | --- |
| base_37.local.cir | 173, singular pivot10 | 203, same failure | 1903, same reported failure | exit0, one finite OP row, source stepping |
| variant_37.local.cir | 173, singular pivot10 | 203, same failure | 1903, same reported failure | exit1, source stepping/OPtran fail |
| MIT floating-diode.cir | 40, singular pivot1 | 40, same failure | 148, succeeds | exit0, OPtran |

These are factor-attempt counts, not timing comparisons. All max/RMS parity
metrics remain null because neither vendor candidate produces an OP solution.
Variant is a shared execution failure, NOT proof of matching error semantics.
The production variant still reports `SingularMatrixError`, not a recovered
structured nonlinear convergence failure. This acceptance criterion is unmet.

`check.py` verifies all three stages, input/include identity, all native controls,
factor counts and the instrumented retry trace. Both default and LTPS native
base runs succeed; disabling OPtran also succeeds on base. The minimal deck
requires OPtran natively. Its success cannot establish vendor base recovery.

## RED first, then experimental GREEN, no shipped GREEN

Commit `51461c70` contains an unmarked failing Vitest regression using a
self-written diode/capacitor reduction. It fails at pivot1 `k` on the baseline.
The test checks supply=1 V and a=k=0 V to 12 decimal places, consistent with
native values approximately +/-1.46e-75 V. It is not a vendor parity test.

The final evidence-only test is marked `it.fails` by default. To run the real
RED (one failure, not skipped or silently rewritten):

    EXPECT_FLOATING_DIODE_SUCCESS=1 pnpm -C packages/core exec vitest run src/analysis/dc-floating-diode-917.test.ts

The unrestricted driver candidate makes this unmasked test pass. Restoring
production restores the RED. The expected-failure marker is explicit debt,
not a claim that the production recovery works. No existing test is weakened.

## Candidate A: source schedule only

`source-candidate.patch` resets the solution and calls existing device reset
hooks; attempts sourceScale=0; bootstraps the zero-source solution using eleven
diagonal levels from nominal junction gmin times 1e10 down to nominal; and
attempts the native adaptive source-scale schedule beginning at 0.001.
It uses the native homotopy iteration ceiling already in dc.ts.

On both originals, all eleven shunted zero-source solves succeed. Removing
the diagonal shunt for scale=0.001 immediately restores pivot10's singularity.
The subsequent scale=0 retry is singular too. No positive source scale is
accepted. `trace.jsonl` binds these statements to actual calls.

This is NOT a complete faithful Gillespie implementation. Existing reset hooks
are not a proven mapping of every model's CKTstate0, and the candidate does not
snapshot/restore all device-local Newton states on source-step rejection.
Its rejection proves that changing the source schedule alone is insufficient
in this engine. It does not disprove full ngspice-state/reordering parity.
No permanent shunt or guessed gauge is introduced.

## Candidate B: reuse the transient driver as a final fallback

`optran-candidate.patch` includes Candidate A plus a bounded driver call using
its failed-source solution, 100 ns maximum steps, 10 us horizon and a 10000
advance ceiling. This is an experiment, not admitted production behavior.

Both originals fail before accepting any transient timepoint:

- 17 Newton retries, 1700 Newton iterations, zero LTE retries;
- t=0, final attempted dt=1.4901161193847657e-16 s;
- driver error `TimestepTooSmallError`, kind `dt-floor`;
- the outer existing DC path rethrows its original pivot10 singular error.

The MIT reduction reaches 10 us in 107 accepted steps, 108 Newton iterations,
zero rejected steps. This isolates why a minimal GREEN would give false
confidence about vendor acceptance. The candidate does NOT implement the full
ngspice MODEINITTRAN/device-state transfer. It does not justify enabling the
existing driver for arbitrary failed nonlinear operating points.

## Remaining scope / supervisor decision

The original card's acceptance criteria are not met. No `Fixes` linkage is
appropriate. Do not merge this as a simulator fix or close #917.

Before another general implementation attempt, isolate native versus TS
junction/hidden-state and matrix-reordering behavior at the first unshunted
source step. A faithful device-state checkpoint/restore contract and native
MODEINITTRAN transfer are larger seams than the schedule edit tested here.
Separately localize the first failed vendor transient Newton iterate before
broadening OPtran admission. Do not change MOS3 or performance files in this
lane or add a residual diagonal shunt merely to manufacture convergence.

## Reproduction

Prerequisites: install frozen dependencies; fetch/extract #795 as documented
in the prior diagnosis. The original probe verifies historical deck/include
pins, executes the unchanged originals and restores its instrumentation.
The source-reference clone is optional and stays ignored under `.native/`.

Run one stage at a time, in an isolated worktree with no concurrent tests:

    spice-heavy python3 benchmarks/floating-island-recovery-917/run.py baseline
    spice-heavy python3 benchmarks/floating-island-recovery-917/run.py source
    spice-heavy python3 benchmarks/floating-island-recovery-917/run.py optran
    python3 benchmarks/floating-island-recovery-917/check.py

The runner refuses a changed dc.ts hash, checks patch applicability, executes
the unmasked test and existing native probe, and restores dc.ts in finally.
Expected test exits are 1/1/0 for baseline/source/optran; probe exits are all0
because failed simulations are retained as data. No automatic tolerance tuning.
Each stage's actual exit receipts/logs are under ignored `.runs/<stage>/`.
Committed receipts and trace are the measured outcomes, not synthesized data.

## Sources and licences

The test, scripts and experimental TypeScript patches are self-written MIT
project work. The vendor attachment remains fetch-only and is not redistributed.
[benchmarks/SOURCES.md](../SOURCES.md) records its URL and archive hash.
All seven resolved includes retain their recorded hashes across stages.

Behavioral reference: ngspice-47 revision
`a80f6e3e95d51534905b1f23410a951802666656` at
https://git.code.sf.net/p/ngspice/ngspice, modified BSD licence.
No native C implementation is copied.

- `src/spicelib/analysis/cktop.c:481-656` describes the zero-source bootstrap,
  adaptive source increments, node/state rollback and final gmin assignments.
- `src/maths/ni/niiter.c:107-157,197-207` distinguishes reorder and refactor,
  including the SPARSE failure path's restamp before reorder.
- `src/spicelib/analysis/optran.c:327-343,405-419` initializes transient OP
  and transfers state0 to state1. Generic zero-seeding is not that contract.

Local build/lint/full-suite and exact-head CI receipts are recorded on the PR
and Kanban handoff. None converts these experimental failures into a fix.
