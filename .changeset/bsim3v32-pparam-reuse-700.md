---
"@spice-ts/core": patch
---

BSIM3 VERSION=3.2 / 3.2.2: reproduce the ngspice-47 b3v32temp.c size-record (`pParam`) reuse (#700). An instance whose L/W repeats a geometry of its model now takes vth0/vfb/vfbzb/u0temp from the last newly-seen geometry in ngspice's (reverse netlist) instance order, as ngspice does; before, spice-ts used the instance's own record, up to 14% drain-current difference on alternating geometries of the corpus-f TSMC 0.25u card. 3.2.3, 3.2.4 and 3.3.0 are unchanged.
