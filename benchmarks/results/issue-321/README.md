# Issue 321 aggregate parity refresh receipt

This receipt covers the 100-fixture aggregate run at `main` commit `4f1d71971f1b4c77a1de0f31c81f30bf924f6b1e`, after squash-merged PRs #310, #311, #313, #316, #317, #330, #331, #314, and #329. It makes no M1 completion, parity, speed, or superiority claim.

## Inputs and tools

- Base commit: `4f1d71971f1b4c77a1de0f31c81f30bf924f6b1e`.
- Previous accepted aggregate: issue #301, PR #312, head `ac7dc9d8edf034bf35f589d078126ddb84224c82`, deterministic outcome `68b0a9edd25c1fc5c89644397dedfa8ba2b6ebcbd1c247463887f6d4fec44369`.
- Aggregate corpus-tree SHA-256: `01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1`.
- `benchmarks/SOURCES.md` SHA-256: `b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1`.
- Ordered 100-fixture byte-set SHA-256: `ed8b373960cc1b7b7a926cf4b9efb156db1bf059dfd775ef6f3105acc8701b1b`, unchanged from PR #312.
- Corpus Git trees: ngspice `699f294d0fc87274038a3e172764fbef8eabba5c`, classic `4c9595e209ee58f0f2c36282684b9c8e69b91606`, Xyce `da56eb29bfa63e6834d4923335fb41fb55a897ab`, corpus D `85c56dbef57304ef6d1871faa62f24cb505d7713`, corpus E `f1aad3d7785e4479fe45ff86e3094cf9d43a9fd7`.
- The aggregate corpus-tree hash changed because PR #311 changed `benchmarks/corpus/classic/report.ts` and its test. The manifests and all 100 fixture files are byte-identical to PR #312.
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47.
- Both engines received the same recorded fixture bytes. No fixture, source record, manifest, or per-circuit tolerance changed.
- The final current-main sync added the scoped MOS test timeout from #330, the LTRA scope document from #331, current-source noise support from #314, and the LTRA baseline capture from #329. None changes an aggregate fixture or an analysis exercised by this report. `pnpm exec tsx benchmarks/aggregate-report.ts --check` reproduced the same deterministic outcome, so the generated JSON and Markdown were not regenerated.

## Aggregate result

- Deterministic outcome SHA-256: `26be9f80744c077c0bdb98fa5c6c9cffc8615c2e2589383507abd59fd6fed41b`.
- ngspice-47: 52 success, 9 failed, 39 unsupported. These totals did not change.
- spice-ts: 51 success, 3 failed, 46 unsupported. The previous totals were 36 success, 8 failed, 56 unsupported.
- Comparable results: 54 analyses across 39 fixtures, up from 40 analyses across 27 fixtures.
- Matched signals: 561 absolute and 535 relative. Samples: 7,959,622 absolute and 7,944,908 relative. Exact-zero references excluded from relative metrics: 14,714.
- Full worst per-signal envelope: absolute max `1169140310571.719`, absolute RMS `1169140310571.719`, relative max `2110199067.731876`, relative RMS `326930690.296368`.
- The absolute max and RMS come from `ngspice/vbic-common-emitter-ac` pole-zero signal `v(pole(1))`. The relative max comes from `classic/mos-memory-cell` transient signal `i(vwb)`. The relative RMS remains the prior `xyce/nmos-level1-dc` signal `v(2)` loss.
- Single-run descriptive runtime sums: ngspice `24921.976 ms`; spice-ts `21912.135 ms`. These are diagnostics, not a speed comparison.
- All 48 non-success ngspice rows and all 49 non-success spice-ts rows remain published per fixture. The JSON retains every engine error string and every per-signal max/RMS absolute and relative metric.

## Status transitions

All 15 status transitions are for spice-ts. No ngspice classification changed.

- `ngspice/mos6-inverter-transient`: failed to success after the accepted MOS model-card, capacitance, and Newton-step changes.
- `ngspice/mos-amplifier-transient`: failed to success after the same accepted MOS changes.
- `classic/mos6-inverter-chain`: failed to success after the same accepted MOS changes.
- `classic/mos-amplifier`: failed to success after the same accepted MOS changes.
- `classic/mos-memory-cell`: failed to success after the same accepted MOS changes.
- `ngspice/rc-lowpass-ac`: unsupported to success after accepted report-only POST option handling.
- `ngspice/vbic-common-emitter-ac`: unsupported to success after accepted pole-zero result emission.
- `classic/pole-zero-four-stage`: unsupported to success after accepted pole-zero result emission.
- `classic/pole-zero-three-stage`: unsupported to success after accepted pole-zero result emission.
- `classic/high-pass-pole-zero`: unsupported to success after accepted pole-zero result emission.
- `ngspice/schmitt-trigger`: unsupported to success after accepted classic BJT Q-card parsing.
- `classic/ecl-schmitt-trigger`: unsupported to success after accepted classic BJT Q-card parsing.
- `xyce/capacitor-rc-oscillator`: unsupported to success after accepted V() output-function handling.
- `xyce/diode-transient`: unsupported to success after accepted V() output-function handling.
- `xyce/rlc-transient`: unsupported to success after accepted I() output-function handling.

## Comparison transitions

- The five MOS convergence transitions add five transient comparisons.
- Classic BJT Q-card parsing adds two transient comparisons.
- POST handling adds AC and operating-point comparisons for `ngspice/rc-lowpass-ac`.
- Pole-zero result emission adds four pole-zero comparisons.
- V() and I() handling makes three Xyce fixtures successful. Only `xyce/rlc-transient` has common output signals and adds a comparison.
- Absolute matched signals increased from 371 to 561. Relative matched signals increased from 349 to 535.
- Absolute samples increased from 7,455,070 to 7,959,622. Relative samples increased from 7,451,932 to 7,944,908. Exact-zero exclusions increased from 3,138 to 14,714.
- The expanded set raises the absolute max/RMS and relative max. The larger errors are published losses, not hidden by a tolerance change.

## Commands and results

```text
pnpm install --frozen-lockfile
PASS, lockfile unchanged; 368 packages reused.

pnpm build
PASS, all workspace builds completed.

pnpm lint
PASS, all workspace TypeScript checks completed.

pnpm test
PASS, including core 984, protocol 17, circuit-json 8 plus packed consumer, MCP 35 plus packed consumer, UI 209, WASM 35 plus packed consumer, showcase 20, examples workflows 2, and comparison harness 14.

pnpm bench:accuracy
PASS, all eight circuits completed; seven checks passed and the retained BJT CE bias warning was 2.61%.

pnpm exec tsx --test benchmarks/aggregate-report.test.ts
PASS, 10/10 tests.

pnpm exec tsx benchmarks/aggregate-report.ts --check
PASS, 100 fixtures, 54 comparable analyses, deterministic outcome 26be9f80744c077c0bdb98fa5c6c9cffc8615c2e2589383507abd59fd6fed41b.

git diff --check
PASS.
```

Exact-head CI and independent review are recorded on the delivery PR.

## `/poteto-mode` receipt

RED was 9/10 focused tests because the committed report still referenced issue #296 and PR #297 instead of accepted issue #301 and PR #312. GREEN is 10/10. The retained change advances the baseline, records all 15 status transitions and the full error envelope, regenerates the aggregate artifacts from the same 100 fixture bytes, and adds this receipt.
