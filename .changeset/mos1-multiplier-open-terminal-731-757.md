---
"@spice-ts/core": patch
---

MOS1 (LEVEL=1): the instance multiplier `M` now scales the device like ngspice-47 mos1load.c/mos1temp.c: Beta, the bulk junction saturation currents (and their critical voltages), the Meyer oxide capacitance, the CGSO/CGDO/CGBO overlaps and the CBD/CBS/CJ/CJSW junction capacitances, with the NLEV=2 flicker noise divided by `M` as in mos1noi.c (#731). Before, `M` was silently ignored outside the series resistances. `RD=0` (`RS=0`) given together with a non-zero `RSH` and non-zero `NRD` (`NRS`) now leaves that terminal open, as ngspice-47 does (mos1set.c creates the prime node, mos1temp.c gives it zero conductance) (#757); before, spice-ts shorted it.
