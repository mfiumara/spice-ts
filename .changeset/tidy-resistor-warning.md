---
"@spice-ts/core": patch
---

Ignore bare resistor cards without a value or model, matching ngspice-47, and report an IGNORED_BARE_RESISTOR parser warning with the source line. Preserve model-reference and keyword-only resistor defaults.
