# Issue #902: post-#898 scaling profile receipt

Profile-only slice on `604c523ecae247e97705da69c1ba883243188af8` (merged #898).
No simulator, fixture, threshold, aggregate, ROADMAP or release changes. These are
fresh cold-process measurements, not an optimization A/B or a claim of overall
superiority. Independent exact-head review and green required CI remain merge gates.

## Source and reproducibility

Reuse the original MIT project-authored generator `../../scaling-m2-fixture.mjs`.
Its provenance, source URL and nine pinned hashes are already recorded in
`../../../SOURCES.md`, section "M2 generated scaling decks, issue #426". No new
third-party material. `summary.json` checks the generated deck hashes against every
selected receipt. Mesh actual sizes are 1,024 / 10,000 / 50,176 non-ground nodes.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint
spice-heavy node benchmarks/performance/results/issue-902/run.mjs
spice-heavy node benchmarks/performance/results/issue-902/run.mjs --retry-mesh
node benchmarks/performance/results/issue-902/summarize.mjs
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
spice-heavy pnpm test
```

To verify the committed receipt without rerunning benchmarks, first regenerate
ignored decks, then run the summary assertions:

```sh
node benchmarks/performance/results/issue-842/scripts/write-decks.mjs benchmarks/performance/results/issue-902/decks 1000 10000 50000
node benchmarks/performance/results/issue-902/summarize.mjs
```

`host.json` and `retry-host.json` retain measured revision, date, host and versions.
Apple M5 Pro, 18 logical CPUs, 48 GiB RAM, Darwin 27.0.0 arm64; Node v22.23.1,
pnpm 10.28.1, ngspice-47 with KLU. `samples.jsonl` retains all 63 process receipts,
exact argv, exits/signals, errors, probe vectors, hashes and convergence counters.
`logs/*.stdout.txt.gz` retains stdout (including truncated ENOBUFS output), and
`logs/*.stderr.txt` retains stderr and `/usr/bin/time -l` receipts. Profiles are in
`profiles/*.cpuprofile`; top 15 self frames are in `summary.json`.

Fixed budget: nine pairs, three repeats, no warmups, 45 s per process; one separate
50k profile per circuit. Repeat order TS/ng, ng/TS, TS/ng. Every heavy matrix run
uses `spice-heavy`, with at most two heavy jobs machine-wide. No unrelated process
was terminated. A read-only process check found no remaining issue-902 deck jobs.

## Timing and memory boundaries

Primary comparable column is process wall time measured by the parent, including
`/usr/bin/time`, CLI/runtime startup, module loading, analysis and output. TS emits
one probe plus convergence JSON; ngspice emits its normal full OP listing and one
transient probe, so output volume differs, particularly for the mesh.

TS internal time is one `simulate(netlist)` call, including parse/compile and
analysis, excluding runtime/module startup and JSON serialization. ngspice internal
time is `.options acct` "Total analysis time", excluding netlist load and process
startup. These internal columns are NOT equivalent boundaries. No warm JIT timings
are mixed in. RSS includes process/runtime baseline: TS uses Node maxRSS; ngspice
uses macOS `/usr/bin/time -l` maximum resident set size (bytes converted to MiB).
Failed/timeout RSS is unavailable, not zero. CPU profiles use the inspector only
around the TS `simulate` call, with no warmup; they include parse/compile and GC.

Shared-host noise is substantial. RC 10k TS internal range is 799.6–1636.7 ms,
ngspice 275.1–815.5 ms; CMOS 10k TS is 2762.0–4849.9 ms, ngspice
4470.7–7600.8 ms. Three pairs are descriptive, not statistical proof. Do not
attribute differences from earlier #898 receipts to a code change or claim wins
when ranges overlap. Absolute paired samples are retained for independent analysis.

## Measurements

Wall median [min, max], milliseconds. Internal medians are TS simulate / ng acct.
RSS is median TS / ng, MiB. All completed TS runs use the same revision.

| Circuit | Requested nodes | TS wall | ng KLU wall | Internal TS / ng | RSS TS / ng |
|---|---:|---:|---:|---:|---:|
| RC transient | 1k | 421.0 [408.2,432.4] | 72.1 [61.9,79.4] | 311.3 / 23.9 | 86.2 / 12.8 |
| RC transient | 10k | 1366.6 [906.8,1760.8] | 886.8 [394.7,927.8] | 1261.2 / 786.4 | 178.6 / 34.5 |
| RC transient | 50k | 1575.8 [1557.4,2776.4] | 1601.4 [1321.8,1953.6] | 1500.6 / 1266.2 | 410.8 / 127.8 |
| Mesh OP | 1k | 109.0 [107.6,111.4] | 27.4 [26.8,31.3] | 51.6 / 3.2 | 82.6 / 13.8 |
| Mesh OP | 10k | 341.4 [340.5,344.0] | 146.5 [143.5,148.0] | 277.3 / 50.8 | 147.1 / 47.0 |
| Mesh OP, retry | 50k | 1334.4 [1333.2,1405.4] | 1009.8 [988.7,1042.6] | 1237.9 / 523.8 | 361.6 / 218.7 |
| CMOS transient | 1k | 448.4 [317.0,482.2] | 206.5 [199.0,237.5] | 376.4 / 176.9 | 121.8 / 18.9 |
| CMOS transient | 10k | 4311.5 [2833.4,4997.3] | 5461.4 [4639.8,7941.3] | 4225.9 / 5284.4 | 341.6 / 103.1 |
| CMOS transient | 50k | 22579.4 [22242.6,22785.3] | 3/3 timeout at 45001–45003 | 22431.1 / unavailable | 1045.4 / unavailable |

Losses: TS is slower in wall median for RC 1k/10k, mesh at every size and CMOS 1k.
RC 50k is effectively unresolved under noise. CMOS 10k's lower TS median has
crossing ranges. CMOS 50k is a bounded ngspice timeout, NOT a speedup ratio.

Initial mesh 50k ngspice runs exceeded the harness's 16 MiB captured-output buffer
(ENOBUFS, SIGTERM), not a simulator convergence failure. All three failures remain
in the journal and logs. The only additional experiment repeated that entire pair
three times with a 128 MiB buffer, changing no deck or simulation setting. Retry
rows alone supply the mesh 50k table, never mix baseline TS with retry ngspice.
Current script uses 128 MiB, so fresh runs should not reproduce that harness failure.
CMOS 50k ngspice stderr records dynamic-gmin failure followed by true gmin stepping
before timeout; no completed ngspice waveform or RSS is claimed.

## Waveform comparison and limits

Identical unmodified `.print` / OP decks; only external `.spiceinit` selects KLU.
Comparison covers the fixture's one published voltage probe, NOT every internal
node or branch. ngspice default printing has about six significant digits. Errors
below that resolution do not prove full-precision parity. No tolerance, fixture or
CI threshold was changed. Grids match by index at the printed time precision;
no interpolation is used. Relative errors normalize by peak absolute reference
probe voltage, avoiding division by near-zero samples.

| Circuit/sizes | Probe | Points TS / ng | Max abs V | RMS abs V | Max / RMS peak-relative |
|---|---|---:|---:|---:|---:|
| RC 1k,10k,50k | n10 | 120 / 120 | 4.7741e-8 | 2.2664e-8 | 1.3863e-7 / 6.5811e-8 |
| Mesh 1k | n31_31 | 1 / 1 | 3.3874e-8 | 3.3874e-8 | 1.8598e-7 / 1.8598e-7 |
| Mesh 10k | n99_99 | 1 / 1 | 1.7800e-8 | 1.7800e-8 | 1.2354e-7 / 1.2354e-7 |
| Mesh 50k retry | n223_223 | 1 / 1 | 1.5191e-8 | 1.5191e-8 | 1.2103e-7 / 1.2103e-7 |
| CMOS 1k,10k | s20 | 214 / 214 | 3.9371e-4 | 4.2183e-5 | 1.1247e-3 / 1.2051e-4 |
| CMOS 50k | s20 | 214 / unavailable | unavailable | unavailable | unavailable |

RC maximum grid difference is 4.9178e-15 s (printed rounding); CMOS is
4.1359e-24 s. CMOS's measured error is above printing noise and must not be
represented as bit-identical parity. There is no simulator change in this PR,
so no code optimization RED/GREEN or before/after waveform claim applies.

## Measured hotspots and held follow-up

50k profile self-time (sampled, not inclusive; not additive with other runs):

- RC: GC 302.4 ms / 15.5%; `attemptStep` 151.6 / 7.8%; capacitor `evaluate`
  122.3 / 6.3%; `buildCompanionSystem` 117.5 / 6.0%; `stampStaticDevices`
  84.3 / 4.3%. This is now a distributed transient/allocation workload, not the
  pre-#898 dominant static-stamp hypothesis.
- Mesh: `applySupernode` 205.1 ms / 17.4%; GC 205.0 / 17.4%; `factorize`
  103.1 / 8.7%; `amdOrdering` 101.8 / 8.6%. The clearest isolated computational
  target is sparse factorization/supernode work, held by #899's solver ownership.
- CMOS: MOS1 `batchStamp` 9224.4 ms / 39.2%; GC 2216.5 / 9.4%;
  `refactorWithPivots` 1429.2 / 6.1%; `mos1BulkJunctions` 1227.8 / 5.2%;
  `factorize` 1192.8 / 5.1%; `convergenceTest` 1113.2 / 4.7%.
  MOS1 nonlinear-load work is substantial but not evidence for a small,
  waveform-preserving isolated optimization without further investigation.

No core optimization was attempted. Dependency-held implementation follow-up:
after #899 releases `packages/core/src/solver/gilbert-peierls.ts`, investigate
`applySupernode` allocation/data movement on the 50,176-node mesh. Establish a
focused RED/GREEN regression for the chosen optimization, profile allocation
origins rather than guessing from GC self time, and rerun identical RC/mesh/CMOS
controls and full-precision waveform checks. The supervisor must route and confirm
ownership before an engineer touches solver/Newton or #882's parser/circuit files.

## Verification receipts

- `pnpm install --frozen-lockfile`: exit 0 (existing missing-dist bin warning before build).
- `pnpm build && pnpm lint`: exit 0 (existing bundle/import.meta warnings).
- Both `spice-heavy node .../run.mjs` invocations: exit 0; child failures/timeouts retained.
- `node .../summarize.mjs`: exit 0; 63 receipts, nine pairs, three profiles checked.
- `pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts`: exit 0, six tests passed.
- Full-suite and exact-head CI receipts are recorded in the PR and Kanban handoff.
