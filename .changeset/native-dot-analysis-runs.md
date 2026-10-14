---
"@spice-ts/core": minor
---

Retain every native analysis run in `SimulationResult.analyses` for multi-analysis decks, including lowered straight-line control commands. Preserve legacy last-per-type fields and per-run measurements without rerunning analyses; single-analysis, stepped and interpreted-control results are unchanged.
