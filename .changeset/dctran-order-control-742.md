---
"@spice-ts/core": patch
---

Transient step control now follows ngspice-47 dctran.c at the start of a run and after order-1 steps (#742). The first timepoint is accepted without a truncation check, so its step is repeated once before the step grows (spice-ts used to double it straight away). After every other Backward Euler step, CKTtrunc is repeated at order 2: the next step is that order-2 bound, and the order goes back to 2 only if the bound is above 1.05 x the step. With `.tran ... UIC`, a breakpoint is set at TSTEP, and the first step no longer has a 1 fs floor.

On the MOS1 inverter corpus-g MPDE/invert1 (RELTOL 1e-4), the first 122 accepted points now match ngspice-47's (only 2 did before). i(vin1) is 0.045 of the peak away from ngspice-47, down from 0.177, and 0.060 away from fine-step ngspice, against ngspice's own 0.056 (measured with the #735 MOS1 RD/RS fix applied). Accepted point counts on the Xyce rc_osc, diode and RLC decks are now ngspice-47's (59, 129, 1019). One thing is unchanged: when Newton fails, spice-ts cuts the step but does not drop to order 1 like ngspice. On mosamp2 that drop doubles the error against fine-step ngspice, because spice-ts's Newton fails at different points than ngspice's.
