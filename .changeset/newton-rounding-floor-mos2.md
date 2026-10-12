---
"@spice-ts/core": patch
---

Accept a Newton solve that cycles between adjacent doubles once the node test passes. Below ABSTOL 1e-18, the MOS2 mos2conv.c test can never pass on such a pair, so the CMOS inverter DC sweep failed to converge where ngspice-47 converges.
