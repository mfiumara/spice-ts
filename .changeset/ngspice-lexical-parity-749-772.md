---
'@spice-ts/core': patch
---

Read netlist numbers and the `gnd` node as ngspice-47 does. Numeric literals are now built like ngspice's INPevaluate, as `sign * mantissa * pow(10, exponent)` with the scale factor folded into the exponent (`1.3u` is 1.2999999999999998e-6, `0.05n` is 4.9999999999999995e-11), so a source sampled exactly at a PWL `R=` wrap or other discontinuity lands on the same side as in ngspice (#749). A node named `gnd` (any case) is ground, as in ngspice-47's `inp_fix_gnd_name`: every `gnd` after the first token that is delimited by whitespace, `(`, `)` or `,` becomes node `0`, including in `.subckt` port lists, subcircuit bodies and `v(in,gnd)`; a `gnd` that ends a card stays a global `gnd` node (#772). Netlist export writes the shortest number that reads back to the same value.
