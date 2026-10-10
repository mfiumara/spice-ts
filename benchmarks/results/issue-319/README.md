# Issue #319 diode reverse-breakdown receipt

This receipt covers the bounded diode model slice implemented for issue #319. It does not claim complete PSpice/Xyce diode level-2 support or ngspice parity.

## Reproduce

```sh
pnpm -C packages/core build
pnpm exec tsx benchmarks/results/issue-319/verify.ts --output benchmarks/results/issue-319/report.json
```

The verifier runs the unchanged public Xyce fixture through spice-ts, fetches the pinned Xyce committed gold output, checks both SHA-256 hashes, linearly interpolates the gold waveform onto spice-ts timestamps, and records max/RMS absolute and relative errors. It also runs ngspice-47 on the unchanged fixture and records the retained parser loss.

## Source and licence

- Fixture: `benchmarks/corpus/xyce/fixtures/DIODE/Level2_Temp_Dep_Breakdown.cir`
- Fixture SHA-256: `9c52a577a2f0b0a7419160b6cd340894ed41ebc403023a3b3f1d809d171bee0e`
- Xyce gold output: `OutputData/DIODE/Level2_Temp_Dep_Breakdown.cir.prn` at Xyce_Regression revision `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`
- Gold SHA-256: `89a12adee6f8d43c56726b37f93b8286736042fa06492c8ccc1f7e70a09675f5`
- Licence: GPL-3.0-or-later. Provenance, redistribution decision, retained notice, and full licence are already recorded in `benchmarks/SOURCES.md` under “Xyce Regression Suite corpus C”.
- Fixture adaptation: none. The committed fixture bytes are unchanged.
- Per-circuit tolerance tuning: none.

## Supported contract

The bounded model supports `BV`, `IBV`, `TBV1`, `TBV2`, and `TNOM` for reverse breakdown. Effective breakdown voltage is:

`BV(T) = BV * (1 + TBV1 * (TEMP - TNOM) + TBV2 * (TEMP - TNOM)^2)`

`IBV` calibrates the reverse current at `BV(T)`. `.step TEMP LIST` applies the temperature through the shared device-temperature interface. The shared `finally` restoration from issue #318 restores the original device temperature after success or failure.

This slice does not implement full level-2 behavior. `NBV`, `IBVL`, `NBVL`, `TLEV`, `TRS1`, and `TRS2` are unsupported. It also excludes temperature-adjusted saturation current through `EG`/`XTI`, avalanche noise, temperature-adjusted capacitance, and diode-instance `TEMP`/`DTEMP`. Existing model-card parsing remains generic, so excluded model fields may be accepted syntactically without gaining those semantics.

## Results

Measured on Apple M5 Pro, Node v22.23.1, spice-ts 0.3.0, and ngspice-47. Full machine and runtime details are in `report.json`.

| TEMP | spice-ts points | Xyce gold points | max abs V(2) error | RMS abs error | max relative error | RMS relative error |
|---:|---:|---:|---:|---:|---:|---:|
| -55 C | 21 | 69 | 8.3700e-5 V | 2.3771e-5 V | 1.1671e-5 | 3.3147e-6 |
| 25 C | 21 | 70 | 3.7175e-4 V | 1.0118e-4 V | 5.1307e-5 | 1.3958e-5 |
| 72 C | 21 | 70 | 4.8177e-4 V | 1.2953e-4 V | 6.6118e-5 | 1.7769e-5 |

Before this slice, issue #307 recorded no spice-ts transient result for this fixture. After this slice, all three temperature steps complete and track the pinned Xyce gold waveform.

## Retained loss

ngspice-47 rejects the unchanged original deck before simulation because `.tran 0 1 0 100m` has a zero print step. Therefore this receipt makes no ngspice parity claim and performs no adapted-deck or “equivalent” identical-netlist comparison. The exact ngspice diagnostic is retained in `report.json`.
