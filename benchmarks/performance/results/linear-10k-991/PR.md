## What / why

Refs #991. Publish current-main RC10k/Mesh10k phase attribution and the unchanged controls, not an optimisation.

Ten interleaved rounds per deck under #951 suspend-safe 30s-child/300s-run controls completed 60 Node children +20 native children in 21.497s. Full TypeScript output hashes are identical between control and instrumented copies; native full numeric payload hashes are stable. Identical deck hashes match #961.

No individual permitted solver bucket reaches 20% of cold parent wall. Mesh parse reaches 21.05%, but parser edits are explicitly out of this card's scope. Leave #991 open for supervisor-owned parser follow-up. No production changes, no circuit-specific settings, no superiority claim.

## Evidence

All values median / IQR in ms, ten samples each.

| Deck | Unchanged control parent wall | Instrumented copy parent wall | Direct ngspice-47 KLU wall | Control/native loss |
|---|---:|---:|---:|---:|
| RC10k | 473.313 / 60.924 | 483.588 / 36.045 | 192.556 / 9.549 | 2.458x |
| Mesh10k | 357.610 / 49.799 | 348.613 / 32.014 | 98.672 / 10.558 | 3.624x |

After-optimisation and 1k/50k regression runs are not applicable because no optimiser was changed. Instrumentation is diagnostic, not a speedup. Cold parent wall includes Node startup/import/output hashing; native wall excludes the benchmark Node wrapper but includes full raw emission. API clocks and wrapper walls are published separately. Shared-host startup/exit noise is retained, not trimmed.

Report: `benchmarks/performance/results/linear-10k-991/README.md`
Full phase table: `baseline/table.md`; source/deck pins: `prepared.json`; complete journal, native raw output, ownership/budget and archive checksums are retained.
Baseline revision: `bd4ac625f15e344043a7431b24f64828966e2d41`.

## How to test

- `node --test benchmarks/performance/linear-10k.test.mjs` (11 pass; clock-corruption regression RED then GREEN)
- `python3 benchmarks/performance/linear-10k-test.py` (5 pass)
- `pnpm exec tsx --test benchmarks/performance/scaling-m2.test.ts` (6 pass)
- `node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/linear-10k-991/baseline` (60 certified samples; full output equality)
- `pnpm build` / `pnpm lint` / `spice-heavy pnpm test` all exit 0; core 3,629 pass +2 existing skips
- Reproduction must use a fresh output path and `spice-heavy python3 benchmarks/performance/linear-10k.py <fresh-path>`.

Required exact-head CI and a SHA-bound independent spice-ts-review child are tracked on the Kanban card. No merge by the implementer.
