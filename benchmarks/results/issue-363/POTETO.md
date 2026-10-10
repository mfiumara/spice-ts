# Poteto design receipt

## Existing flow

`simulate()` validates `.disto`, solves the DC operating point, and previously returned exact zeros for ideal-linear devices. AC already had the required `G+jωC` assembly and complex sparse solver. The diode model already owned DC current and dynamic charge behavior.

## Candidate A

Extend the existing distortion driver. Extract a reusable linearized frequency system from AC. Keep analytic current and charge Taylor coefficients on `Diode`. Preserve the public `DistortionResult` shape and the ideal-linear zero fast path.

Tradeoff: the distortion driver contains the bounded Volterra product algebra, but device equations remain with the device.

## Candidate B

Add a generic nonlinear-device tensor interface to `DeviceModel`, then make every future nonlinear device supply derivative tensors to one perturbation engine.

Tradeoff: this gives a broader extension point, but issue #363 has one supported nonlinear device. The interface would authorize shapes and concepts that have no second implementation or benchmark.

## Decision

Candidate A is smaller and keeps the unsupported boundary visible. The caller remains one `solveDistortion(compiled, analysis, options, dcSolution)` operation. `Diode.distortionCoefficients()` supplies `I''/2`, `I'''/6`, `Q''/2`, and `Q'''/6`; the analysis module stamps only product-frequency forcing currents.

The target fixture is two-tone even though the issue summary says single-tone. The implemented contract covers both single-tone harmonics and the exact fixture products. F2 is fixed at `f2overf1 * startFreq`, matching ngspice.

## Data shape

- `LinearizedFrequencySystem`: system size and `solve(omega, complexRhs)`
- `DiodeDistortionCoefficients`: `current2`, `current3`, `charge2`, `charge3`
- `ComplexACRHS`: split real and imaginary `Float64Array` values
- existing `DistortionResult`: frequency axis plus per-product node and branch vectors

## Boundary

Only `IS`, `TT`, `CJO`, and the programmatic `CJ0` alias are accepted as supplied diode fields. Defaults required by the fixture are fixed and documented. Geometry, RS, temperature overrides, other diode fields, other nonlinear devices, non-DEC sweeps, stepping, and streaming reject explicitly.

## Verification

The unchanged fixture test was RED on the former diode rejection, then GREEN on all 101 F1 points and three products. A separate RED/GREEN cycle covered single-tone diode harmonics. Another RED/GREEN cycle covered explicit unsupported diode model, geometry, and RS forms. The focused verifier compares every complex vector against ngspice-47 and enforces a shared 0.005 maximum-relative-error ceiling.
