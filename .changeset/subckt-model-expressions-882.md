---
"@spice-ts/core": patch
---

Evaluate brace and quoted expressions on subcircuit-local `.model` cards in the instance's parameter scope, after dependency-ordered body `.param` definitions. Nested definitions inherit their enclosing instance's scope and models remain distinct across overrides. Undefined model expressions now report a `ParseError` at the model card's deck line; cyclic parameter dependencies retain the defining `.param` diagnostic (#882).
