# poteto-mode receipt

## Existing flow

`simulate()` validates the bounded noise device set, solves the DC operating point, and calls `solveNoise()`. Differential voltage output is represented by `outputNode` plus `outputReferenceNode`; `solveNoise()` subtracts the two solved node voltages for gain and every source contribution. The differential slice intentionally supports resistor thermal noise only. Its guard rejects diode, BJT, and MOSFET instances before source assembly, but omits the implemented `JFET` class, so an NJF deck silently reports resistor-only noise.

## Designs considered

1. Add `JFET` to the explicit semiconductor guard beside diode, BJT, and MOSFET.
2. Reject every non-resistor device when differential output is requested.

Chosen: extend the explicit noisy-semiconductor guard. Ideal independent and controlled sources, capacitors, and inductors are noiseless circuit infrastructure and must remain usable in resistor-noise transfer networks. The guard remains a stable `InvalidCircuitError` with the existing message: `.noise differential voltage output only supports resistor noise`.

## TDD checkpoint

The reviewer NJF deck was first reproduced unchanged: 7 points and `outputNoiseDensity[0] = 5.028812192176008e-9`. A focused parameterized regression then covered diode, BJT, MOS1, and JFET with the same exact structured error. RED was 1 failed and 47 passed: only JFET unexpectedly resolved with the omitted-noise result.

## Benchmark checkpoint

The dedicated unsupported matrix covers each implemented semiconductor family relevant to the bounded noise path: diode, BJT, MOS1, BSIM3, and JFET. The accepted resistor fixture, its public provenance and SHA-256, ngspice-47 reference execution, spectral/integrated metrics, and recorded losses remain unchanged.

## Bounds

Included: fail-closed differential-output rejection for JFET and the existing semiconductor classes, focused regression coverage, and the dedicated benchmark unsupported matrix.

Explicitly excluded: JFET noise implementation, broader device support, fixture adaptation, current-valued output, current-source referral, stepping, temperature cards, parser changes, and simulator orchestration changes.
