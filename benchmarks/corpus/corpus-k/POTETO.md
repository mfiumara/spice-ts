# corpus-k execution decisions

Scope: corpus-k data/harness plus additive SOURCES rows. No core, aggregate or CI workflow changes.

Data shape: manifest circuits carry original path, pinned source URL/revision, licence, SHA-256, byte length, analyses and empty include closure. Survey receipts carry all candidate path/hash/static verdicts; manifest hashes receipts and licence notices. Outcomes are the shared FixtureOutcome plus shared detailed comparison arrays and cold per-engine wall times.

Seam: reuse corpus-f packed engines and metric, corpus-j reduceRow, corpus-h parityReport totals/tables. Only serial process ownership, corpus-local I/O and two error-line buckets are new. No new comparator or report-table implementation. Uniform 119 s engine-group deadline; all 20 rows survive failures. No per-circuit numerical settings changed.

Selection: before engine execution, all 18 novel CircuitSim90/MOS2 standalone candidates plus open-loop MOS op-amp and Hartley oscillator. Exhausted fresh ngspice standalone examples without padding. Related original variants are retained. No new ISCAS/PLL/SMPS coverage claimed.

Before: no corpus-k fixtures/report on base 760833b9. After: 20 novel fixture bytes, 19 ngspice references, 5 matches, 14 spice-ts losses, 1 both-engine failure. Core tree unchanged, so this is coverage evidence, not a simulator accuracy/speed improvement claim. Per-engine cold group totals from this run: ngspice 5454.563375 ms; spice-ts 11119.012918 ms. These include startup/export and failed executions; they are not comparable solver timings.

Verification: frozen install, root build/lint, guarded identical-input benchmark, offline hash/novelty/all-loss/metric rendering test; guarded root full suite and required exact-head GitHub checks. Gap issues were filed only after all-state duplicate searches and read back. Independent spice-ts-review receives the exact PR head; author does not merge.
