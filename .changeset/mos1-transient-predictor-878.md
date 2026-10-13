---
"@spice-ts/core": patch
---

Level-1 MOSFETs now start every transient timepoint from the ngspice-47 mos1load.c predictor (MODEINITPRED): the first Newton iterate is linearised at terminal voltages extrapolated from the two previous accepted points, and limited against the accepted junction voltages, also when a step is retried. Before, it was linearised at the previous solution, so on the 10k-node CMOS inverter chain scaling deck 133 of 213 timepoints took 3 Newton iterations where ngspice-47 takes 2. Transient Newton iterations drop from 599 to 466 (ngspice-47: 483); every timepoint now takes ngspice-47's count, except 17 settled points that converge on the first iterate, which ngspice never accepts. Waveforms move by at most 5 nV and stay within 0.63 mV of ngspice-47, as before (#878).
