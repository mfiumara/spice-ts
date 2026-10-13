---
"@spice-ts/core": patch
---

Diode model cards now accept the series-resistance temperature coefficients `TRS1` (alias `TRS`) and `TRS2`, following ngspice-47 diotemp.c: RS(T) = RS·(1 + TRS1·dT + TRS2·dT²) with dT = T − TNOM, for both the two-terminal diode and the RS resistor that compiled circuits split onto a prime node. Before this change they were rejected as unsupported breakdown-temperature parameters. On the SnapLED150 LED model from ngspice ticket 761, the operating-point current matches `ngspice -b` within 2.4e-6 relative from −40 °C to 150 °C (including the TRS alias with area=2). Both ngspice-bugs #761 decks now run (#829).
