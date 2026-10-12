---
"@spice-ts/core": patch
---

`.print`/`.plot` cards and their `+` continuations are no longer numparam-substituted, matching ngspice-47: brace expressions over output quantities (`{DB(V(b))}`, `{abs(I(VT1))}`, `{log(inoise)}`, ...) no longer reject the deck. The analyses run unchanged and each unevaluated brace expression is reported as a `parse` warning (#714).
