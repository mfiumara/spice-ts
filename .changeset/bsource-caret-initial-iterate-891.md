---
"@spice-ts/core": patch
---

A B-source `V(x)^-0.5` (or any `^`/`**`/`pow()` that is +inf at a zero base) no longer aborts with "0, -0.5 out of range for ^" on Newton's all-zero first iterate. ngspice-47 only reports an expression range error for its HUGE sentinel, which `<math.h>` defines as FLT_MAX, not for an IEEE +inf, so +inf is now an ordinary value: the solve propagates it like ngspice's sparse solver and Newton moves on (`V1 in 0 0.25` / `B2 n2 0 V = V(in)^-0.5` gives v(n2) = 2, V1 = 0 gives inf, V1 = -1 gives 0, as ngspice-47). Overflows such as `10^400` evaluate to inf instead of a range error; sqrt/log of a negative still raise one. A signed or computed exponent such as `-0.5` or `(1/2)` now takes ngspice's general power-derivative rule, because ngspice's parser does not fold it into a constant (reverting that part of #886). Fixes #891.
