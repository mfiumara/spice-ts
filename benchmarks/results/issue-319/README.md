# Issue #319 diode reverse-breakdown receipt

This receipt covers the bounded diode model slice implemented for issue #319. It does not claim complete PSpice/Xyce diode level-2 support. It contains two deliberately separate results: an unchanged Xyce regression receipt that is not identical-netlist ngspice parity, and a project-authored DC-equivalent fixture that is supplied byte-identically to spice-ts and ngspice-47.

## Reproduce

```sh
pnpm -C packages/core build
pnpm exec tsx --test benchmarks/results/issue-319/acceptance.test.ts
pnpm exec tsx benchmarks/results/issue-319/verify.ts --output benchmarks/results/issue-319/report.json
```

The verifier runs the unchanged public Xyce fixture through spice-ts, fetches the pinned Xyce committed gold output, checks both SHA-256 hashes, linearly interpolates the gold waveform onto spice-ts timestamps, and records max/RMS absolute and relative errors. It exits non-zero when any temperature step exceeds the fixture's `*COMP V(2) reltol=0.005` maximum-relative-error bound, including an over-bound interior sample even when both endpoints match. It also runs ngspice-47 on the unchanged fixture and records the retained parser loss.

Separately, it runs `benchmarks/diode-breakdown-temperature/dc-equivalent.cir` through both engines from one in-memory byte sequence. The DC fixture encodes the documented TBV law's effective BV at -55, 25, and 72 C in three branches, then compares all 17 matched sweep points for `V(cold)`, `V(nominal)`, `V(hot)`, and `I(VSWEEP)`. This isolates ngspice-compatible reverse-breakdown parity; native TBV movement remains covered by the unit tests and unchanged Xyce run.

## Source and licence

- Fixture: `benchmarks/corpus/xyce/fixtures/DIODE/Level2_Temp_Dep_Breakdown.cir`
- Fixture SHA-256: `9c52a577a2f0b0a7419160b6cd340894ed41ebc403023a3b3f1d809d171bee0e`
- Xyce gold output: `OutputData/DIODE/Level2_Temp_Dep_Breakdown.cir.prn` at Xyce_Regression revision `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`
- Gold SHA-256: `89a12adee6f8d43c56726b37f93b8286736042fa06492c8ccc1f7e70a09675f5`
- Licence: GPL-3.0-or-later. Provenance, redistribution decision, retained notice, and full licence are already recorded in `benchmarks/SOURCES.md` under “Xyce Regression Suite corpus C”.
- Fixture adaptation: none. The committed fixture bytes are unchanged.
- Per-circuit tolerance tuning: none.

The separately identified parity fixture is project-authored from the issue #319 acceptance contract, pinned at SHA-256 `02551eb619592aa1065cd549dbabd65e0916c3d223c2cbef7ecd6de72d4c8b65`, and distributed under the repository MIT licence. Its full provenance, revision, redistribution decision, DC-equivalence rationale, and command are recorded in `benchmarks/SOURCES.md` under “Bounded diode breakdown-temperature DC-equivalent parity fixture”.

## Supported contract

The bounded model supports `BV`, `IBV`, `TBV1`, `TBV2`, and `TNOM` for reverse breakdown. Effective breakdown voltage is:

`BV(T) = BV * (1 + TBV1 * (TEMP - TNOM) + TBV2 * (TEMP - TNOM)^2)`

`IBV` calibrates the reverse current at `BV(T)`. `.step TEMP LIST` applies the temperature through the shared device-temperature interface. The shared `finally` restoration from issue #318 restores the original device temperature after success or failure.

This slice does not implement full level-2 behavior. `NBV`, `IBVL`, `NBVL`, `TLEV`, `TRS1`, and `TRS2` are unsupported and each is rejected explicitly during circuit compilation. It also excludes temperature-adjusted saturation current through `EG`/`XTI`, avalanche noise, temperature-adjusted capacitance, and diode-instance `TEMP`/`DTEMP`. The unchanged source fixture's default-valued compatibility fields are not a claim of broader temperature semantics.

## Results

Measured on Apple M5 Pro, Node v22.23.1, spice-ts 0.3.0, and ngspice-47. Full machine and runtime details are in `report.json`.

| TEMP | spice-ts points | Xyce gold points | max abs V(2) error | RMS abs error | max relative error | RMS relative error |
|---:|---:|---:|---:|---:|---:|---:|
| -55 C | 21 | 69 | 8.3700e-5 V | 2.3771e-5 V | 1.1671e-5 | 3.3147e-6 |
| 25 C | 21 | 70 | 3.7175e-4 V | 1.0118e-4 V | 5.1307e-5 | 1.3958e-5 |
| 72 C | 21 | 70 | 4.8177e-4 V | 1.2953e-4 V | 6.6118e-5 | 1.7769e-5 |

Before this slice, issue #307 recorded no spice-ts transient result for this fixture. After this slice, all three temperature steps complete and track the pinned Xyce gold waveform.

### Byte-identical ngspice-47 DC-equivalent parity

Exact ngspice invocation: `ngspice -b -r <temporary-rawfile> <byte-identical copy of benchmarks/diode-breakdown-temperature/dc-equivalent.cir>`. The spice-ts side calls `simulate` with the same 588 bytes. Both engines converge on the exact `.dc VSWEEP 8 12 0.25` grid: 17 points in each engine, 17 aligned, zero excluded.

| Signal | max absolute error | RMS absolute error | max relative error | RMS relative error |
|---|---:|---:|---:|---:|
| `V(cold)` | 2.8849e-5 V | 8.8237e-6 V | 4.0166e-6 | 1.2285e-6 |
| `V(nominal)` | 3.9056e-5 V | 1.1898e-5 V | 5.3805e-6 | 1.6392e-6 |
| `V(hot)` | 4.6778e-5 V | 1.4226e-5 V | 6.4067e-6 | 1.9485e-6 |
| `I(VSWEEP)` | 1.1468e-7 A | 3.4940e-8 A | 3.0522e-5 | 9.5469e-6 |

Measured runtimes in the committed receipt are process-boundary measurements, not a speed claim. Every non-zero residual above is retained as a loss.

## Retained loss

ngspice-47 rejects the unchanged original Xyce deck before simulation because `.tran 0 1 0 100m` has a zero print step. The exact diagnostic is retained in `report.json`. That unchanged-fixture result is not represented as identical-netlist parity and is not replaced by an adapted Xyce deck; the separately sourced DC-equivalent fixture above is the only ngspice parity evidence.
