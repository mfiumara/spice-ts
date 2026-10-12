---
"@spice-ts/core": patch
---

`Circuit.compile()` folds each distinct node spelling once instead of once per terminal, resolves names that are already the display spelling directly, skips the `.global` lookup when there are no globals, and builds resistors without a model card without the model-default merge. Compile time on the #426 M2 scaling decks is 1.2-1.7x lower (resistor mesh 1.5-1.7x, RC ladder 1.2-1.4x, MOS1 inverter chain 1.1-1.2x); node indices and results are unchanged (#796).
