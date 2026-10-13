---
"@spice-ts/core": patch
---

PSpice `T_ABS`, `T_REL_GLOBAL` and `T_MEASURED` on `.model` cards are now renamed to `temp`, `dtemp` and `tnom` like ngspice-47's PSpice compatibility mode (inpcompat.c): only the first of them on a card is renamed, and any other is dropped with ngspice's "unrecognized parameter ... - ignored" warning. Resistors now take instance `temp=`/`dtemp=` and their `.model` defaults: the instance temperature (a given `temp` ignores `dtemp`, restemp.c) sets both the TC1/TC2/TCE resistance and the `.noise` thermal noise, so the PSpice `.model R_NOISELESS RES(T_ABS=-273.15)` resistor is noiseless as in ngspice. A `temp`/`dtemp` produced this way on a non-resistor model is rejected with `UnsupportedModelParameterError` instead of being ignored (#846).
