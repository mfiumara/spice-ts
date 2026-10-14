# corpus-l plan (#1045)

Scope is evidence only. No simulator, aggregate or previous corpus edits.

Data shapes reuse corpus-j Circuit/Manifest, corpus-f packed engine executions and corpus-h parityReport. The seam is original Buffer bytes, verified against manifest SHA-256 before either shared engine runner. No new solver or comparison logic.

Select before running engines: all ten statically eligible novel CircuitSim90/MOS3 decks, all four novel ACtests/mos gain-stage decks, four ACtests/SANDLER decks, and the first two ACtests/diffpair_spiceMan decks in path order. Twenty decks total. Use the pinned Xyce_Regression GPL-3.0-or-later grant; reject separate notices, includes, host commands and duplicate hashes against all earlier corpora. Retain failures rather than replace decks after probing. MOS2_LARGE is deferred for a separately budgeted large-circuit batch. No schematic exports, vendor models or fabricated ISCAS provenance.

1. Ingest exact upstream blobs, retain licence notices and selection/hash receipt.
2. Verify provenance offline, then run both engines serially through spice-heavy with the corpus-k uniform deadline and unchanged matched-point comparisons.
3. Publish every outcome, classify each ngspice-success loss, verify report and metrics offline.
4. Run build/lint and guarded full tests. Review diff, commit, push and open a Refs #1045 PR. Await exact-head required CI and hand off to the pre-created independent review child.

No before/after solver comparison applies: production is unchanged. The new batch is a baseline measurement, not an improvement or speed claim.
