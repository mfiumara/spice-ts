# Current-main M2 scaling matrix, issue #958

## Result

The one fixed cold matrix completed all 18 engine/deck children. A nineteenth
child profiled the largest observed spice-ts/ngspice wall-ratio cell. No
simulation failed or timed out. The full measured plan took 90.987323 seconds
on the native continuous clock, below the 900-second cap. The longest child
was ngspice CMOS50k at 58.215365 seconds, below 120 seconds. Every started
process group was checked absent after reaping. There was no observed clock
cross-check failure. Host suspension was not induced.

No core optimization is included. RC1k has the largest observed wall loss,
not CMOS50k. Its short cold profile is mixed and contains inspector overhead;
it does not justify a particular general core optimization or a defensible
gain. Follow-up #960 asks for bounded repeated cold-process attribution before
changing production code. This uses the card's explicit attribution/follow-up
alternative. There are no optimizer before/after numbers because no optimizer
was attempted. The selected profile is a hash-identical attribution control,
not an optimized run.

## Matrix

Milliseconds are parent-observed cold process wall time, including spawn,
import, parse, compile, simulation, output handling, exit and reap. The parent
polls every 10 ms. This quantization matters for the smallest decks. There is
one sample per cell, no warmup, retry, median or statistical superiority claim.
All losses are retained. Ratios below one are single observed shorter wall
intervals, not a claim that spice-ts is generally faster or equally accurate.

| Circuit | Requested nodes | Actual nodes | spice-ts ms | ngspice-47 KLU ms | spice/ng ratio | Status |
|---|---:|---:|---:|---:|---:|---|
| RC ladder TRAN | 1,000 | 1,000 | 133.709 | 51.680 | 2.587 | both ok |
| Resistor mesh OP | 1,000 | 1,024 | 91.946 | 51.304 | 1.792 | both ok |
| CMOS chain TRAN | 1,000 | 1,000 | 329.839 | 262.094 | 1.258 | both ok |
| RC ladder TRAN | 10,000 | 10,000 | 373.716 | 186.383 | 2.005 | both ok |
| Resistor mesh OP | 10,000 | 10,000 | 268.071 | 153.136 | 1.751 | both ok |
| CMOS chain TRAN | 10,000 | 10,000 | 2,347.867 | 3,638.274 | 0.645 | both ok |
| RC ladder TRAN | 50,000 | 50,000 | 1,313.992 | 1,020.217 | 1.288 | both ok |
| Resistor mesh OP | 50,000 | 50,176 | 981.927 | 736.731 | 1.333 | both ok |
| CMOS chain TRAN | 50,000 | 50,000 | 19,402.218 | 58,215.365 | 0.333 | both ok |

Status is execution status, not an accuracy pass. Exact times, statuses, ratios,
ngspice acct fields and convergence counters are in summary.json. The raw
samples.jsonl retains before/after three-element host load averages for every
child, including the profile. The observed load-average components ranged
from 3.592285 to 8.394531 on this shared Mac. They are not CPU-utilization
measurements or proof of isolated conditions.

Both engines consume the same unmodified generated .cir file. No tolerance,
solver or model setting is tuned per circuit. The external .spiceinit sets
ngspice KLU for every child. HOME and cwd are set to this directory so the
user's initialization files are not used. The ngspice solver banner is checked
in every captured stdout. spice-ts hashes all DC/transient voltage/current
vectors and names; ngspice writes the existing deck's .print/.op output and
acct text. These different output paths are included in parent wall time.
Internal simulate and ngspice analysis times must not be substituted into
the wall-ratio table without changing its definition.

## Top loss and profile

RC1k baseline parseAsync took 12.963417 ms and simulate(circuit), including
compile, took 50.929000 ms. The remaining 69.816541 ms of its parent wall
interval includes Node startup/import, hashing/receipt serialization, exit,
reap and polling. It is not a measured pure startup phase. ngspice reports
11.857 ms total analysis, 2.330 ms netlist loading and 1.335 ms netlist parsing.

The selected fresh-process profile uses V8 inspector at a 1,000 us sampling
interval. It takes 136.574125 ms parent wall time, with 14.766833 ms parse
and 58.148083 ms simulate. Its complete output hash equals the baseline
6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7.
It is a separate sampled observation and does not establish profiler overhead
bounds. Its 82.125 ms sampled self time is attributed by function name.

| Phase | spice-ts sampled self ms | Sample share | ngspice RC1k acct ms |
|---|---:|---:|---:|
| Device evaluation/load/stamping | 18.041 | 21.968% | 3.201 matrix load |
| Factor/order | 0.792 | 0.964% | 2.835 factor + 0.102 reorder |
| Solve | no standalone sample | no standalone sample | 2.497 solve |
| Timestep/Newton control | 5.459 | 6.647% | not separately reported |
| Parse/compile | 18.125 | 22.070% | 2.330 load + 1.335 parse, not equivalent boundaries |
| GC | 17.917 | 21.817% | not reported |
| Other/runtime | 21.791 | 26.534% | not equivalent boundaries |

These are sampled self-time categories, not exact exclusive instrumented phase
timers. Inlining and the short sample can hide solve work inside other frames;
zero standalone samples never means zero solve cost. The inspector post frame
itself contributes 9.250 ms to other/runtime. The profile is not suitable for
claiming a stable percentage gain from removing one allocation or LU loop.
The compressed CPU profile and top frames remain published. summarize.py uses
an explicit function-name partition adapted from profile-breakdown.mjs and
keeps unknown frames as other/runtime.

RC1k has 238 transient Newton iterations in both engines. spice-ts accepted
119 transient steps plus t=0; ngspice reports 120 accepted timepoints. Both
report zero rejected transient steps. spice-ts DC reports one Newton iteration;
ngspice reports 241 total iterations, 238 of them transient. These telemetry
boundaries differ. There is no transient iteration explosion here. CMOS has
466 versus 483 transient iterations, and different DC gmin stepping paths.
At 50k, spice-ts DC reports 1,110 Newton iterations versus ngspice 2,848 total
iterations including transient. That difference and the probe mismatch below
preclude treating the observed shorter CMOS wall time as a correctness-backed
speed-superiority result.

## Output accuracy and retained gaps

Every spice-ts result retains a SHA256 over full IEEE-754 DC/transient arrays,
names and the time vector, plus vector/value counts and convergence telemetry.
The selected profile's full digest matches its baseline. This verifies only
that profiling did not change that output; it is not a cross-engine digest
match. Every raw ngspice stdout/stderr has a SHA256 before compression.

The existing .print output is decimal-rounded, not a full-precision reference.
summary.json compares the deck's probe at spice-ts times to printed ngspice
points, using direct matching within 1e-5 relative time for printed precision
or linear interpolation between bracketing reference points. Endpoints without
overlap are not extrapolated. The errors are probe-only and include print
rounding/interpolation effects, not all-node parity certification. Relative
errors use the maximum absolute reference probe value as the common scale.

| Circuit | Sizes | Compared points per deck | Max abs V | RMS abs V | Max peak-relative | RMS peak-relative |
|---|---|---:|---:|---:|---:|---:|
| RC ladder | 1k/10k/50k | 120 | 4.774125e-8 | 2.266408e-8 | 1.386298e-7 | 6.581134e-8 |
| Mesh | 1k | 1 | 3.387413e-8 | 3.387413e-8 | 1.859788e-7 | 1.859788e-7 |
| Mesh | 10k | 1 | 1.779957e-8 | 1.779957e-8 | 1.235438e-7 | 1.235438e-7 |
| Mesh | 50k | 1 | 1.519074e-8 | 1.519074e-8 | 1.210344e-7 | 1.210344e-7 |
| CMOS | 1k/10k/50k | 214 | 3.937111e-4 | 4.218341e-5 | 1.124718e-3 | 1.205058e-4 |

The CMOS gap remains visible and unresolved. This card changes no parser,
device or transient semantics. No accuracy acceptance threshold is adjusted.

## Provenance, bounds and receipts

Measured current main was 951e1e3d651fd5c3efc2cfecdc9761b39bc05fe9, fetched
and fast-forwarded before install/build. Machine is Apple M5 Pro, 51,539,607,552
RAM bytes, macOS/Darwin arm64, Node v22.23.1, pnpm 10.28.1, Python 3.9.6.
host.json records platform, baseline commit, bundle hash, ngspice executable
hash/path/version and the controls.py hash. ngspice-homebrew.json records the
installed ngspice 47 Homebrew bottle and runtime dependencies. No executable
or third-party deck is redistributed here.

The generator is the existing project-authored MIT
benchmarks/performance/scaling-m2-fixture.mjs, already recorded in
benchmarks/SOURCES.md. decks.json records nine deck SHA256s, probes and exact
node counts. Generated decks are ignored to avoid duplicating the existing
source; prepare.mjs reconstructs their exact bytes. provenance.json adds
source/tool hashes. Neither SOURCES.md nor aggregate reports are changed.

matrix.py reuses #951 ContinuousClock, Budget, clock_error and node_error
without editing that archive. It explicitly changes only the module's in-memory
limits to the card-authorized 120/900 seconds. Native mach_continuous_time is
suspend-inclusive; monotonic and realtime cross-checks use the same fixed
100 ms tolerance. It reserves 250 ms for kill/reap and requires a full child's
budget headroom before launch. PID/argv ownership is journaled and fsynced.
Timeouts/circuit failures remain matrix cells and do not skip other circuits;
clock/controller failure censors the remaining plan. Existing samples refuse
a second run. The budget covers gaps and the profile, not just child sums.

A suspended or unscheduled parent cannot signal while not executing. It records
actual overshoot without clipping and fails reconciliation. The offline tests
exercise that condition with injected clocks, not an induced host suspension.
The current archive has no censored cells. Reconciliation checks all bounds,
clocks, process-group cleanup, deck/output receipts, selection and profile hash.

## Commands and verification

Run from the repository root. Offline review must not rerun timing children.
The generated decks can be reconstructed without simulation.

    node benchmarks/performance/results/scaling-matrix-2026-10-13/prepare.mjs
    python3 -m unittest discover -s benchmarks/performance/results/scaling-matrix-2026-10-13 -p 'test_*.py' -v
    python3 benchmarks/performance/results/scaling-matrix-2026-10-13/summarize.py
    python3 benchmarks/performance/results/scaling-matrix-2026-10-13/verify_hashes.py
    python3 -m unittest discover -s benchmarks/performance/results/elapsed-controls-951 -p 'test_*.py' -v
    pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
    pnpm -C packages/core exec vitest run src/convergence-telemetry.test.ts src/solver/gilbert-peierls-reuse.test.ts
    pnpm build
    pnpm lint
    spice-heavy pnpm test

Preparation used pnpm install --frozen-lockfile. The single measurement command
was the following, guarded machine-wide. It refuses this populated archive.
Fresh timing reproduction requires a new authorized checkout/output archive,
not erasing these receipts. Child argv and ownership are in samples.jsonl and
ownership.jsonl; the one fixed plan and its outcomes are in run.log.

    spice-heavy python3 benchmarks/performance/results/scaling-matrix-2026-10-13/matrix.py

Tooling RED was an absent matrix module. Initial four selection/budget checks
passed before measurement. Later fake-child integration found a test-only
StringIO fileno mismatch; offline-test-repair.log preserves it, fixed by using
a real temporary journal. Final 14 archive/controller tests pass, along with
22 unchanged #951 checks, six fixture tests and ten targeted core tests.
Build/lint and guarded full-suite passed. The latter reports 3,590 core tests
passed with two skipped and 144 root benchmark tests passed with four skipped.
Compressed logs preserve original whitespace. Required GitHub CI and
independent review refer to the exact published head in the Kanban handoff.
Only the supervisor may merge.
