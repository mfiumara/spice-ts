Part of #948 step4. Publish a separate reproducible ngspice47 / Xyce7.10 reference-only cross-check, starting with the original100 aggregate fixtures and growing toward100 mutually accepted circuits in original A..J manifest order.

Acceptance: selected ids, original/canonical SHA256, analysis types; all attempted outcomes and exclusions; per-fixture/per-signal max/RMS absolute/relative errors; descriptive disagreement buckets, with ignored-dot-line warnings retained and export failures separate from convergence evidence. Selection uses reference outcomes only, never spice-ts results. Guard every corpus run with spice-heavy. Preserve aggregate ledger and scoring. Do not imply model equivalence from observed disagreement.

This scoped report issue does not close the umbrella #948 or change device models, Linux installation, or publication boundaries.
