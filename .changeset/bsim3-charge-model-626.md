---
"@spice-ts/core": patch
---

BSIM3 (LEVEL=8/49, VERSION 3.3): replace the Meyer-style capacitance approximation with a port of the ngspice-47 b3ld.c charge model (capMod 0-3, XPART partitions, bias-dependent overlap, junction charge with temperature laws), integrated as terminal charges with the full nonreciprocal Jacobian. Fixes the adder_mos_circ supply current (#626) and the 6T SRAM write (#582).
