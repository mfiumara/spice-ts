---
'@spice-ts/core': patch
---

Transient steps integrate the selected step (ngspice-47 CKTdelta) instead of `nextTime - time`, so accepted times no longer drift by ulps from ngspice's. TXL/CPL picosecond history (`(int)(CKTtime * 1e12)`) no longer shifts by 1 ps; the lossless/shunt-G TXL deck now matches ngspice-47 to rounding at every timepoint (#708).
