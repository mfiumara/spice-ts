---
"@spice-ts/core": patch
---

MOSFET levels 1 and 6 now run the ngspice-47 device convergence test (mos1conv.c, mos6conv.c) in DC and transient Newton: the drain and bulk currents predicted at the new solution, with the transient junction charge currents folded in, must match the last load within RELTOL. Level 6 also bounds the transient step with MOS6trunc (CKTterr on the Meyer gate charges) instead of the node-voltage LTE, so `mos6inv.cir` takes 311 timepoints like ngspice-47's 315 instead of 830 (#479).
