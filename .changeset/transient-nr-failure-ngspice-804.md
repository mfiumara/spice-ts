---
"@spice-ts/core": patch
"@spice-ts/mcp": patch
---

Transient Newton failures now follow ngspice-47 (#804). A timepoint fails after 100 Newton iterations by default, not 50. This is the niiter.c NIiter floor that ngspice applies to its default ITL4 = 10. A non-converged timepoint is now retried at order 1 (Backward Euler), with the step cut by 8, as in dctran.c (`CKTorder = 1`). Before, it kept trapezoidal history. On corpus-h mosamp2.cir (MOS LEVEL=2), the step sequence now stays closer to ngspice's across the fast edge, and the residual drops from 1.61% to 0.63%. Decks that fail Newton often now cost more iterations per failed attempt, as in ngspice. The MCP resolved-options default for `maxTransientIterations` now reports 100.
