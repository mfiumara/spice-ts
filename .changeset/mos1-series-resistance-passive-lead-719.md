---
"@spice-ts/core": patch
---

MOS1 (LEVEL=1): model the drain/source series resistances like ngspice-47 mos1set.c/mos1temp.c: a given `RD`/`RS` wins (0 means none), otherwise `RSH × NRD` / `RSH × NRS` with `NRD = NRS = 1` square by default, divided by the instance `M`, with drain/source prime nodes only for non-zero values (#729). Before, they were silently dropped. C and L cards now take an unlabeled number right after the model name as the capacitance/inductance (`C1 a b CMOD 1pf`), like ngspice-47 INPdevParse (#730).
