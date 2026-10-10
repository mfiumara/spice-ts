# poteto-mode receipt

## Existing flow

`BJT.noiseOperatingPoint()` computes the bounded level-1 collector and base currents used by the existing shot-noise generators. `solveNoise()` transfers each independent current-noise source through the shared complex MNA system and integrates every source separately with ngspice-compatible log-log integration. Positive `RB`, `RC`, and `RE` values are already expanded into physical resistors and retain their shared thermal-noise path.

## Designs considered

1. Add the ngspice level-1 flicker source beside the existing base shot-noise source, using the same internal base/emitter nodes and operating-point base current.
2. Fold flicker power into the base shot-noise density.

Chosen: a separate source. This mirrors ngspice's `BJTFLNOIZ` generator, preserves per-source integration behavior, and leaves collector/base shot and resistance thermal noise unchanged. The bounded density is `KF * abs(IB)^AF / frequency`.

## Throughput checkpoint

The blocking step was one RED focused test with ngspice-47 values. Device parameter resolution, source stamping, fixture provenance, and the identical-netlist receipt share the same KF/AF semantics, so the smallest safe unit was one serial slice rather than parallel edits to the same BJT/noise files.

## Bounds

Included: fixed 27 C, unstepped, level-1 BJT `KF >= 0` and `AF > 0` base-current flicker noise, existing collector/base shot noise, and existing `RB`/`RC`/`RE` thermal noise.

Explicitly excluded: temperature variation, `.step`, junction-capacitance noise, differential/current outputs, non-level-1 models, instance multiplicity, and broader Gummel-Poon forms including `CJE`, `CJC`, `RBM`, `IRB`, and `TF`.
