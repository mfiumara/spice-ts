---
'@spice-ts/core': patch
---

Accept the PSpice resistor model type `.model <name> RES(...)` used by vendor libraries. Like ngspice-47 (inpdomod.c), `RES` is the same Resistor model as `R`: model `R` is the default resistance when the instance gives none, and `TC1`/`TC2` are the model temperature coefficients (#823).
