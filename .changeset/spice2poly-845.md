---
"@spice-ts/core": patch
---

E, F, G and H sources accept the SPICE2 `POLY(n)` form that vendor op-amp macromodels use (#845). Each POLY card runs as a B-source of the polynomial ngspice-47 evaluates in its XSPICE spice2poly code model: the same SPICE 2G6 NXTPWR term order (a, b, a², ab, b², a³, … for POLY(2)), terms past the last coefficient are zero, E/G read node-pair voltages, F/H read voltage-source currents, `m=` scales G and F (ngspice ignores it on E and H), and `(`, `)` and `,` only separate tokens as in MIFgettok. DC, AC and transient results match ngspice-47 on 1-D to 5-D decks and a Boyle-style op-amp macromodel. Known difference: ngspice-47 lowers trtol to 1 when a deck has POLY sources (they become XSPICE 'A' devices); spice-ts keeps the deck's trtol, so its transient timesteps can differ unless the deck sets `.options trtol=1` (#862).
