# #1077 MOS amplifier transient attribution

Decision: attribution-only receipt. No speed fix, no claimed 15% improvement,
no production edits, no changes to tolerances or fixture bytes. Refs #1077.
The issue remains open. Measurement base is current main
`fc27a6bc` (full SHA and machine/version details in `host.json`).

## Reproduce

From the repository root, with dependencies installed and ngspice-47 on PATH:

```
pnpm install --frozen-lockfile
pnpm build
spice-heavy python3 benchmarks/results/issue-1077/run.py
python3 benchmarks/results/issue-1077/summarize.py
pnpm lint
spice-heavy pnpm test
spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check
```

`run.py` runs sequentially inside one heavy slot. It writes raw outputs and
profiles next to itself. `summarize.py` verifies fixture hashes, five retained
samples per timing group, stable telemetry, and native cumulative counter deltas.
It accepts either uncompressed outputs or the committed gzip files.
Reproduction overwrites receipts, not simulator files.

## Input provenance

Only existing public fixtures are used. Canonical paths, pinned source URLs and
licenses are already recorded in `benchmarks/SOURCES.md` under ngspice public
corpus A and classic corpus B. No new external circuit source is introduced.
The measurement scripts are original project code under the repository license.
The `*-acct.cir` and `*-warm.cir` files are generated diagnostic derivatives of
those same licensed inputs, not replacements for the corpus fixtures.

- ngspice fixture: `benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir`
  SHA256 `a6d0f4220bde7a548209e0e845e3c9bb731b2819f7f7e256d284e5a85e10fa7c`.
- classic fixture: `benchmarks/corpus/classic/fixtures/spice3f5/mosamp2.cir`
  SHA256 `d8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469`.

These are substantially the same 27-MOS2 amplifier, not two independent circuit
topologies. Both use LEVEL=2 and the same transient/options/model values.
ngspice's fixture disables accounting, while classic's enables it.

## Five-run medians (milliseconds)

| Fixture | spice-ts cold process | ngspice cold process | Ratio | spice-ts warm API | ngspice warm control | Ratio |
|---|---:|---:|---:|---:|---:|---:|
| ngspice/mos-amplifier-transient | 3759.57 | 421.84 | 8.91x | 3521.13 | 383.08 | 9.19x |
| classic/mos-amplifier | 3802.57 | 417.83 | 9.10x | 4024.59 | 418.23 | 9.62x |

Cold means fresh process, not dropped OS filesystem caches. Each cold engine
has five runs; engine order alternates each round. The JS process includes
module loading, parse, compile, DC, transient and output column recording.
ngspice uses `-n -b -r <rawfile> <original fixture>`; its raw output is retained.
The original fixture bytes are identical across engines for these cold runs.

Warm JS uses one loaded Node process, reparses the identical fixture each time,
and measures the API execution with `performance.now()`. Native warm runs use
one batch process with a generated `.control repeat 6; run; rusage all` block.
Headless PTY marker observation brackets each `run`; the first of six runs is
excluded for both engines. The native block changes only control flow, not any
circuit, analysis, tolerance, or model value. Native parse happens once and JS
parse happens per call, so these warm timings are diagnostic rather than an
exactly equal I/O/API contract. Native warm runs retain plots in memory, while
cold native runs emit binary raw output. Accounting is outside warm wall markers.
No app, graphics interface, desktop, or foreground terminal was opened.

All sample values are published, including the slower classic warm result.
The Mac is shared; warm does not mean faster under changing host load. These
are descriptive local timings, not universal performance claims. There is no
candidate or after series, and no fabricated before/after improvement.

## Work-count and per-iteration attribution

Every JS measured run and both diagnostic drivers have identical telemetry:

- 2428 accepted transient advances, plus the initial DC output = 2429 points.
- 766 rejected attempts = 756 NR retries + 10 LTE retries.
- 82710 transient Newton iterations.
- 143 DC iterations, 12 gmin step attempts, one rejected DC solve.

ngspice `.options acct` reports, for both inputs:

- 2429 accepted timepoints (includes the initial point), 766 rejected.
- 3195 total timepoints, 83599 transient iterations, 83747 total iterations.
- Warm `rusage all` is cumulative; `summarize.py` verifies per-run deltas
  of 2429 accepted points and 83599 transient iterations.

Therefore the 9x loss is not explained by excessive timestep count or excessive
NR iterations. The native/JS NR definitions differ slightly; no exact internal
iteration equivalence is claimed. Both engines still spend many iterations on
rejected NR work. Merely lowering rejection counts would be a convergence
algorithm change, not evidence that JS alone oversteps this fixture.

Warm wall divided by JS transient NR count is 42.57 us (ngspice fixture) and
48.66 us (classic). Single accounting controls give native transient analysis
CPU time / NR of 4.81 us and 4.42 us. CPU accounting and elapsed wall are distinct
measures; this normalization is descriptive and is not a standalone speed gate.
Native transient CPU breakdowns are published in `summary.json` and raw logs:

| Native accounting control | TRAN CPU ms | Load ms | Factor ms | Solve ms | Trunc ms |
|---|---:|---:|---:|---:|---:|
| ngspice fixture | 402.358 | 309.710 | 36.470 | 25.107 | 4.733 |
| classic fixture | 369.667 | 284.234 | 34.484 | 23.553 | 4.349 |

For the ngspice accounting-only control, `noacct` is replaced by `acct`.
The classic control is unchanged. Accounting controls are excluded from headline
medians. Raw ngspice logs report netlist loading, expansion and parsing separately.

Separate warmed public-driver diagnostics split parse, compile/DC/setup, and
transient stepping with five-run medians after discarding a driver warmup.
ngspice fixture: 0.614 ms, 3.821 ms, 3125.608 ms.
Classic: 0.601 ms, 3.486 ms, 3005.469 ms. The driver constructs per-step Maps
where the one-shot API records columns directly, so this is an attribution
control, not a subtraction from the headline API timings. Driver counters match
one-shot counters. Setup is small relative to the multi-second transient.
Cold API parse medians are 6.309/7.082 ms and warm API parse medians are
0.966/0.899 ms (ngspice/classic respectively). Setup diagnostics were collected
in a separate guarded command after the headline timing series.

## CPU profiles and next boundary

Both inspector CPU profiles are retained as `*-profile.json.cpuprofile.gz`.
`summary.json` contains sampled self-time with bundled line/column identities.
Profiles are cold API executions, not included in repeated timing medians.

| Self-time frame | ngspice fixture | classic fixture |
|---|---:|---:|
| assembler stampG | 14.49% | 12.98% |
| MOS2 stampTransientCharge | 11.40% | 12.07% |
| assembler getVoltage | 10.32% | 8.26% |
| garbage collection | 9.42% | 9.52% |
| MOS2 stamp | 8.30% | 12.02% |
| MOS2 evaluateChannel | 6.97% | 6.88% |
| MOS2 evaluateCharges | 5.17% | 5.08% |
| sparse refactorWithPivots | 3.17% | 2.58% |

Top self-time frame is the locked assembler `stampG` callback at
`packages/core/src/mna/assembler.ts:374`, which calls `slotOf` for every entry.
The callback accesses the cached slot trace and adds into the CSC value array;
the charge and static device loads call it repeatedly. `getVoltage` is the
assembler callback at line 381. MOS2 static load starts at `mos2.ts:965` and
charge load at `mos2.ts:1184`. Garbage collector self-time is measured; attributing
all of it to one allocation site would require a heap allocation profile.

Inference: a general cached/batched MOS2 stamp/load path is a more plausible
next lever than parsing or sparse LU on this small circuit. That is a hypothesis,
not a measured fix. Removing all stampG self-time alone would barely approach
the 15% gate on one input and fall short on the other. The current card forbids
editing `mna/assembler.ts` while #1074 is open. No protected file or mos3 file
was edited. A future coordinated lane should measure a general MOS2 load-path
candidate against these receipts and the complete outcome suite, after #1074
lands. This receipt deliberately does not ship a speculative optimization.

## Verification and limitations

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, and guarded full
  `pnpm test` passed. Logs are retained here compressed.
- `python3 .../summarize.py` passes the offline receipt assertions.
- Guarded aggregate `--check` fails before simulation on current-main stale
  SOURCES/fixture-tree provenance. Its exact diagnostic is retained as
  `aggregate.log.gz`. This is not an aggregate pass, nor was its pin repaired
  in this evidence-only scope.
- No production, fixture, dependency, or existing harness file changed.
  Thus there is no candidate aggregate outcome delta; no successful current-main
  aggregate rerun is claimed. Exact-head required GitHub checks are reported in
  the PR/card handoff, separately from the frozen measurement receipt.
- Native cold raw outputs and diagnostic accounting outputs are retained gzip
  compressed. JS receipt captures points, deterministic work counters and final
  v(20)/v(66), not a new full waveform parity score. This card does not refresh
  or silently improve the aggregate accuracy envelope.
