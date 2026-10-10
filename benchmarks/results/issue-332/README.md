# Issue 332 classic MOS transient receipt

This receipt closes the duplicate classic MOS convergence report in issue #332. The general simulator correction and focused regression test had already landed on `main` in PR #317 (`87a6205804328af1bc591fcf867e86df7a46fc25`, fixing #302) before issue #332 was opened. No additional simulator, fixture, parser, tolerance, manifest, or aggregate-report change is needed or included here.

It makes no waveform-parity, speed, milestone-completion, or superiority claim.

## Inputs and policy

- Pre-fix baseline: `7846a9cad753578e26a6e8de47bdadaafe760d3c`.
- Landed general fix: `87a6205804328af1bc591fcf867e86df7a46fc25`.
- Tools: spice-ts 0.3.0 and ngspice-47.
- Both engines received the same recorded fixture bytes.
- Fixture adaptation: none.
- Per-circuit tolerance tuning: none.
- Comparison grid: spice-ts, with linear interpolation of ngspice results.

| Fixture | Bytes | SHA-256 |
| --- | ---: | --- |
| `classic/mos6-inverter-chain` | 3,616 | `60f1f49e2f9ac1eccf6bbf717b3c177de885e1e2438b175db4a4360bfe080434` |
| `classic/mos-amplifier` | 1,371 | `d8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469` |
| `classic/mos-memory-cell` | 750 | `f63d832e7e63dd866e528d6e41eb653859243fdbfed48a83e55d9274e111859d` |

## RED and GREEN

The existing focused regression test was run against the pre-fix `mosfet.ts` from `7846a9c` while retaining the same test and fixture bytes:

- `mos6inv.cir`: RED, timestep too small at `t=3.071226114412814e-8`, `dt=6.362405548354911e-16`.
- `mosamp2.cir`: RED, singular zero pivot at matrix column 22, branch `vddn`.
- `mosmem.cir`: RED, timestep too small at `t=2.9772551177916905e-8`, `dt=7.331183713840461e-16`.

After restoring the landed implementation, the same three tests passed. The general fix resolves standard MOS aliases `VT0`, `KC`, and `LAMBDA0`, limits runaway MOS terminal-voltage Newton steps, and stamps model-card overlap and bulk-junction capacitances. The implementation contains no fixture identity, circuit name, or per-circuit tolerance branch.

## Outcome transitions and ngspice-47 comparison

All three unchanged fixtures transition from spice-ts `failed/failed` to `success/converged`. ngspice-47 remains `success/converged` for all three.

Absolute error is measured after linear interpolation of ngspice onto the spice-ts transient grid. Values below are the worst voltage and current signals, so the retained waveform losses are explicit.

| Fixture | ngspice points/signals | spice-ts points/signals | Aligned / excluded | Worst voltage max / RMS | Worst current max / RMS |
| --- | ---: | ---: | ---: | --- | --- |
| `mos6-inverter-chain` | 315 / 44 | 3,760 / 44 | 3,760 / 0 | `v(43)` 5.004404046 / 1.151354762 V | `i(vdd)` 7.948289693e-4 / 3.308232702e-4 A |
| `mos-amplifier` | 2,429 / 24 | 1,835 / 24 | 1,834 / 1 | `v(6)` 4.754337741 / 2.220158407 V | `i(vin)` 7.174916518e-3 / 2.516007269e-4 A |
| `mos-memory-cell` | 150 / 13 | 158 / 13 | 158 / 0 | `v(8)` 10.313158829 / 9.885266343 V | `i(vwb)` 22496.748086548 / 1789.745181052 A |

The large voltage and current errors remain model-parity losses. This receipt claims execution and convergence only.

## Verification

- `pnpm install --frozen-lockfile`: PASS, lockfile unchanged and 368 packages reused.
- Focused RED at the pre-fix implementation: PASS, all three expected failures reproduced.
- Focused GREEN at current `main`: PASS, 3/3.
- Native classic report: PASS, ngspice-47 19/20 success, spice-ts 13/20 success, 16 analyses compared. The three scoped fixtures are success/converged in both engines.
- `pnpm build`: PASS.
- `pnpm lint`: PASS.
- `pnpm test`: PASS, including core 82 files and 984 tests, plus all workspace and comparison-harness tests.
- `pnpm bench:accuracy`: PASS, all eight circuits completed. Seven checks passed and the retained BJT CE bias warning was 2.61%.
- `pnpm exec tsx --test benchmarks/aggregate-report.test.ts`: PASS, 10/10.
- `pnpm exec tsx benchmarks/aggregate-report.ts --check`: blocked by the pre-existing aggregate fixture-tree provenance change, observed `01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1`. This scoped PR does not edit the aggregate report.
- `git diff --check`: PASS.

The exact PR head SHA and required CI receipts are recorded on the delivery PR and independent review.
