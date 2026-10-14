# Linear 10k cold attribution, issue #991

## Result and scope

This is an attribution-only result on current main `bd4ac625f15e344043a7431b24f64828966e2d41`.
No production code changed. No speedup is claimed and #991 remains open.
There is no permitted individual solver/analysis bucket at >=20% of cold parent wall.
The mesh parse bucket crosses 20%, but `parser/` is explicitly outside this card's ownership.
The supervisor needs to route that remaining work rather than expanding this lane.

| Deck | Before, unchanged control wall median / IQR (ms) | After optimisation | Direct ngspice wall median / IQR (ms) | Control/native loss |
|---|---:|---|---:|---:|
| RC10k | 473.313 / 60.924 | Not run, no production change | 192.556 / 9.549 | 2.458x |
| Mesh10k | 357.610 / 49.799 | Not run, no production change | 98.672 / 10.558 | 3.624x |

The byte-identical instrumented copies take 483.588 / 36.045 ms (RC) and
348.613 / 32.014 ms (mesh). These are diagnostic samples, not an "after" optimisation.
The overlapping distributions do not establish that instrumentation speeds anything up.
No 1k/50k rerun is needed because no optimisation landed. Those unchanged generated decks
are retained for a future general optimisation's regression sweep.

Full phase median/IQR and percentages are in [baseline/table.md](baseline/table.md).
The mesh factor bucket is 57.756 / 6.021 ms, 16.57% of instrumented parent wall;
ordering is 33.964 / 3.999 ms, 9.74%; matrix build is 10.853 / 1.189 ms, 3.11%;
solve is 4.003 / 0.408 ms, 1.15%. RC factor is 21.817 / 1.424 ms, 4.51%.
Mesh parse is 73.397 / 9.465 ms, 21.05% of instrumented wall, and the unchanged
control parse is 77.662 / 7.426 ms. These fractions divide phase median by wall median,
not an average of per-round percentages. They do not claim a statistical lower bound.

## Measurement boundary

Each round rotates control, instrumented, ngspice. RC and mesh are serial within the
round. Ten rounds produced 60 owned cold Node children and 20 native grandchildren,
with no warmup, retries, failures or trimmed samples. #951 continuous-clock controls
certify a 21.496721 s complete matrix, 21.444230 s cumulative child elapsed time,
30 s per-child deadline and 300 s run limit. Every started process group was reaped.
See `baseline/budget.json`, `ownership.jsonl`, `receipts.jsonl` and `host.json`.

Machine was Apple M5 Pro, 51,539,607,552 bytes RAM, macOS 27.0.1 build 26A434,
Node v22.23.1, ngspice-47 Homebrew KLU. The shared host was not isolated.
Each parent sample retains before/after load averages and the initial process count.
Startup and exit IQRs are large. These are current-host measurements, not a portable
ranking and not a like-for-like rerun of the old #961 wall numbers (373.7/186.4 ms RC,
268.1/153.1 ms mesh). Both current losses are published.

`wall` is continuous parent spawn-through-reap elapsed time, including cold Node startup,
imports, parsing, simulation, complete-output hash and exit. `nativeWall` is ngspice
spawn-through-close elapsed inside its Node controller, including full binary raw emission;
it excludes the Node wrapper/import/hash. `ngspice` wrapper wall is also published separately.
The main ratio intentionally does not charge ngspice for the benchmark's Node wrapper.
The TypeScript hash cost (RC 22.950 ms, mesh 6.535 ms control medians) is benchmark-only
validation overhead. API-only parse/simulate clocks remain available for different consumers.
This cold end-to-end denominator governs the >=20% gate; simulation-only percentages
would answer a different question. Smaller percentages do not imply a bucket is fast
in absolute terms: mesh factor is much slower than native KLU's 5.898 ms acct median.

Instrumentation wraps AST bodies in a benchmark-only copy of the existing built ESM.
`prepared.json` pins every target once, bundle byte hashes and generated deck hashes.
Nested spans charge exclusive elapsed time to each bucket, so factor's analyzePattern
and lockTopology's ordering cannot be double-counted. Phase definitions are:

- parse: entire `parseAsync` await.
- compile: `Circuit.compile`, excluding any nested measured spans.
- matrixBuild: `MNAAssembler` constructor and `lockTopology`, excluding ordering.
- ordering: `GilbertPeierlsSolver.analyzePattern` (ordering plus symbolic allocation).
- loadStamp: `buildCompanionSystem`, `stampStaticDevices`, `stampDynamicDevices`.
- factor / solve: solver entry points, excluding nested measured phases.
- outputMaterialization: recorder record/flush and result constructors. DC map creation
  elsewhere is in simulation residual, not the tiny DC constructor bucket.
- simulateResidual: all other simulation time, including uninstrumented work and GC.
- outputHash: public result-map extraction plus full vector hashing after simulation.

All simulation phases plus residual equal each sample's simulation duration.
ngspice acct clocks do not separately expose compile or raw emission, and are explicitly
marked unavailable rather than estimated. The native payload hash does not establish
cross-engine accuracy; adaptive time grids and vector layouts differ.

## Decks and output identity

Original repository MIT generators from `scaling-m2-fixture.mjs`, already documented in
`benchmarks/SOURCES.md`, are reused unchanged. No external source or licence was added.
The decks are byte-identical to #961's archived manifest and passed unchanged to both engines.
Mesh10k has exactly 10,000 actual nodes. The optional nominal 1k/50k meshes have 1,024/50,176.

| Deck | Deck SHA256 | TS complete output SHA256, control = instrumented |
|---|---|---|
| RC10k | eb21933fd99fcbc32276816a4f389ba216dcdddc29683551a67f606f352dfca7 | cfed768fddaa3d8f6f44396c0b98d1e1101231083774afcf4f993b888a787ede |
| Mesh10k | c88e6076daf2523437e3da014d7a3c329f679a7405f789530c5c805f447ed0dc | 7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f |

Each of the 20 TS results per deck hashes every available DC/transient voltage/current
vector and the transient time grid, using explicit little-endian doubles and named vectors.
Each of the ten native runs per deck has an identical complete binary numeric payload hash.
Native headers contain changing dates and are excluded. Full raw files are retained gzipped;
verification recomputes their hashes. See `baseline/verification.json` for native hashes.
No probe-only hash or per-circuit solver/tolerance setting is used.

## Reproduction and verification

From the repo root, on the pinned base, build and run into a fresh directory:

```
pnpm install --frozen-lockfile
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/linear-10k.py benchmarks/performance/results/linear-10k-991/reproduction
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/linear-10k-991/reproduction
```

The runner refuses an existing journal. It polls actual continuous deadlines every 10 ms,
stops on the first clock disagreement/budget failure and retains censored cells. Archived
absolute commands describe this worktree, while reproduction derives paths from its checkout.
Copies are benchmark-only; source and production dist are not instrumented. Gzipped archive
copies can be inspected offline without loading/executing them.

Actual local gates, all exit 0 unless explicitly RED:

```
node --test benchmarks/performance/linear-10k.test.mjs
python3 benchmarks/performance/linear-10k-test.py
pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/linear-10k-991/baseline
pnpm build
pnpm lint
spice-heavy pnpm test
```

11 attribution/receipt tests, five plan/deadline tests and six existing scaling tests pass.
The receipt-clock corruption regression was RED (10 pass / one fail), then GREEN (11 pass).
It catches corrupting the stored continuous envelope even when the budget's certified flag
is unchanged. Other tests reject missing/duplicate rounds, altered decks/full outputs,
overlapping spans and worker failures. The full monorepo gate passed locally, including
3,629 core tests with two existing skips. Logs are retained beside this report.
These new benchmark-only tests are manual checks; shared CI configuration was not edited.
The four required exact-head CI checks and independent review are tracked in the card/PR.

## Poteto decision

Reuse existing deterministic generators, AST instrumentation, vector hash/statistics helpers
and #951 clock controls rather than adding a second solver API or profiler dependency.
Only benchmark files changed. Do not infer an optimisation from a profile whose permitted
buckets do not meet the card's threshold. Route the mesh parser bucket to its owner.
