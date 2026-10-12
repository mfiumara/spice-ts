---
'@spice-ts/core': patch
---

Scope a `.subckt` defined inside another `.subckt` to the enclosing subcircuit like ngspice-47, instead of failing with `Undefined subcircuit` (#826).
