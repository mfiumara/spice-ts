---
"@spice-ts/core": patch
---

Gummel-Poon BJTs with `XCJC < 1` together with `RB > 0` now simulate instead of failing with `Unsupported BJT model parameter: 'XCJC' < 1 together with RB > 0`. Like ngspice-47 bjtload.c and bjtacld.c, the `(1 - XCJC)*CJC` part of the base-collector depletion capacitance sits between the external base and the internal collector, outside RB, in `.op`, `.ac` and `.tran`. BJTtrunc leaves it out of the timestep control, and spice-ts now does the same. A self-written two-stage deck matches ngspice-47 `-b` to 1e-9 (op) and 1e-7 (ac), and its transient to 1.3 mV. The TI OPA690 macromodel bench from ngspice-bugs #737 gives op v(out) = -0.18920212436 and |v(out)| = 1.99794712955 at 1 kHz, as in ngspice-47. `.noise` rejects such a BJT rather than drop its RB thermal noise (#861).
