## What / why

Add the bounded XSPICE `s_xfer` family needed by five historical corpus-f reference successes. Supports strictly proper denominator orders 1/2 in OP, DC, AC and transient, with ngspice-47 coefficient/frequency/IC/state semantics. AC uses hidden MNA state branches; no solver, analysis, control, parser dispatch, shared corpus/registry or CI edits.

Refs #553. The umbrella issue stays open.

## How to test

- `pnpm -C packages/core exec vitest run src/devices/xspice` (54 passed, including 16 bounded contracts)
- `node --test benchmarks/xspice-s-xfer-20261013/receipt.test.mjs` (4 passed)
- `spice-heavy python3 benchmarks/xspice-s-xfer-20261013/compare.py` (30s per process group, 900s cumulative budget)
- `pnpm build && pnpm lint && spice-heavy pnpm test` (local exit 0; full-suite receipt precedes final added tests, which pass targeted and are gated again by exact-head CI)
- `pnpm exec tsx benchmarks/accuracy.ts` (local exit 0, reference columns unavailable; not a fresh ngspice parity claim)

## Evidence / losses

Baseline `541cb5f34dd1dd89074df9f9f737e4eb6aff110c` after #925. Identical-byte baseline/reference/after runs and SHA-256s for all 8 reductions and all 5 unchanged originals are in `benchmarks/xspice-s-xfer-20261013/receipt.json`; compressed raw references, source pins/licences, commands, logs and scope are adjacent.

- RED 8 failed / 4 passed. GREEN 16 bounded tests; all 54 XSPICE tests pass.
- Reduction DC errors exactly zero; AC max absolute <=3.73e-16. Every reference point is compared.
- Transient max absolute <=2.79e-4; early-point max relative losses of 15.91% (second-order TRAP), 12.39% (Gear), 2.18% (IC) remain published. No full transient parity claim, no per-circuit tuning.
- Fresh ngspice exits 0 on all 5 unchanged originals. Four analog_models2 decks now stop on unsupported `core`; `lcouple` also remains. Metrics null, still losses.
- Original x_fer now runs native control transient with 15,440 points, but ngspice -r exports no control vectors. Full control/measurement parity is uncomputed, all metrics null.
- Before timings measure unsupported parse failures, after timings measure actual simulation. They are not speedup evidence.
- Initial comparator rounding failure and original node-extraction repair are disclosed, with failed receipts retained. Completed matrix took 16.30s; conservative 300s prior-attempt charge keeps cumulative work under900s. Timeout cleanup affects only each owned process group.

Scope: own XSPICE files and scoped benchmark directory only. The task forbids shared SOURCES.md edits, so scoped SOURCES.md records provenance and the supervisor must register a central pointer separately. No changesets/releases/publishing/merging. Independent spice-ts-review child must accept this exact full SHA; supervisor alone merges after all required CI checks are green.
