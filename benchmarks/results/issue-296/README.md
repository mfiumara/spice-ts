# Issue 296 aggregate parity refresh receipt

This receipt covers the unchanged 100-fixture aggregate run from current `main` after accepted and squash-merged PRs #274 and #284. It makes no M1 completion, parity, milestone, speed, or superiority claim.

## Inputs and tools

- Base commit: `451820dac82c8f545d914e03e7f2fde8ad3e817c`.
- Previous accepted aggregate: issue #275, PR #284, accepted head `47da214e26d348f41baea47b80acff8afe6f2881`, deterministic outcome `2c5abd0d6ffb637d98ef8a9248ce2007932b0b211064a6445175fc3bb9056ba8`.
- Aggregate fixture-tree SHA-256: `9bea16d967510fe868e68bfad672b02b477802d63bfe191660d4a0a737602cba`.
- `benchmarks/SOURCES.md` SHA-256: `b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1`.
- The five aggregate corpus Git trees remain unchanged from PR #284: ngspice `699f294d0fc87274038a3e172764fbef8eabba5c`, classic `0415034d4a71644edc5d8cbc05fe24993feb06ab`, Xyce `da56eb29bfa63e6834d4923335fb41fb55a897ab`, corpus D `85c56dbef57304ef6d1871faa62f24cb505d7713`, corpus E `f1aad3d7785e4479fe45ff86e3094cf9d43a9fd7`.
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47.
- Both engines received the same bytes recorded by each fixture receipt. No fixture, source record, manifest, tolerance, or simulator package changed for this refresh.

## Aggregate result

- Deterministic outcome SHA-256: `05a0675e6e948ac23959c6804fcf91782035823f074f52336a0ca8983942f68a`.
- ngspice-47: 52 success, 9 failed, 39 unsupported.
- spice-ts: 28 success, 9 failed, 63 unsupported.
- Comparable results: 28 analyses across 18 fixtures.
- Matched signals: 253 absolute and 235 relative. Samples: 7,413,027 absolute and 7,410,627 relative. Exact-zero references excluded from relative metrics: 2,400.
- Worst per-signal absolute max: `90.09458674829554`; absolute RMS: `59.660512653520904`.
- Worst per-signal relative max: `273625086.91875815`; relative RMS: `131055144.90676585`.
- Single-run descriptive runtime sums: ngspice `10149.156 ms`; spice-ts `7401.295 ms`. These are diagnostics, not a speed comparison.

## Transition and loss accounting

- No fixture moved. Both engines retained every prior success, failure, and unsupported classification.
- Comparable analysis, fixture, signal, sample, exclusion, and matched-point envelope counts are unchanged from PR #284.
- PR #274 added bounded voltage-input pole-zero support. The aggregate corpus `.pz` cards use current-input forms, so that merge does not make an existing aggregate fixture newly comparable.
- No new gap appeared, so no new issue was filed.
- All 48 non-success ngspice rows and all 72 non-success spice-ts rows remain published per fixture in `benchmarks/aggregate-report.json` and `benchmarks/AGGREGATE_PARITY.md`, including every retained parser/device/analysis unsupported case and the existing classic execution failures tracked by #280.

## Commands and results

```text
pnpm install --frozen-lockfile
PASS, lockfile unchanged; 368 packages reused.

pnpm build
PASS, all workspace builds completed.

pnpm lint
PASS, all workspace TypeScript checks completed.

pnpm test
PASS, including core 931, protocol 17, circuit-json 8 plus packed consumer, MCP 35 plus packed consumer, UI 209, WASM 30 plus packed consumer, showcase 20, examples workflows 2, and comparison harness 13.

pnpm bench:accuracy
PASS, all eight circuits completed; seven checks passed and the retained BJT CE bias warning was 2.61%.

pnpm exec tsx --test benchmarks/aggregate-report.test.ts
PASS, 10/10 tests.

pnpm exec tsx benchmarks/aggregate-report.ts --check
PASS, 100 fixtures, 28 comparable analyses, deterministic outcome 05a0675e6e948ac23959c6804fcf91782035823f074f52336a0ca8983942f68a.

git diff --check
PASS.
```

Exact-head CI and independent review are recorded on PR #296's delivery.

## `/poteto-mode` receipt

RED was 9/10 focused tests because the committed report still referenced issue #209 and PR #213 instead of the latest accepted issue #275 / PR #284 baseline. GREEN is 10/10. The smallest retained change advances only the aggregate transition baseline, regenerates the JSON and Markdown from unchanged fixtures, records that no fixture moved, and adds this dedicated receipt.