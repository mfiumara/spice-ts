# Issue 249 bounded two-tone distortion receipt

## `/poteto-mode` receipt

The feature playbook, `pstack:how`, and `pstack:architect` were loaded before implementation. The existing parser, builder, simulator dispatch, distortion validator/result, public exports, tests, benchmark harness, and provenance record were traced end to end. Two independent design sketches were compared.

The chosen design keeps one `DistortionResult` and adds a typed product selector. Existing single-tone calls remain `voltage(node, 2 | 3)` and `current(branch, 2 | 3)`. Two-tone calls select `f1+f2`, `f1-f2`, or `2f1-f2`. This is smaller than separate result classes while still avoiding the incorrect collapse of the two distinct second-order products into one numeric order.

Blocking work was source inspection and a real ngspice-47 plot probe. The implementation, tests, and benchmark shared the distortion result surface and therefore remained one serial workstream. No independent code slices were safe to merge in parallel. No source waveform grammar was changed.

RED was committed first as `ff22141`. The focused package command reproduced seven expected failures while 845 unchanged tests passed. GREEN passes 25 focused tests. See `RED.md` and `GREEN.md`.

## Supported boundary

The accepted forms are:

- `.disto dec points start stop` with exactly one finite positive `DISTOF1`. Products are second and third harmonic.
- `.disto dec points start stop f2overf1` with finite `0 < f2overf1 < 1`, exactly one finite positive `DISTOF1`, and exactly one finite positive `DISTOF2`. Products are `f1+f2`, `f1-f2`, and `2f1-f2`.

As in ngspice-47, F1 is swept and F2 is fixed at `f2overf1 * startFreq`. The raw frequency axis for every two-tone plot is swept F1, not the derived product frequency. Ideal-linear devices have no nonlinear forcing terms, so every represented complex product is exactly zero.

Explicitly unsupported forms remain semiconductor nonlinear distortion, LIN/OCT sweeps, stepped or multiple distortion analyses, controlled/coupled/transmission-line/custom devices, multiple active excitations per tone, cross-mode product selectors, nonlinear coefficients, normalized distortion ratios, fundamental response, coincident-product summation, protocol v1, streaming, and ngspice-WASM result mapping.

## Public benchmark evidence

Command: `pnpm exec tsx benchmarks/distortion/compare.ts`

Reference: ngspice-47 on darwin arm64, Node v22.23.1. Both committed fixture byte streams were supplied unchanged to ngspice and spice-ts. Provenance, revision, BSD-3-Clause licence, adaptation, and retained notice are recorded in `benchmarks/SOURCES.md`.

| Case | SHA-256 | Products x matched F1 points | Max / RMS frequency absolute error | Max / RMS frequency relative error | Max / RMS complex-vector error | ngspice / spice-ts runtime |
|---|---|---:|---:|---:|---:|---:|
| single-tone | `27fdeadabcb9ea90237b47137953c7728afc2c73d6a10a7a7774b9366e6be0f4` | 2 x 31 | 1.1641532182693481e-9 / 3.5215829100592027e-10 Hz | 1.4760468084934277e-15 / 6.834797392873929e-16 | 0 / 0 | 16.602 / 3.155 ms |
| two-tone | `451cb5a4e2030dd33d1a9be68af1c29f78318f208df6e3f30ae5b65cbc8d46d3` | 3 x 31 | 1.1641532182693481e-9 / 3.5215829100592027e-10 Hz | 1.4760468084934277e-15 / 6.834797392873929e-16 | 0 / 0 | 40.265 / 1.210 ms |

The machine-readable primary receipt is `benchmarks/distortion/report.json`. It records each command, fixture byte count and hash, convergence telemetry, plot/vector/product order, per-vector max/RMS absolute and relative errors, runtimes, failures, losses, and unsupported forms.

Losses are retained. This proves only zero-valued ideal-linear harmonic/intermodulation parity. It does not implement or imply nonlinear distortion parity. Runtime process boundaries differ, so no speed claim is made.

## Verification

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm bench:accuracy`, `pnpm bench:disto`, the 25-test focused distortion run, and `git diff --check` passed. The full core suite reported 78 files and 853 tests passed. `bench:accuracy` retained the existing visible BJT CE bias approximation and completed successfully.
