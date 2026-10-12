---
"@spice-ts/core": patch
---

Transient Newton now follows three more ngspice-47 rules (#818). Convergence also tests branch currents, as niiter.c NIconvTest does: RELTOL times the larger iterate plus ABSTOL. The BJT runs its bjtconv.c convergence test in transient analysis too, on collector and base currents that include the integrated qbe/qbc terms. On the first iterate of a timepoint, the BJT extrapolates vbe and vbc (bjtload.c MODEINITPRED). It then limits every iterate against the previous one with ngspice-47's DEVpnjlim. The ECL Schmitt trigger (corpus-h xictools schmitt.cir) now crosses its regenerative edge in ngspice's single 10 ns step. Its worst error against ngspice-47 falls from 0.723 to 0.107 (i(vin)), and its voltages from 0.56 to 0.005 of peak.
