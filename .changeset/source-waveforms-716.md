---
"@spice-ts/core": minor
---

Independent V and I sources accept `EXP(...)`, `SFFM(...)` and `AM(...)` waveforms and the PWL `TD=` (delay) and `R=` (repeat) parameters, matching ngspice-47 vsrcload.c/isrcload.c: TSTEP/TSTOP defaults for omitted coefficients, the SFFM modulation-index clamp, the value 0 before an SFFM/AM delay, and no EXP/SFFM/AM breakpoints. A PWL with `TD=`/`R=` schedules its corners on accept like ngspice-47 vsrcacct.c, so a repeat's wrap-around jump is sampled on the same side as ngspice. New exported types `ExpSource`, `SffmSource` and `AmSource` (#716).
