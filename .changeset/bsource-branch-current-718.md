---
"@spice-ts/core": minor
---

B-source expressions can read voltage-source branch currents with `i(vx)`, as in ngspice-47 (#718). The value is the MNA branch current of the referenced V, E, H, L or V= B element (positive from its + node through the element), stamped with its derivative on the branch unknown for DC, AC and transient Newton and convergence tests. Inside a subcircuit `i(name)` refers to the instance's own element, and names match case-insensitively. An unknown name, or an element without a branch current, now fails with an `InvalidCircuitError` instead of the old parse rejection. The corpus-g Sandler decks SANDLER1 and SANDLER2 now run and match ngspice-47.
