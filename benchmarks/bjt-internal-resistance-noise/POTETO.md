# poteto-mode receipt

## Existing flow

`Circuit.compile()` expands physical parasitics before node allocation. Expanded resistors use the normal `Resistor` DC/AC stamp and the shared resistor thermal-noise source in `solveNoise()`. `BJT.noiseOperatingPoint()` supplies the existing collector/base shot-noise currents.

## Designs considered

1. Expand positive finite `RB`, `RC`, and `RE` model values into series resistor descriptors and move the level-1 BJT terminals to deterministic internal nodes.
2. Add private internal-node allocation plus duplicate resistance and thermal-noise stamps inside `BJT` and `solveNoise()`.

Chosen: descriptor expansion. It reuses one established resistor implementation for bias, small-signal transfer, and thermal noise. It adds no public API and keeps collector/base shot-noise generation unchanged. The tradeoff is that deterministic `Q1.rb`, `Q1.rc`, and `Q1.re` nodes appear in compiled results, matching the repository's existing parasitic-expansion convention.

## Throughput checkpoint

The blocking step was a RED test against ngspice-47 for each resistance. Implementation and fixture work share `BJT` model semantics, so parallel code-writing would risk conflicting assumptions. The smallest safe unit is one serial slice covering parameter resolution, descriptor expansion, noise allow-listing, and one identical-netlist comparison.

## Bounds

Included: fixed 27 C, unstepped, level-1 `RB`/`RC`/`RE` thermal noise plus the existing collector/base shot noise.

Explicitly excluded: `KF`/`AF`, junction capacitances, temperature cards or sweeps, `.step`, differential or current outputs, non-level-1 models, and broader Gummel-Poon resistance forms such as `RBM`/`IRB`.
