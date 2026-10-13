---
"@spice-ts/core": patch
---

An `X` subcircuit instance's `m=` is no longer silently ignored (#810). The instance becomes m parallel copies of the subcircuit: the multiplicity multiplies the `m` of every R, C, L, diode, BJT, MOSFET and current-source card in the body, through nested instances, in every analysis. A deck with R, C, diode and MOS1 cards in an `m=3` instance matches ngspice-47 to 1e-6 in `.op` and `.ac`. Where a body card has its own `m`, spice-ts multiplies as the ngspice manual documents, while ngspice-47 replaces it (ngspice bug #693). V/E/H/K and B `v=` cards are unaffected, S/W/O/Y/P cards stay unscaled with a warning (as in ngspice-47), and G, F, B `i=`, J and Z cards in a scaled instance throw `UnsupportedMultiplicityError` (`code: 'UNSUPPORTED_MULTIPLICITY'`) instead of running unscaled. A subcircuit that declares a parameter named `m` receives the X-line `m` as that ordinary parameter, as in ngspice-47.
