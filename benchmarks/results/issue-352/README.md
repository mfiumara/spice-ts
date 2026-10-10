# Issue 352 bounded VBIC FO DC parity

This receipt covers the unchanged public ngspice `tests/vbic/FO.cir` fixture. It adds only the nominal-temperature NPN LEVEL=4 equations and parameters needed by that fixture. It does not claim broad VBIC support.

## RED and GREEN

The RED commit is `96eb20b`. The focused test used the unchanged 492-byte fixture with SHA-256 `de57231ef8879e785b07068db662bfa5ecfde8734011b88b09f319b826242e92` and failed before analysis with `Unsupported bounded BJT model parameter: 'IBEI'`. It produced 0 analysis points and 0 comparable signals.

The GREEN run completes all 707 Cartesian DC points. It reports 707 accepted solves, 0 rejected solves, and no convergence failure. The nested grid is primary-fast:

- `VC`: 0 V through 5 V in 0.05 V steps, 101 points per outer step.
- `VB`: 0.7 V through 1 V in 0.05 V steps, 7 outer points.
- Total: 101 x 7 = 707 points.

## Identical-input comparison

`verify.ts` passes the same immutable fixture bytes to both engines. ngspice runs as one native subprocess with an isolated temporary HOME and ASCII rawfile. spice-ts runs as one in-process `@spice-ts/core` simulation. Timings are single wall-clock observations and are descriptive only.

Measured on Apple M5 Pro arm64 macOS with Node v22.23.1 and ngspice-47:

| Engine | Status | Points | Runtime |
| --- | --- | ---: | ---: |
| RED spice-ts | unsupported at `IBEI` | 0 | not compared |
| ngspice-47 | converged | 707 | 48.364 ms |
| GREEN spice-ts | converged, 707 accepted and 0 rejected solves | 707 | 181.780 ms |

The compared signals are `i(vc)` and `i(vb)`. Relative errors exclude only reference magnitudes at or below `1e-15`; this run excluded no samples.

| Signal | Samples | Max abs. error | RMS abs. error | Max rel. error | RMS rel. error |
| --- | ---: | ---: | ---: | ---: | ---: |
| `i(vc)` | 707 | 6.714775e-6 A | 2.880007e-7 A | 6.405032e-4 | 3.599353e-5 |
| `i(vb)` | 707 | 3.771583e-6 A | 2.239838e-7 A | 1.239711e-3 | 8.043939e-5 |

## Exact supported contract

Supported:

- NPN `LEVEL=4` only.
- DC operating point and DC sweep analyses only.
- Active parameters `IS`, `IBEI`, `IBEN`, `IBCI`, `IBCN`, `ISP`, `RCX`, `RCI`, `RBX`, `RBI`, `RE`, `RS`, `RBP`, `VEF`, `VER`, `IKF`, `IKR`, `IKP`, `VO`, `GAMM`, `HRCF`, `AVC1`, and `AVC2`.
- Isothermal forward/reverse transport, Early and high-current rolloff, BE/BC junction currents, parasitic substrate transport, quasi-saturation collector resistance, avalanche multiplication, and explicit external/intrinsic resistances.
- The fixture's charge and thermal parameters are accepted as DC-inert: `CJE`, `CJC`, `CJEP`, `CJCP`, `QCO`, `TF`, `TR`, `TD`, `ITF`, `XTF`, and `RTH`.

Explicitly unsupported:

- PNP LEVEL=4.
- Any unlisted VBIC model parameter.
- AC, transient, noise, distortion, sensitivity, transfer-function, and pole-zero analyses.
- Dynamic charge, self-heating, and temperature-dependent equations.

The aggregate generated files are intentionally unchanged in this implementation PR. The aggregate lane must record the `ngspice/vbic-fo` status transition after this PR merges, so the aggregate `--check` is expected to report that deferred refresh rather than being hidden here.

Adjacent unsupported parameters, PNP polarity, AC, and transient forms have deterministic focused tests. Unsupported forms are not silently ignored.

## Reproduction

```text
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
pnpm bench:accuracy
pnpm -C packages/core exec vitest run src/devices/bjt.test.ts
pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-352/verify.ts --check
pnpm exec tsx benchmarks/aggregate-report.ts --check
git diff --check
```

The verifier's exact ngspice command boundary is `ngspice -b -r <temporary-rawfile> <byte-identical-fixture>`. `report.json` is the machine-readable source for commands, process boundaries, contract, grid, convergence, timings, errors, and retained losses.
