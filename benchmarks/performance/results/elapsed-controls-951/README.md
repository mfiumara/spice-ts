# Issue #951 elapsed controls

Scoped benchmark tooling only. No production optimizer, simulator source change,
new netlist, profiler or ngspice comparison. Archived issue-938 receipts remain
unchanged. This is a baseline versus source-identical control calibration, not
an optimization before/after result.

## Result and stop decision

One fixed 18-child serial plan ran once through spice-heavy. 17 Node children
started, 16 exited successfully, and CMOS50k baseline was killed/reaped at
29.801412750s actual elapsed during its warm simulation. Its cold simulation
receipt remains present, at 18402.207083ms. The final CMOS50k control was never
started. Both missing warm results and the unpaired cold result are reported,
not imputed or discarded. calibration.log records exit2, deadline-reserve.

The run used 52.526617958s actual continuous elapsed, including controller gaps,
spawn, exit and cleanup, versus the 300s cap. Summed child actual elapsed was
52.515188167s. All started child groups were checked absent after reaping.
Every observed child interval was below 30s. observedBoundsSatisfied=true is
not full calibration certification. budget.json deliberately retains
deadlineAndBudgetCertified=false and summary.json fullCalibrationCompleted=false
because the matrix stopped at its first deadline event.

No completed-child clock disagreement was observed. Native continuous versus
Python monotonic interval disagreement was at most 0.003043ms; native versus
realtime disagreement at most 0.039147ms. Completed Node lifetime performance
versus realtime disagreement was at most 0.918792ms. The 17 child parent
intervals and entire run interval are reconciled. 16 complete Node lifetimes
are checked. The killed child has no complete Node lifetime; its cold duration
is only checked for parent containment, not independently clock-certified.

This single pair per cell cannot establish timing reproducibility, a profiler
overhead bound, or a statistically supported speedup. It does not clear the
full CMOS50k control. Stop before optimizer work. Further measurement needs a
new supervisor-authorized card, not retries of this archive.

## Clock and ownership controls

controls.py uses macOS mach_continuous_time with mach_timebase_info conversion,
or Linux CLOCK_BOOTTIME. There is no realtime-only or suspend-excluding fallback.
The installed macOS SDK mach/mach_time.h documents mach_continuous_time as
"like mach_absolute_time, but advances during sleep". Unsupported platforms
refuse measurement before launching a child. Linux's native path was not
exercised on this Mac; offline injected clock tests cover the accounting logic.

Native continuous time is the accounting authority. Ordinary monotonic and
realtime clocks are sampled as cross-checks at each 10ms polling iteration,
before child launches, after reap, and against the complete run interval.
A fixed 100ms tolerance allows clock-read scheduling skew and Date.now rounding.
Node performance.now and Date.now lifetime deltas are independently compared,
then checked against the enclosing parent interval; the sum of recorded phase
wall times must fit the Node lifetime. Nonfinite, negative, stepped, suspended
or inconsistent clocks stop the run rather than repairing a receipt. The
100ms acceptance tolerance is not a submillisecond timing-accuracy claim.

Budget accounting covers all run gaps, rather than only summing children.
A new child requires 30s plus 250ms of cumulative budget headroom. The controller
begins termination at 29.75s to reserve 250ms for reap before the 30s hard limit.
Only the directly owned process group can be killed. Ownership PID/argv is
journaled and fsynced before waiting; stdout/stderr go to files, avoiding blocked
pipes. Clock/deadline failures kill/reap the owned child and censor every remaining
point. Parent SIGINT/SIGTERM uses the same cleanup path. Existing sample receipts
reject a second invocation before any child starts.

A suspended or unscheduled controller cannot deliver a signal while the host
is asleep or it is not executing. On resume it charges the full continuous
interval, reports any real overshoot without clipping, invalidates certification,
and stops. The deterministic overshoot test proves that reporting behavior.
This is suspend-safe accounting and fail-closed certification, not a promise
of physically killing a process exactly at 30s during host sleep. Actual host
suspension was not induced on this shared Mac.

## Provenance and hashes

Pinned current main before preparation to
45650391b788c91084b6b472dbe1fdcefbd52a19. prepare.py archives this literal SHA,
checks all 472 frozen core source files against local bytes, and builds baseline
and control bundles. Their normalized executable sources are identical; only
esbuild path comments differ. build.json contains all source and bundle hashes.
The initial preparation failed because the host Python 3.9 lacks tarfile's
filter argument. prepare.log preserves that exit1. prepare-repair.log records
exit0 after validating archive member types/paths explicitly. No timing child
had been launched when preparation failed.

child.mjs imports the existing issue-938/worker.mjs unchanged. For mesh children
it runs captured-matrix factor isolation before full simulation, in that same
Node process, so the total planned child count stays 18. Baseline and control
use the same workload and ordering. Cold/warm factorization creates and analyzes
a fresh solver each time. "Warm" means process/JIT warm, not factor/pivot reuse.
Mesh simulation follows isolation and therefore is not comparable to a separate
fresh simulation-only process. No cross-experiment speedup claim is made.

Existing project-authored scaling-m2-fixture.mjs and issue-919 captured matrices
already have MIT provenance in benchmarks/SOURCES.md. No SOURCES change is
needed or permitted. build.json hashes the generator, archived worker/manifest
and matrix inputs. Requested mesh 1k/10k/50k means actual 1024/10000/50176 nodes;
RC and CMOS actual nodes are 1000/10000/50000. Every output includes the full
DC/transient vectors, names, IEEE values, counts, deck hash and convergence.
Every isolated factor digest includes complete used L/U pointers, rows and
IEEE values plus permutations; solution, matrix and RHS hashes are recorded.
Six paired factor phases and sixteen paired simulation phases match, with
capacity/count/convergence invariants. No claim is made for the unpaired
CMOS50k phase.

Machine was Apple M5 Pro, 51539607552 RAM bytes, Darwin arm64, Node v22.23.1,
Python 3.9.6. environment.json was recorded after calibration and labels its
load average accordingly; it is not a measured start-load receipt. Native
continuous/realtime/monotonic start/end samples and per-child Node version,
argv, PID, exit, memory and complete raw phase journals remain in this directory.

## All measurements

Times below are full simulation milliseconds, baseline/control, one cold and
one warm observation each. Positive control differences are losses. summary.txt
and summary.json include every signed percentage and censored point. Raw journals
retain every factor/solve/CPU/memory record and hash. There are 12 positive and 10 negative differences across
22 complete simulation/factor pairs, ranging from -10.090% to +6.121%; these are
noise/control differences, not optimization wins.

| Circuit | Size | Cold baseline | Cold control | Warm baseline | Warm control |
|---|---:|---:|---:|---:|---:|
| RC ladder | 1k | 66.996 | 69.547 | 45.072 | 47.831 |
| Resistor mesh | 1k | 33.951 | 33.871 | 23.091 | 20.761 |
| CMOS chain | 1k | 270.882 | 279.778 | 190.372 | 196.552 |
| RC ladder | 10k | 333.343 | 340.556 | 255.067 | 256.511 |
| Resistor mesh | 10k | 192.729 | 200.608 | 128.082 | 132.160 |
| CMOS chain | 10k | 2141.559 | 2127.427 | 1848.722 | 1906.166 |
| RC ladder | 50k | 1209.695 | 1208.020 | 1112.623 | 1096.668 |
| Resistor mesh | 50k | 816.852 | 823.384 | 740.243 | 739.884 |
| CMOS chain | 50k | 18402.207 unpaired | censored | timed out | censored |

Isolated mesh factor milliseconds, baseline/control:

| Size | Cold baseline | Cold control | Warm baseline | Warm control |
|---|---:|---:|---:|---:|
| 1k | 9.939 | 9.664 | 1.485 | 1.508 |
| 10k | 57.936 | 56.042 | 22.201 | 21.258 |
| 50k | 261.087 | 275.668 | 218.278 | 217.962 |

Archived #938 had seven known disagreements and no certified actual elapsed
bound. The new run has zero observed completed-lifetime disagreements and
bounded native elapsed observations but a deadline-censored full calibration.
Different baseline revisions, workloads and sample counts prohibit treating
those old versus new durations as an optimization comparison. Historical CMOS
ngspice discrepancies/timeouts remain unresolved. No fresh ngspice experiment
or superiority claim is part of this card.

## Verification and reproduction

Commands from repository root, with exits in commands.json and corresponding
logs. The offline RED was a missing controls module (exit1). Initial GREEN was
nine tests. Fake-controller integration caught an unmocked platform metadata
subprocess (green-controller.log exit1), fixed before calibration. Final offline
checks cover clock steps/suspension, deadline and cumulative budget, owned cleanup,
first-failure stop/censoring, no rerun, and corrupt output/factor/phase/clock/budget
receipts. This is tooling TDD, not a production solver mutation experiment.

Final self-review added zero-child prelaunch clock-failure reconciliation without
rerunning any measurement. All 22 offline tests pass, as do six fixture tests,
local build/lint and the spice-heavy full monorepo suite (exit0). Core reports
3574 passed and two skipped; the root benchmark harness reports 144 passed and
four skipped. Raw receipt SHA256 hashes are checked by verify.py. build.log.gz
preserves the original build output, including its trailing whitespace.

    python3 -m unittest discover -s benchmarks/performance/results/elapsed-controls-951 -p 'test_*.py' -v
    python3 benchmarks/performance/results/elapsed-controls-951/verify.py
    pnpm build
    pnpm lint
    pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
    spice-heavy pnpm test

The archive's offline reconciliation starts no Node children. Preparation and
measurement reproduction require a fresh checkout/copy with no existing
build.json or samples.jsonl; never erase this archive's receipts to rerun.

    pnpm install --frozen-lockfile
    python3 benchmarks/performance/results/elapsed-controls-951/prepare.py
    spice-heavy python3 benchmarks/performance/results/elapsed-controls-951/run.py

Exactly one measured plan was executed. Do not run either the old #938 runner
or another calibration during review. Required exact-head GitHub test (20),
test (22), build and accuracy checks and independent spice-ts-review acceptance
are recorded in the Kanban handoff. Only the supervisor may merge.
