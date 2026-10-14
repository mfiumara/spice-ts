# Cold import investigation for #978

## Outcome and ownership boundary

Measurement-only slice. No simulator source, build configuration, model registration,
netlist or tolerance was changed. No import reduction is claimed and #978 remains open.
The card explicitly says to publish the receipt and stop if the top contributor is
in an owned file. The largest measured **source-module initialization** contributor
is `packages/core/src/parser/tokenizer.ts`, which belongs to the parser lanes.
Its eager `POW10` construction converts 801 decimal strings at import time
(lines 19–22). It exists for ngspice-compatible decimal rounding, so replacing it
with `Math.pow` is not a numerically safe shortcut.

The much larger overall cost is V8 compilation of the bundled shared chunk.
CPU profiling identifies that bucket but does **not** attribute it to individual
source files. This receipt does not claim that the tokenizer dominates total import
latency or that deferring its table would remove the compilation cost. The supervisor
can route the measured parser initialization or a separately scoped bundling experiment.

## Reproduction and provenance

Simulator baseline `760833b948280918f6abcfaa0d051a4f4d865ae9`, macOS 27.0.1 arm64,
Node v22.23.1. Core is the normal tsup ESM build, not a tsx source import.
`provenance.json` records built JS and relevant source SHA256 values.
The RC1k harness from PR966 was still OPEN during this run. Its exact source
`405e9dc6f054931bf90f1a21b9272a32228c7370` is retained in
`harness-405e9dc6.tar.gz`. It was restored only into temporary untracked harness
paths, not merged into this branch. The archive contains the original scripts,
including their existing fixed-archive tests; those tests require PR966's original
receipt archive and are not checks for this new receipt.

The deck is the existing self-authored MIT `scaling-m2-fixture.mjs` RC ladder,
1000 nodes. Its provenance is already in `benchmarks/SOURCES.md`. No new
third-party circuit is introduced. Identical deck SHA256 for all 45 baseline runs:
`0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7`.
Native reference is Homebrew ngspice-47 using KLU, confirmed by every native log
and `baseline/host-00.json`.

Commands from repo root:

```sh
pnpm install --frozen-lockfile
pnpm -C packages/core build
spice-heavy node benchmarks/performance/results/cold-import-978/profile.mjs
# Offline regeneration after the original summary step failed dependency resolution:
node benchmarks/performance/results/cold-import-978/profile.mjs summarize
# Restore the pinned harness scripts from the archive if not present:
tar -xzf benchmarks/performance/results/cold-import-978/harness-405e9dc6.tar.gz
spice-heavy python3 benchmarks/performance/rc1k-attribution.py benchmarks/performance/results/cold-import-978/baseline --rounds 15
node benchmarks/performance/rc1k-attribution-report.mjs benchmarks/performance/results/cold-import-978/baseline
node --test benchmarks/performance/results/cold-import-978/profile.test.mjs
python3 benchmarks/performance/results/cold-import-978/verify.py
```

For a fresh measurement, use an isolated worktree at the simulator baseline, archive
or move existing `import-samples.json` and/or `import-samples.json.gz` first, and choose a fresh baseline destination.
The profiler refuses to overwrite an existing measurement. `summarize` is offline
and rebuilds only the ignored diagnostic copy, not the real dist.
Pinned archive extraction creates temporary harness files outside this result folder;
do not commit them or overwrite an independently changed harness.

## Import measurement

15 cold-process rounds, rotating control / inspector CPU profile / evaluation-copy
order, 45 workloads total. Every child imports the built entry exactly once.
No discarded samples, warm-up exclusion or per-circuit tuning. Host 1-minute load
was 7.634–7.903, recorded before and after every workload in `import-samples.json.gz`.
These are cold Node processes, **not** flushed filesystem-cache measurements.

| Measurement | Median ms | Q1 ms | Q3 ms | IQR ms | n |
|---|---:|---:|---:|---:|---:|
| Uninstrumented import only | 31.227 | 27.228 | 31.932 | 4.704 | 15 |
| Inspector-profiled import | 34.215 | 31.579 | 39.066 | 7.487 | 15 |
| Evaluation-copy import | 28.915 | 28.119 | 34.559 | 6.439 | 15 |
| Sampled V8 compileSourceTextModule | 26.917 | 25.147 | 30.208 | 5.061 | 15 |

The CPU profiles use a requested 100 μs interval. They also include inspector
start/stop overhead (notably `post`), so sampled buckets are diagnostics, not an
additive partition of uninstrumented import time. Most CPU time remains unattributed
to source modules because V8 compiles the bundled chunk as one script. The full
unattributed buckets are retained in `import-summary.json`, not discarded.

For per-source initialization, a separate copy inserts `performance.now()` boundaries
at esbuild's `// src/...` markers. It measures 165 module blocks. Timers include
instrumentation overhead and any GC/descheduling inside a span, exclude compilation,
and do not capture dependency load/compile time for that module. The uninstrumented
series remains the performance baseline; the instrumented series is not an optimization.
The lower median in that series is host/run noise, not a speedup claim.

Largest top-level evaluation spans, all n=15, in milliseconds:

| Module | Median | Q1 | Q3 | IQR |
|---|---:|---:|---:|---:|
| parser/tokenizer.ts | 0.818 | 0.762 | 0.880 | 0.118 |
| devices/xspice/spec.ts | 0.365 | 0.316 | 0.387 | 0.071 |
| devices/bsim1.ts | 0.125 | 0.107 | 0.127 | 0.020 |
| devices/bsim3v3-params.ts | 0.082 | 0.079 | 0.083 | 0.004 |
| devices/bsim2.ts | 0.078 | 0.072 | 0.083 | 0.011 |
| parser/behavioral-expression.ts | 0.074 | 0.066 | 0.083 | 0.017 |

All 165 distributions and all 15 raw CPU profiles are retained. `profile.test.mjs`
rederives medians/IQR, verifies rotated workload order and matching module coverage,
and checks that no whole-bundle compilation bucket was silently removed.

## Unchanged RC1k baseline and remaining loss

15 rotating control / instrumented / ngspice rounds under `spice-heavy`.
45 top-level workloads plus 15 native grandchildren, 60 total. All 45 receipts
certified and successful, no clock corrections or excluded samples. 1-minute load
6.248–6.468, median 6.270, from 90 observations. Different time windows and load
mean this import distribution must not be compared as an optimization against the
import-only diagnostic series above.

| Boundary | Median ms | Q1 ms | Q3 ms | IQR ms | n |
|---|---:|---:|---:|---:|---:|
| spice-ts control cold process wall | 132.417 | 130.391 | 144.920 | 14.529 | 15 |
| #960 control import boundary | 23.170 | 21.922 | 24.840 | 2.919 | 15 |
| spice-ts parseAsync | 15.834 | 15.360 | 17.379 | 2.019 | 15 |
| spice-ts simulate | 61.019 | 59.160 | 66.087 | 6.927 | 15 |
| native ngspice cold wall | 34.927 | 33.521 | 36.269 | 2.748 | 15 |
| native ngspice wall + external output hashing | 42.406 | 40.939 | 43.986 | 3.047 | 15 |

Remaining loss: spice-ts cold wall is **3.79×** native ngspice cold wall.
The spice-ts wall includes startup, parse, simulation, output hashing and exit;
native wall includes native startup, parse, simulation, raw emission and exit,
but excludes the Node controller and external raw parsing/hashing. Including that
external native hashing gives 42.406 ms; wrapper wall is not native engine time.
`baseline/table.md` and `baseline/summary.json` retain all other boundaries.
No after run exists because the ownership stop prevented a code change.

All 30 spice-ts control/instrumented full-output hashes are unchanged from #960:
`6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7`.
Native hash is `437fcf743eca12eaf2486bf14b29940aa79b59bc3f490e420bb1aa186e9d0055`.
Cross-simulator hashes are **not** bit-identical. Each hash covers 1002 vectors,
120240 values. Both engines report 238 transient iterations. The offline checker
recomputes all 15 native hashes from retained compressed raw files, checks all
30 spice-ts receipt hashes, and verifies matched-point n10 probe evidence.
Maximum time mismatch is 6.617e-24 s; n10 max absolute error 7.772e-16 V,
max error normalized by native peak 2.257e-15, RMS normalized by native peak
1.068e-15. These are probe metrics, not an all-node cross-engine parity claim.

## Verification and execution failures

- Install, core build, full `pnpm build`, full `pnpm lint`: exit 0.
- Targeted tokenizer/parser/INPevaluate vitest: 191 tests, exit 0 (`targeted.log.gz`).
- New offline profile checks: 4 tests, exit 0 (`profile-tests.log.gz`).
- New offline baseline raw/hash/probe check: exit 0 (`verify.log.gz`).
- Borrowed harness unit cases: 8 passed, 2 fixed-archive cases intentionally not
  selected, exit 0 (`harness-unit-tests.log.gz`). The initial complete attempt failed
  those 2 cases because PR966's original archive is not on main. Earlier harness
  attempts had wrong test-root/config paths; retained in the failure logs.
- Initial guarded profile attempt timed out waiting for a slot (exit 124, no
  workload); second attempt completed all 45 children but offline summary failed
  resolving a pnpm symlinked dependency (exit 1). Fixed by resolving tsup's real
  path; offline summarize exit 0. No profiling workloads were rerun or discarded.
- First baseline queue call hit the tool's 420-second gateway timeout before any
  receipt or child existed. Background guarded retry completed the 60 workloads,
  exit 0 (`baseline-run.log.gz`).
- Local full suite was not launched for this measurement-only change. Required
  GitHub CI on the exact PR head is the full-suite gate.

Follow-up scope belongs to the supervisor. Do not close #978 based on this receipt.
