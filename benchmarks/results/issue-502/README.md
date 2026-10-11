# Issue #502: global nodes

Probe and before/after base: `bf2e4169` (main after #586); merged with main `3f26f107` and #613 afterwards. ngspice-47; Node v22.23.1; macOS arm64. Exact machine metadata and single-sample timings are in [the probe report](../../global-nodes/report.json). No speed claim is made.

## Implemented semantics

`.global` declarations accumulate and are case-insensitive. A subcircuit body reference binds to the corresponding top-level net before formal-port substitution, including at nested instance depths. A global/formal-port collision therefore ignores the connected actual port, and that unused node must not create a matrix unknown. Only top-level declarations and declarations in reachable subcircuit definitions participate; ngspice removes unused definitions first. Explicit `0` remains ground without allocating an unknown. `Circuit.addGlobalNodes()` and netlist serialization preserve declarations. This lane does not change ground aliases, numparam expressions, control scripting, or options behavior.

Eight unit tests cover these rules, round trips, repeated declarations, mixed-case references and local-node isolation. The original unsupported `.global` error was reproduced before the parser change. Further RED tests caught an orphan actual-port node and the reachable/unused-definition distinction. All eight pass after the fix.

## Unchanged corpus-f inputs

[before.json](before.json) and [after.json](after.json) contain freshly executed outcomes for all four issue fixtures, including input hashes. Both engines receive exactly the committed fixture bytes. No tolerance or fixture changes.

| Fixture under `examples/measure/` | ngspice-47 | spice-ts before | spice-ts after | Remaining issue |
|---|---|---|---|---|
| `inv-meas-tran-auto.sp` | success, `tran:1` | unsupported `.global` | unsupported `.options autostop` | #494 |
| `inv-meas-tran-control.sp` | success, no exported raw vectors because the control block runs/quits | unsupported `.global` | unsupported `.options scale` | #494; vector export #528 |
| `inv-meas-tran.sp` | success, `tran:4104` | unsupported `.global` | unsupported `.options scale` | #494 |
| `rc-meas-ac.sp` | success, `ac:41` | unsupported `.global` | unsupported `.meas` | #505 |

All four remain `spice-ts-loss`. Compared analyses/signals stay 0, and error metrics remain null, not zero: spice-ts produces no numerical result to compare. The `.global` bucket loses four rows; three move to the options bucket and one to measure. These explicit unsupported decisions follow #502's issue acceptance criteria and avoid expanding into other lanes.

## Direct ngspice differential probes

`pnpm build && pnpm exec tsx benchmarks/global-nodes/compare.ts`

The six original MIT-licensed netlists and all OP vectors are embedded in [report.json](../../global-nodes/report.json). The runner compares every signal from each engine, verifies identical signal sets, and checks a uniform 1e-12 absolute tolerance. This threshold does not change corpus scoring.

| Probe | Compared signals | Largest absolute error | Largest absolute RMS |
|---|---:|---:|---:|
| Nested instances | 4 | 0 | 0 |
| Global/formal-port collision | 5 | 0 | 0 |
| Collision with unused actual port | 3 | 0 | 0 |
| Mixed-case references | 4 | 0 | 0 |
| Unused definition | 6 | 0 | 0 |
| Reachable nested definition | 4 | 0 | 0 |

26 signals across six OP analyses match exactly. The nested and colliding-port outputs are 5 V in both engines; a declaration only in an unused definition leaves the outputs at 0 V in both. These are semantic regression probes, not replacements for the four unsupported corpus decks.

## Committed reports

This PR does not refresh corpus-f `outcomes.json`/`README.md`; they stay as on main. A full corpus-f refresh would mix in unrelated baseline drift and host-load timeouts, so the scoped before/after runs above are the evidence for this change.

The aggregate (100 fixtures, no `.global` decks) was regenerated on this branch merged with main e58322ea, because the new SOURCES.md section moves the source pin from `391461fe` (main's actual catalogue; main itself still pins the stale `a0fc235c`) to `98991942`. Every merge between the #613 refresh (outcome `d0a5c915`) and e58322ea was bisected with one full 100-fixture run on that main commit, each with only its SOURCES.md pin corrected in a throwaway worktree:

| Main commit | Change | Fixture-level outcome vs the #613 run |
|---|---|---|
| `098da449` | #494 options (PR #600) | identical (outcome `dc5fd4bf`) |
| `7c66aab9` | #504 `.pz` with sources (PR #614) | identical (outcome `dc5fd4bf`) |
| `f5e9c5b0` | #609 chunked transient buffer (PR #617) | identical (outcome `dc5fd4bf`) |
| `98d2d5d2` | #596 VDMOS test pin (PR #620) | identical (outcome `dc5fd4bf`) |
| `e58322ea` | #488 control interpreter (PR #584) | only ngspice/ac-zero-frequency: spice-ts unsupported → success; ngspice still fails, so no comparison is added |
| this branch | #502 `.global` (PR #603) | identical to the `e58322ea` run |

So #502 is outcome-neutral, and so are #614 and #617 on their own. ngspice 52/9/39, spice-ts 61/1/38 (the +1 is #584), 67 analyses across 48 fixtures, 879/847 signals, every envelope unchanged. No spice-ts run hit the 120000 ms bound. Only runtimes, ngspice error text (memory figures), the pin, the new status transition and the ledger entry differ. `aggregate-report.ts --check` exits 0.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
pnpm exec tsx benchmarks/aggregate-report.ts --check
pnpm exec tsx benchmarks/global-nodes/compare.ts
```

To rerun a single affected fixture, use `pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --corpus-f-fixture-child <id>` with the IDs in `before.json`/`after.json`.
