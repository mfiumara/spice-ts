# Issue 275 aggregate parity refresh receipt

This receipt covers the unchanged 100-fixture aggregate run after PRs #257, #258, #262, #270, and #272 merged. It makes no M1 completion, parity, or speed claim.

## Inputs and tools

- Base commit: `26209e640451aa98db1faef85a3d492ad1d68a93`.
- Aggregate fixture-tree SHA-256: `9bea16d967510fe868e68bfad672b02b477802d63bfe191660d4a0a737602cba`.
- `benchmarks/SOURCES.md` SHA-256: `b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1`.
- The five aggregate corpus Git trees match accepted PR #213 exactly: ngspice `699f294d0fc87274038a3e172764fbef8eabba5c`, classic `0415034d4a71644edc5d8cbc05fe24993feb06ab`, Xyce `da56eb29bfa63e6834d4923335fb41fb55a897ab`, corpus D `85c56dbef57304ef6d1871faa62f24cb505d7713`, corpus E `f1aad3d7785e4479fe45ff86e3094cf9d43a9fd7`.
- The source catalogue changed from SHA-256 `a426f7636c0ea8559a6c7961270f518406e4529f336d3f622931c7d9f0918873` at PR #213 only through later additive benchmark records. The 100 aggregate fixture source and licence records were not edited.
- Apple M5 Pro, Darwin 27.0.1 arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47.
- Both engines received the same bytes recorded by each fixture receipt. No fixture, tolerance, manifest, or source record was changed for this refresh.

## Aggregate result

- Deterministic outcome SHA-256: `2c5abd0d6ffb637d98ef8a9248ce2007932b0b211064a6445175fc3bb9056ba8`.
- ngspice: 52 success, 9 failed, 39 unsupported. No status transition.
- spice-ts: 28 success, 9 failed, 63 unsupported. The report publishes all 19 transitions from PR #213.
- Comparable results: 28 analyses across 18 fixtures, up from 20 analyses across 13 fixtures.
- Matched signals: 253 absolute and 235 relative. Samples: 7,413,027 absolute and 7,410,627 relative. Exact-zero references excluded from relative metrics: 2,400.
- Worst per-signal absolute max: `90.09458674829554`; absolute RMS: `59.660512653520904`.
- Worst per-signal relative max: `273625086.91875815`; relative RMS: `131055144.90676585`.
- Single-run descriptive runtime sums: ngspice `10199.135 ms`; spice-ts `7428.371 ms`. These are diagnostics, not a speed comparison.
- The lower absolute envelope is caused by the RCA3040 regression removing its prior AC comparison. It is not an accuracy improvement.
- The higher relative envelope comes from `v(4)` in the newly comparable corpus-E MOS1 inverter transient.
- Every failed and unsupported row remains in `benchmarks/aggregate-report.json` and `benchmarks/AGGREGATE_PARITY.md`.

## Newly exposed losses

- `classic/diode-distortion` moved from unsupported to failed because execution now reaches the bounded distortion implementation, which rejects the diode. Existing issue #75 tracks broader distortion coverage.
- `classic/mos6-inverter-chain` and `classic/mos-memory-cell` stop with timestep-too-small failures.
- `classic/mos-amplifier` stops on a singular matrix at `vddn`.
- `classic/rca3040-wideband-amplifier` regressed from success to failed operating-point convergence and lost three comparisons.
- New issue https://github.com/mfiumara/spice-ts/issues/280 tracks the three newly reached classic execution failures and the RCA3040 regression.

## Commands and results

```text
pnpm install --frozen-lockfile
PASS, lockfile unchanged; 368 packages reused.

pnpm build
PASS, all workspace builds completed.

pnpm lint
PASS, all workspace TypeScript checks completed.

pnpm test
PASS, including core 918, protocol 17, circuit-json 8 plus packed consumer, MCP 31 plus packed consumer, UI 209, WASM 28 plus packed consumer, showcase 20, examples workflow 1, and comparison harness 13.

pnpm bench:accuracy
PASS, all eight circuits completed; seven checks passed and the retained BJT CE bias warning was 2.61%.

pnpm exec tsx --test benchmarks/aggregate-report.test.ts
PASS, 10/10 tests.

pnpm exec tsx benchmarks/aggregate-report.ts --check
PASS, 100 fixtures, 28 comparable analyses, deterministic outcome 2c5abd0d6ffb637d98ef8a9248ce2007932b0b211064a6445175fc3bb9056ba8.

git diff --check
PASS.
```

## `/poteto-mode` receipt

The data shape adds one provenance object and explicit status and metric transition ledgers to the existing aggregate report. RED was 8/10 focused tests, with failures for the stale PR #201 baseline and missing provenance hashes. GREEN is 10/10. The smallest retained change hashes the five existing aggregate corpus trees and source catalogue, checks those hashes during generation, publishes all observed transitions, and files issue #280 instead of changing simulator code or fixtures.
