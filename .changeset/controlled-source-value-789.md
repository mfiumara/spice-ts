---
"@spice-ts/core": minor
---

Behavioural E/G cards (`Exxx n+ n- value={expr}` / `vol={expr}`, `Gxxx n+ n- value={expr}` / `cur={expr}`) now run as ngspice-47 ASRCs at the top level and inside subcircuits, instead of crashing `simulate()` with an uncaught `TypeError` (#789). E/G/F/H cards with missing fields or the unsupported POLY form now fail with a `ParseError` naming the card and its expected form.
