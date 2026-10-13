# Issue #938: sampled row activation versus dense arithmetic

Diagnosis only. No production source changed; zero optimization candidates
were tested or shipped. No speedup or fresh ngspice parity claim.

## Decision

The fixed experiment is complete, but timing reproducibility and a trustworthy
probe-overhead calibration were not established. Stop before a candidate.
At mesh50k, dense-range V8 position ticks exceed checked-range ticks in every
cold and warm pass. This is useful lower-intrusion attribution, not proof of
native arithmetic self-time. The checked range mixes first-touch activation,
indexing and arithmetic. The dense range includes its branch and indexing.
Line attribution cannot isolate the cost of activation alone or distinguish
register pressure from arithmetic. No pointer/unroll/capacity rewrite is justified.

Next bottleneck to investigate is dense-range execution, only after suspend-safe
elapsed bounds and reproducible unprofiled controls are available. These are
remaining scope for the supervisor, not additional experiments in this card.

## Immutable provenance

Baseline a58cfe6c2edb7ac5a408a07f77575b0c181b226f was pinned before archive/build.
prepare.py archives this literal SHA, never a mutable remote ref. All frozen
core source bytes match the local control; build.json records each source hash.
The two bundles differ only in esbuild path comments. Sampling uses the SAME
baseline bundle as the isolated unprofiled children, without inner-loop probes.
The original preparation failed on a generated anchor lookup before any timing
children; prepare.log retains that failure. prepare-repair.log records successful
preparation with corrected anchors before measurement. No raw receipt was erased.
Generated source copies and bundles are ignored, reproducible via prepare.py.

The unchanged MIT project-authored scaling-m2-fixture.mjs generator and existing
issue-919/profiles captured matrices have central provenance in SOURCES.md.
No new source/netlist is introduced; SOURCES.md is untouched. host.json records
capture hashes. Completed simulations record identical generated deck hashes.
Mesh requested 1k/10k/50k has actual 1024/10000/50176 nodes. RC/CMOS actual counts
are retained in phase records. Existing issue-907/issue-919 ngspice references
are HISTORICAL, not fresh identical-netlist timing or parity evidence. Historical
CMOS discrepancies and ngspice50k timeouts are not fixed by this work.

## Method

One fixed 72-child matrix, 18 isolated and 54 simulation children, three repeats,
alternating variant order. Every child has cold then warm phases. Isolation
constructs and analyzes a FRESH solver before each measured factorization;
'warm' means process/JIT warm, not retained factors/capacity or pivot reuse.
End-to-end controls compare baseline to source-identical local control, not a
candidate. Full simulate timings exclude import and output hashing. All outputs
including DC voltages/currents, complete transient time/voltage/current vectors,
vector/value counts and convergence are digested, not selected probes.

Sampling uses node:inspector Profiler at requested 500us interval around factorize.
Full compressed V8 profiles are retained. Generated executable-anchor line ranges
are in build.json. positionTicks and hitCount are counts, NOT time in ms. Do not
multiply them by 500us to infer self-time: V8 scheduling, JIT/inlining and sampling
skid affect attribution. Some applySupernode ticks map outside the named ranges
(inlined helpers/prologue); raw line ticks are retained rather than reassigned.
Small circuits have too few samples for a causal ranking. Process CPU includes
JIT/GC/other process threads; wall includes scheduling delays. Starting/stopping
and saving profiles is outside factorMs but still affects the process state.

## Bounds failure and cleanup

run.py was invoked through spice-heavy, one direct Node process group at a time,
with communicate(timeout=45), SIGKILL only to owned groups on timeout, reap and
absence checks. No global kills, candidate variants, retries or remeasurement.
71 children exit0; one baseline CMOS50k child times out after its cold receipt,
with no warm receipt. PID/argv/exit/phase journals and stdout/stderr are retained.
Recovery independently checked no matching Node experiment workers remain;
recovery-cleanup.json records that check. budget.json preserves the original claim.

IMPORTANT: its 294.1393443360139s charged Python monotonic child wall is NOT a
certified actual elapsed-wall total. Seven completed child phase totals exceed
their recorded child wall; summary.json lists every disagreement. Completed Node
performance.now phase totals alone sum to 5758.755780915002s. For example, an
isolated warm baseline factor records 1068405.819ms within a child charged
1530.052ms. Host suspension/clock-domain behavior is a plausible explanation,
not independently proven. The 45s elapsed deadline and 900s actual elapsed budget
therefore CANNOT be certified; the experiment does not satisfy that timing bound.
Do not report the charged sum as a successful bounded elapsed experiment.
No further measurement was attempted on recovery. All outliers remain present.
LoadStart was 65.29/28.10/18.08, loadEnd 5.27/18.39/17.32. This shared-host run
also has substantial scheduling variability. No filtered 'good' subset is used.

## Calibration and measurements

All 48 cells, with sample counts, medians/min/max, process CPU (isolation), peak
RSS and raw ticks are in summary.json and summary.txt. No timeout is imputed.
These are baseline versus sampled/control measurements, NOT before/after a fix.

Isolated full factor wall, ms median [min,max], 3 completions per cell:

| Mesh | Phase | Unprofiled | Sampled | Median difference |
|---|---|---|---|---|
| 1k | cold | 11.507 [10.465,12.966] | 13.211 [10.033,21.049] | +14.81% |
| 1k | warm | 1.678 [1.575,3.405] | 1.582 [1.530,1.651] | -5.70% |
| 10k | cold | 54.341 [53.558,91.228] | 58.249 [55.031,90.989] | +7.19% |
| 10k | warm | 20.055 [19.780,55.099] | 22.555 [21.626,35.237] | +12.47% |
| 50k | cold | 297.637 [267.138,961.390] | 252.640 [233.655,930.079] | -15.12% |
| 50k | warm | 658.461 [211.990,1068405.819] | 273.839 [240.050,5803.870] | -58.41% |

Negative differences do not imply profiler speedup or negative overhead. The
50k baseline is not reproducible. Unlike #932's roughly doubled fine-probe
factor timings (HISTORICAL, different experiment), this sampling removes
per-call CPU timers, but its true overhead is not bounded by these noisy ratios.
No claim that profiling is perturbation-free or lower overhead by a known amount.

Mesh50k line ticks, in repeat order (raw integers, no ms conversion):

| Phase | applySelfSamples | Triangular | Checked | Dense |
|---|---|---|---|---|
| cold | 44 / 31 / 137 | 8 / 10 / 34 | 3 / 2 / 13 | 19 / 15 / 62 |
| warm | 44 / 49 / 451 | 8 / 13 / 127 | 5 / 4 / 37 | 19 / 19 / 195 |

Pooling would overweight the unusually long third warm sampled pass. Do not
interpret pooled counts as a representative native phase percentage. Mesh50k
peak RSS medians [min,max] MiB, cold baseline/sampled 201.578 [200.375,204.656] /
204.062 [202.812,208.875]; warm 241.797 [240.797,243.953] /
241.312 [234.453,249.578]. Every other RSS cell is published too.

End-to-end losses are retained, including unchanged RC50k control warm median
1038.427ms versus baseline 961.841ms. CMOS50k baseline warm has only 2/3 receipts,
median 266775.157ms [14787.695,518762.619], versus control 14783.146ms
[14682.801,14965.473]. These grossly inconsistent durations are not a performance
win. summary.txt publishes the full RC/mesh/CMOS matrix, not selected results.

## Invariance and tests

18 paired isolated phases match complete used L/U column pointers, rows, IEEE
values, row/column permutations, solution, matrix/RHS hashes, factor counts,
supernode counts and U-growth capacities. Every solution is checked against the
complete captured vector. 53 completed paired simulation phases match full
output hashes/counts/decks/convergence. The single missing warm phase is unpaired,
not asserted identical. Production is unchanged, so there is no candidate whose
pivot/growth/singular semantics can be newly certified. Existing dedicated
solver equivalence, reuse, alias-growth, cancellation and singular controls pass.

Offline tooling tests were written first (missing summarize module RED exit1),
then GREEN. They reject corrupt factor/waveform hashes, duplicate/missing child
receipts, preserve timeout censoring and expose the known clock disagreement.
This is offline-tool TDD, NOT candidate mutation testing. summarize.py reconciles
all phase files to the journal and all 18 profiles to recorded ticks and ranges,
plus source hashes and budget receipt. No simulation is needed for this check.

Commands from repository root:

    python3 benchmarks/performance/results/issue-938/test_summary.py
    python3 benchmarks/performance/results/issue-938/summarize.py
    pnpm build
    pnpm lint
    pnpm -C packages/core exec vitest run src/solver/gilbert-peierls.test.ts src/solver/gilbert-peierls-u-alias-926.test.ts src/solver/gilbert-peierls-equivalence.test.ts src/solver/gilbert-peierls-reuse.test.ts
    pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts

Local build/lint, 52 focused solver tests and six fixture tests pass (exit0).
The supervisor forbids repeating the local full suite after reclaimed attempts;
exact-head required test20/test22/build/accuracy CI is the full gate.

Reproduction of the original measurement requires a fresh copy with no receipts:

    pnpm install --frozen-lockfile
    python3 benchmarks/performance/results/issue-938/prepare.py
    spice-heavy python3 benchmarks/performance/results/issue-938/run.py

The archived runner deliberately remains the original measuring code, including
its disclosed clock limitation. Do NOT use it to certify suspend-safe deadlines.
Existing receipts must never be erased to rerun. This lane performed no recovery
measurement rerun and did not expand scope to repair shared measurement tooling.
The exact PR SHA, CI receipts and independent review are in the card handoff.
