# #1077 accounting attribution: no non-load optimization shipped

Decision: evidence-only. Refs #1077. No candidate was applied or accepted, and
there is no before/after speedup claim. No production code, tolerances, model
parameters, fixture corpus, aggregate report or outcome pin changes.

Measurement base: `0c63eac1` (full SHA, OS, Node and ngspice version in
`host.json`). All simulator execution is serial inside `spice-heavy`. The Mac
is shared; timing outliers remain in the published samples.

## Reproduce

From the repository root (ngspice-47 and pnpm required):

```sh
pnpm install --frozen-lockfile
node benchmarks/results/issue-1077-acct/prepare.mjs
spice-heavy python3 benchmarks/results/issue-1077-acct/run.py
spice-heavy python3 benchmarks/results/issue-1077-acct/warm.py
python3 benchmarks/results/issue-1077-acct/summarize.py
python3 -m unittest discover -s benchmarks/results/issue-1077-acct -p 'test_*.py' -v
pnpm build
pnpm lint
pnpm -C packages/core exec vitest run transient-step.test.ts transient-columns.test.ts transient-convergence.test.ts mos2.test.ts
python3 benchmarks/results/issue-1077-acct/archive.py
```

The runners overwrite this directory's receipts, not simulator sources.
`prepare.mjs` bundles the current source twice with the installed esbuild:
control and AST-instrumented diagnostic. These are experimental Node ESM
bundles, not a measurement of npm package startup. The source is unchanged
between bundles. `bundle-hashes.json` and compressed bundles/maps preserve
the exact measured builds and profile frame locations. No desktop UI is used.
No aggregate refresh or local full-suite run is part of this targeted card;
required exact-head GitHub CI is the authoritative complete outcome gate.

## Input identity and provenance

Inputs are the existing 27-MOS2 amplifier decks, substantially the same
circuit rather than independent topologies:

- `benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir`
  (`ngspice/mos-amplifier-transient`).
- `benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir`
  (`classic/mos-amplifier`).

Pinned upstream sources and redistribution licences are already recorded in
`benchmarks/SOURCES.md` under ngspice corpus A and classic corpus B. No new
third-party source is introduced. Measurement scripts are original project
code under the repository licence.

Cold headline runs pass the exact original bytes to both engines. For
accounting, only the ngspice deck's `noacct` bookkeeping token becomes `acct`;
the classic deck already enables it. The resulting `*-acct.cir` bytes go to
BOTH engines, with hashes checked in `summarize.py`. No analysis, tolerance,
model or output expression is changed. Native uses `ngspice -n -b -r` and
reports SPARSE 1.3, despite being a KLU-capable build.

## Unchanged-engine timings: loss, not before/after

Five cold fresh-process samples per group; engine order alternates each round.
JS external wall includes startup/import, parse, simulation, three waveform
hashes and receipt writing. Native wall includes startup, parse, simulation
and binary raw output. OS caches are not flushed. Quartiles use the inclusive
method; full ordered samples and IQR are in `summary.json`/`wall.json`.

| Fixture | JS cold wall median [Q1,Q3] ms | Native cold wall median [Q1,Q3] ms | JS/native |
|---|---:|---:|---:|
| ngspice | 5038.98 [4965.75,5071.98] | 550.42 [532.93,560.61] | 9.15x |
| classic | 4995.50 [4681.26,5123.04] | 522.29 [497.37,528.93] | 9.56x |

JS cold IQR is 106.23 / 441.78 ms; native cold IQR 27.67 / 31.56 ms.
Before/after medians and the three regression-guard deltas are N/A: there is
no optimization candidate or changed simulator to compare. In particular,
the diagnostic bundle below is NOT an after/candidate series. No >=15% cut
or <=5% regression gate is claimed. The issue stays open.

Warm controls retain six runs in one process and discard only run zero:

| Fixture | JS API median [Q1,Q3] ms | Native marker wall median [Q1,Q3] ms |
|---|---:|---:|
| ngspice | 3890.53 [3881.66,3941.37] | 367.88 [367.02,368.63] |
| classic | 3646.03 [3603.91,3736.06] | 367.31 [365.52,367.40] |

JS reparses the identical accounting deck each call. Native parses once,
retains plots in memory and uses a generated repeat/run/rusage control block.
A headless PTY provides flushed markers around each `run`, excluding rusage.
Those markers include process scheduling delay; warm series were collected
separately and are diagnostic, not a perfectly equal API/I/O contract.
The checker verifies cumulative native accounting deltas on all six runs.

## Work counters: same schedule, not excess JS timesteps

Both fixtures produce the following counts on every JS cold/warm/profile and
diagnostic run; native accounting controls agree between fixtures:

| Counter | spice-ts | ngspice-47 |
|---|---:|---:|
| Accepted advances, excluding initial output | 2428 | 2428 (2429 accepted timepoints minus initial) |
| Saved/accepted timepoints, including initial | 2429 | 2429 |
| Rejected attempts | 766 | 766 |
| LTE retries | 10 | not separately exposed by acct |
| NR retries | 756 | not separately exposed by acct |
| Attempt calls, excluding initial point | 3194 | 3195 reported timepoints including initial |
| Transient NR iterations | 82710 | 83599 |
| Total NR iterations | 82853 | 83747 |
| Transient factor / solve calls | 82710 / 82710 | not exposed by acct |

JS has 143 DC iterations, 12 gmin attempts and one rejected DC solve. Native's
iteration accounting is not exactly the same definition. Factor call counts
do not imply all calls perform a fresh symbolic analysis or numeric refactor;
the solver can reuse its pattern/pivots. This receipt does not infer native
factor counts from iteration counts. There is no evidence for redundant JS
steps/iterations as the source of the 9x gap.

## Native accounting and JS phase attribution

Native transient CPU accounting, milliseconds (not elapsed wall):

| Fixture | Total | Load | Factor | Solve | Truncation |
|---|---:|---:|---:|---:|---:|
| ngspice | 438.347 | 348.875 | 33.538 | 21.759 | 5.105 |
| classic | 382.878 | 295.455 | 35.226 | 25.410 | 4.477 |

ngspice acct combines device evaluation and matrix stamping in load; separate
native stamping, output and whole-step-control clocks are unavailable, not
zero. Raw acct logs are committed compressed.

Separate JS diagnostics instrument whole attempt/advance/companion functions,
static+dynamic device-dispatch and charge-load blocks, transient factor/solve
calls and reentrant output record/flush methods. They do NOT put millions of
scalar callback timers inside devices. `instrumentation.json` lists scopes.
Companion assembly is companion total minus both device load blocks; Newton
control is attempt minus companion/factor/solve. The step-control/setup residual
is whole transient minus all other mutually exclusive buckets. It includes
constructor/setup, accept/LTE/truncation/prediction work and timer overhead;
it is not a pure LTE clock. History restamping is kept separately because it
includes device load. Output is column record/flush, not JS receipt hashing.

Five diagnostic/control pairs alternate order on shared accounting bytes.
Instrumentation/API medians [IQR] are 5816.81 [1189.96] vs control 5219.51
[857.86] ms for ngspice, and 4912.17 [381.70] vs control 5715.06 [912.47] ms
for classic. The apparent faster instrumented classic series shows host-load
noise, NOT an optimization. Do not subtract these series as exact overhead.
The `*-exploratory-instrumented.json` files and earlier `*-instrumented.log.gz`
are retained exploratory diagnostics, not paired samples used in this table.
The earlier logs predate the final separate device-block timers.

The table uses the run with median instrumented transient duration in each
five-run group (file names recorded in `summary.json`), so its exclusive
buckets sum exactly to that run's transient time rather than mixing medians:

| Exclusive bucket | ngspice JS ms (% of transient) | classic JS ms (% of transient) |
|---|---:|---:|
| Static/dynamic device load + stamping | 1710.09 (29.68%) | 1307.75 (27.03%) |
| Device charge load + stamping | 3298.76 (57.26%) | 2899.25 (59.93%) |
| Companion matrix/history assembly | 115.73 (2.01%) | 98.29 (2.03%) |
| Factor call, including CSC preparation | 234.60 (4.07%) | 219.01 (4.53%) |
| Solve call, including RHS copy | 100.45 (1.74%) | 88.38 (1.83%) |
| Newton control/damping/convergence | 112.76 (1.96%) | 85.10 (1.76%) |
| Accepted-history restamp (contains load) | 66.15 (1.15%) | 56.18 (1.16%) |
| Column output recording/flush | 2.86 (0.05%) | 3.00 (0.06%) |
| Step control/setup residual | 119.52 (2.07%) | 80.77 (1.67%) |

Largest exclusive non-device-load phase is factor, about 4–5%, not enough to
justify a proposed >=15% wall cut on both fixtures even with an unrealistically
complete removal. These diagnostic proportions are not a rigorous speedup
bound: instrumentation, GC pauses and host scheduling perturb phase costs.
Device evaluation and scalar stamping cannot be cleanly separated by acct;
the uninstrumented CPU profiles provide that distinction by sampled frame:

| Self-time frame | ngspice | classic |
|---|---:|---:|
| assembler stampG | 13.10% | 14.27% |
| garbage collector | 11.18% | 11.94% |
| MOS2 stampTransientCharge | 15.03% | 10.52% |

GC is cross-cutting and already charged to whichever timed phase it interrupts;
it must NOT be added to the exclusive phase table. It is the largest generic
non-device sampled frame, but its allocation owners have not been established
by a heap profile. Removing all GC self-time would still not substantiate the
both-fixture 15% gate. Scalar stampG is a load sub-bucket, not an independent
solver cost. The existing rejected MOS2 prepared-slot candidate already
addresses this path; this card does not silently reapply or tune that patch.
No measured general non-load candidate is supported. No protected MOS1,
MOS3, BJT, VDMOS/parser or DC/homotopy/native-load-state file was edited.

## Numerical scope and verification

All measured JS control and instrumented runs retain bit-identical SHA256
fingerprints for the full time, v(20) and v(66) arrays and identical convergence
telemetry. This checks instrumentation neutrality on these probes, not every
internal state or a new full-waveform native accuracy envelope. No new native
waveform score is claimed; the raw native accounting/output logs are retained,
while temporary binary plots are not. Required accuracy CI validates the
unchanged production head independently.

Local frozen install, build and lint pass. Four focused Vitest files pass all
53 tests. Six offline receipt tests verify exact summary regeneration,
inclusive quartiles, timer-manifest coverage, and detection of missing samples
and waveform drift, plus archived bundle hashes. Compressed command receipts are retained here. Exact PR
head SHA and required CI results are recorded in the PR/card handoff, not
fabricated into this frozen measurement. Full-suite local tests and aggregate
refresh were intentionally not run under the card's targeted-only boundary.
