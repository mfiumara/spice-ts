---
"@spice-ts/core": patch
---

JFET: accept the p-channel `PJF` model type (ngspice-47 `type = -1` polarity for level 1 and level 2), the instance `TEMP=` parameter at the nominal 27 C (other values raise `UNSUPPORTED_TEMPERATURE` instead of silently simulating at 27 C), and J cards inside `.subckt` bodies, which were rejected with `Unsupported device card: 'J'` (#717). The JFET gate-junction thermal voltage now uses ngspice's `300.15 K * k/q` (0.0258642 V) instead of 0.02585 V, which put a forward-biased gate ~1% off ngspice-47. corpus-g PJFET_DC/pjfet-2108, PJFET_SWITCH/pjfet_tran and MEASURE/bad_dot_measure_line5 move from unsupported to matched.
