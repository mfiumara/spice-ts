---
"@spice-ts/core": patch
---

Mutual inductance `K` cards inside a `.subckt` are expanded like ngspice-47: the coupled inductor names get the instance prefix and the coupling is evaluated in the instance's parameter scope. A `K` card may now also precede its inductors, at top level or in a subcircuit (#739).
