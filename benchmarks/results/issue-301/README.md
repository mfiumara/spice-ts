# Issue 301 aggregate parity refresh receipt

This receipt covers the unchanged 100-fixture aggregate run from current `main` after squash-merged PRs #298, #299, and #300. It makes no M1 completion, parity, milestone, speed, or superiority claim.

## Inputs and tools

- Base commit: `62690c3d7a172aedf4b1cc23678d15c6c5a953c7`.
- Previous accepted aggregate: issue #296, PR #297, head `602518710a6605e229821eff8b93b106b1cb0421`, deterministic outcome `05a0675e6e948ac23959c6804fcf91782035823f074f52336a0ca8983942f68a`.
- Aggregate fixture-tree SHA-256: `9bea16d967510fe868e68bfad672b02b477802d63bfe191660d4a0a737602cba`.
- `benchmarks/SOURCES.md` SHA-256: `b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1`.
- Corpus Git trees: ngspice `699f294d0fc87274038a3e172764fbef8eabba5c`, classic `0415034d4a71644edc5d8cbc05fe24993feb06ab`, Xyce `da56eb29bfa63e6834d4923335fb41fb55a897ab`, corpus D `85c56dbef57304ef6d1871faa62f24cb505d7713`, corpus E `f1aad3d7785e4479fe45ff86e3094cf9d43a9fd7`.
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47.
- Both engines received the same recorded fixture bytes. No fixture, source record, manifest, tolerance, or simulator package changed for this refresh.

## Aggregate result

- Deterministic outcome SHA-256: `68b0a9edd25c1fc5c89644397dedfa8ba2b6ebcbd1c247463887f6d4fec44369`.
- ngspice-47: 52 success, 9 failed, 39 unsupported. These totals did not change.
- spice-ts: 36 success, 8 failed, 56 unsupported. The previous totals were 28 success, 9 failed, 63 unsupported.
- Comparable results: 40 analyses across 27 fixtures, up from 28 analyses across 18 fixtures.
- Matched signals: 371 absolute and 349 relative. Samples: 7,455,070 absolute and 7,451,932 relative. Exact-zero references excluded from relative metrics: 3,138.
- Worst per-signal absolute max: `1158.4523167631219`; absolute RMS: `693.3260545761561`.
- Worst per-signal relative max: `739888253.1927755`; relative RMS: `326930690.296368`.
- Single-run descriptive runtime sums: ngspice `24558.679 ms`; spice-ts `14459.876 ms`. These are diagnostics, not a speed comparison.

## Status transitions

All 12 status transitions are for spice-ts.

- `ngspice/mos6-inverter-transient`: unsupported to failed. NOACCT parsing now reaches the retained timestep failure.
- `ngspice/jfet-vds-vgs`: unsupported to success. NOACCT parsing now permits DC and operating-point execution.
- `ngspice/rc-transient`: unsupported to success. NOACCT parsing now permits transient execution.
- `ngspice/mos-amplifier-transient`: unsupported to failed. NOACCT parsing now reaches the retained singular-matrix failure.
- `ngspice/mos6-simple-inverter-transient`: unsupported to success. NOACCT parsing now permits transient execution.
- `ngspice/hfet-inverter`: unsupported to failed. NOACCT parsing now reaches the retained singular-matrix failure.
- `ngspice/mesa-oscillator`: unsupported to failed. NOACCT parsing now reaches the retained singular-matrix failure.
- `classic/rca3040-wideband-amplifier`: failed to success. AC, DC, and transient analyses now complete after the accepted convergence fix.
- `xyce/nmos-level1-dc`: failed to success. Brace-comment text is no longer evaluated as an expression.
- `xyce/npn-dc`: failed to success. Brace-comment text is no longer evaluated as an expression.
- `xyce/pmos-level1-dc`: failed to success. Brace-comment text is no longer evaluated as an expression.
- `xyce/pnp-dc`: failed to success. Brace-comment text is no longer evaluated as an expression.

`ngspice/vbic-common-emitter-ac` remains unsupported because pole-zero analysis is unavailable, but its AC result is now comparable after NOACCT parsing. The newly exposed timestep and singular-matrix failures remain published losses under #76. All 48 non-success ngspice rows and all 64 non-success spice-ts rows are retained per fixture in the JSON and Markdown reports.

## Comparison transitions

- NOACCT handling added DC and operating-point comparisons for `jfet-vds-vgs`, AC for `vbic-common-emitter-ac`, and transient comparisons for `rc-transient` and `mos6-simple-inverter-transient`.
- Brace-comment parsing added one DC comparison for each of the four Xyce fixtures listed above.
- The RCA3040 fix added AC, DC, and transient comparisons.
- Absolute matched signals increased from 253 to 371. Relative matched signals increased from 235 to 349.
- Absolute samples increased from 7,413,027 to 7,455,070. Relative samples increased from 7,410,627 to 7,451,932. Exact-zero exclusions increased from 2,400 to 3,138.
- The larger comparison set raised every worst-case envelope value. The exact old and new values are recorded in `benchmarks/aggregate-report.json` and `benchmarks/AGGREGATE_PARITY.md`.

## Commands and results

```text
pnpm install --frozen-lockfile
PASS, lockfile unchanged; 368 packages reused.

pnpm build
PASS, all workspace builds completed.

pnpm lint
PASS, all workspace TypeScript checks completed.

pnpm test
PASS, including core 951, protocol 17, circuit-json 8 plus packed consumer, MCP 35 plus packed consumer, UI 209, WASM 35 plus packed consumer, showcase 20, examples workflows 2, and comparison harness 13.

pnpm bench:accuracy
PASS, all eight circuits completed; seven checks passed and the retained BJT CE bias warning was 2.61%.

pnpm exec tsx --test benchmarks/aggregate-report.test.ts
PASS, 10/10 tests.

pnpm exec tsx benchmarks/aggregate-report.ts --check
PASS, 100 fixtures, 40 comparable analyses, deterministic outcome 68b0a9edd25c1fc5c89644397dedfa8ba2b6ebcbd1c247463887f6d4fec44369.

git diff --check
PASS.
```

Exact-head CI and independent review are recorded on the delivery PR.

## `/poteto-mode` receipt

RED was 9/10 focused tests because the regenerated report still referenced issue #275 and PR #284 instead of the latest accepted issue #296 and PR #297 baseline. GREEN is 10/10. The retained change advances the baseline, records all 12 status transitions and every expanded error metric, regenerates the two aggregate artifacts from unchanged fixtures, and adds this receipt.
