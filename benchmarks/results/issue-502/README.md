# Issue #502: global nodes

Base: `bf2e4169` (main after #586). ngspice-47; Node v22.23.1; macOS arm64. Exact machine metadata and single-sample timings are in [the probe report](../../global-nodes/report.json). No speed claim is made.

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

## Full report refresh (including unrelated baseline drift and losses)

The full `outcomes.ts` run completed all 336 fixtures, exit 0. Its committed predecessor was generated before several simulator features already present on this branch's base. The complete [corpus-f-delta.json](corpus-f-delta.json) records 171 changed rows, ignoring run-to-run analysis point counts. Do not attribute these broad changes to `.global`: this card's four targeted before/after runs above remain four losses.

| Corpus-f count | Committed predecessor | Full current run |
|---|---:|---:|
| ngspice success / failed / unsupported | 306 / 18 / 12 | 300 / 24 / 12 |
| spice-ts success / failed / unsupported | 32 / 8 / 296 | 60 / 12 / 264 |
| Matched / mismatch / not-compared | 11 / 10 / 11 | 26 / 13 / 21 |
| spice-ts-loss / ngspice-failed / both-failed | 274 / 0 / 30 | 240 / 0 / 36 |
| `.global` bucket | 4 | 0 |
| Options bucket | 18 | 19 |
| Measure bucket | 3 | 4 |

The scoped `.global` contribution to the options bucket is +3; unrelated CIDER model errors move two other rows away from that bucket. All six lost ngspice successes are retained 600 s timeouts on CIDER decks (`pindiode`, `ringosc`, `cd4007n-200402idvg`, `cdxy`, `tbicmpu1`, `tbicmpu1xy`) under shared-host load. The full output preserves mismatches, unsupported cases, timeouts and changed error messages; the lower loss total is not a claim that this change fixed 34 decks.

The full 100-fixture aggregate run also completed, exit 0. [aggregate-delta.json](aggregate-delta.json) records the sole per-fixture change after excluding runtime/error text: `ngspice/jimi-fuzz` hits the unchanged 120000 ms spice-ts bound. spice-ts success / failed / unsupported moves 60 / 1 / 39 to 59 / 2 / 39, compared fixtures 48 to 47 and analyses 67 to 65. ngspice remains 52 / 9 / 39. Every numerical metric, grid, signal list and status of the other 99 fixtures is unchanged. The aggregate has no `.global` decks and no parity gain is claimed. The timeout is published rather than discarded; it also removes that fixture's large errors from the numerical envelope, which is not an accuracy improvement.

The aggregate tree pin was already stale on the base because #529 changed `corpus/classic/report.ts`, which is included in the tree digest. Both the actual tracked-tree hash and the source catalogue hash are refreshed. After execution, only the explanatory aggregate note and its digest were updated to describe this run; `verifyCommittedArtifacts` verified JSON accounting, deterministic digest and Markdown rendering without changing any fixture outcomes or metrics.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
pnpm exec tsx benchmarks/global-nodes/compare.ts
pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts
pnpm exec tsx benchmarks/aggregate-report.ts
```

To rerun a single affected fixture, use `pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --corpus-f-fixture-child <id>` with the IDs in `before.json`/`after.json`.
