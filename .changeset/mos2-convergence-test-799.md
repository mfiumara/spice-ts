---
"@spice-ts/core": patch
---

MOSFET LEVEL=2 transient Newton now converges like ngspice-47 (#799): MOS2 runs the mos2conv.c device convergence test (drain and bulk currents predicted from the last load must match within RELTOL) and reports a DEVpnjlim-limited bulk junction (mos2load.c `Check`), as MOS1, MOS3 and MOS6 already did. Before, a timepoint could be accepted on node voltages alone, and slewing LEVEL=2 circuits depended on the step size instead of converging to ngspice.
