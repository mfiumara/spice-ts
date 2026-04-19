# @spice-ts/ui

## 0.2.0

### Minor Changes

- 752f0ad: Add `SchematicView` React component — renders a `CircuitIR` as a vector schematic with automatic node ranking, column packing, and orthogonal wire routing. Supports V/I/R/C/L/D/M/Q/E/G symbols, feedback-cap arches above opamp loops, series output caps in inverting buck-boost converters, and directional diode flipping based on net ranks. Exported from `@spice-ts/ui/react` alongside the existing waveform viewers.
