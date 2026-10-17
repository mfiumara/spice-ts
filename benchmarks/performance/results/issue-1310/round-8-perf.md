# #1310 round 8: reuse VBIC Dual evaluation storage

Refs #1310. Base e858c1d4a7735a185ab4e81285a09cc57b466b8c. Fixture bytes, source and licence are unchanged (benchmarks/SOURCES.md). Node v22.23.1, macOS 27.0.1 arm64, shared uncontrolled host.

## Change and ownership

DualWorkspace retains one Dual and ordinary number[] derivative buffer per expression slot. A monotonic cursor resets at evaluation entry and only grows capacity at a new high-water mark. All helpers overwrite every derivative; constants clear every element before setting a variable seed. No slot is recycled within an evaluation, so outputs cannot alias operands, even repeated operands such as mul(q1, q1). Expressions, operands, intermediate arithmetic and derivative accumulation order are unchanged. No model-equation, tolerance, timestep, solver or per-circuit changes.

Each device has two lazy-growing workspaces. Static stamps use loadWorkspace because their cached charge Duals live until the next static load. Noise, dynamic stamps, accepted-point evaluation and uncached charge evaluation use evaluationWorkspace, whose Duals are consumed synchronously. Temperature/reset clears the cached load references as before; retained capacity is safe because every subsequent evaluation fully writes used slots. Devices never share storage. Retained memory per device increases to two expression high-water marks in exchange for removing repeated object churn; this is not a claim of lower live heap.

## RED / GREEN

The new test counts explicit new Array(9/11) derivative constructions in 80 warmed loads across two devices (TD off/on and opposite polarities). Every such array belongs to exactly one new Dual. Array.from result-row containers are excluded by binding it to the native constructor. The test first visits both depletion paths, then varies bias during measured loads.

Unchanged base RED: 18,840 paired Dual/derivative-array constructions, expected zero. Head GREEN: zero. This excludes warmup, evaluation wrappers, result-row arrays and typed Jacobians; it is not a total heap measurement. The initial probe also counted 80 Array.from row containers; the final test excludes those and was rerun RED on base before GREEN on head.

Two additional tests compare binary64 charge-stamp hashes with and without interleaved noise/dynamic evaluations at different voltages and another device's stamp. They cover temperature changes, reset, repeated loads, accepted steps and TD off/on. The existing broad fingerprint also covers polarity, limiting, avalanche, high injection, instance scaling and charge/noise quantities.

## Identity

The unchanged mandated base matches the current reference, not the historical round-6 result. Existing stamp fingerprint 3324cdb29c46ea0b0be79f64b9a06a767eba5549d997e193df9221f0634944db passes before and after. All six unprofiled timing runs and both profiled runs have waveform SHA256 361251b58101652f07fbdc64abdfb3ec8c8a941f92618420b32a2abc2a9a43f7, 40,545 rows, 40,544 accepted steps, zero rejected steps, 85,851 transient Newton iterations and 31 DC Newton iterations. Fixture SHA256 d811ecfa0f370d281fb35729ca3177e738fe034621d9b2909765d9d70f527cc6. Full convergence records are in the paired JSON.

## Every unprofiled timing, losses included

Command before and after: `spice-heavy node benchmarks/performance/dff-1310.mjs 3`. Sequential groups, unchanged full deck, no extra process warmup, same benchmark hashing outside the simulation timer.

| Run | Before seconds | After seconds |
| --- | ---: | ---: |
| 0 | 36.048163667 | 39.513938166 |
| 1 | 35.097760834 | 36.322910250 |
| 2 | 35.688225875 | 45.855921000 |
| Median | 35.688225875 | 39.513938166 |

Measured median change is +10.7198% (slower). Every after run is slower than every before run. No wall-time speedup, causal regression attribution or ngspice superiority is claimed on this noisy host. The verified improvement is elimination of repeated Dual/derivative-array construction, not elapsed time. The profile below also shows increased VBIC time despite lower GC time. Independent review must consider this loss. ngspice was not remeasured; the #1309 waveform mismatch remains and #1310 stays open.

## Matching CPU/heap profile buckets

Command before and after: `spice-heavy node --heap-prof --heap-prof-dir=<scratch>/<phase>-profile --cpu-prof --cpu-prof-dir=<scratch>/<phase>-profile --cpu-prof-name=cpu.cpuprofile benchmarks/performance/dff-1310.mjs 1`.

Whole-process timeDelta-weighted stack samples include startup and hashing, separate from unprofiled timings. Bundle coordinates are mapped using the matching base/head build maps via Node's module.SourceMap.findEntry (zero-based CPU profile line/column). Classification precedence matches round 7: GC frame, any devices/vbic.ts or vbic-temperature.ts frame, any mna frame, any solver frame, charge/integration/accept function name, other. GC is not attributed to an allocator; sampling and scheduling gaps can inflate buckets. Retained-heap files are not a churn counter.

| Bucket | Before seconds (%) | After seconds (%) |
| --- | ---: | ---: |
| VBIC | 27.435879 (80.26%) | 30.850487 (88.05%) |
| GC | 3.949643 (11.55%) | 1.220924 (3.48%) |
| stamping | 0.921496 (2.70%) | 1.041891 (2.97%) |
| factorSolve | 0.609593 (1.78%) | 0.572163 (1.63%) |
| acceptedPointCharge | 0.103501 (0.30%) | 0.070330 (0.20%) |
| other | 1.163804 (3.40%) | 1.282913 (3.66%) |
| Total | 34.183916 | 35.038708 |

## Verification

- pnpm install --frozen-lockfile passed.
- pnpm build passed before and after. Unchanged chunk-size warnings remain.
- pnpm lint passed.
- pnpm -C packages/core exec vitest run src/devices/vbic-allocation.test.ts passed on base, including the fingerprint.
- pnpm -C packages/core exec vitest run src/devices/vbic-dual-workspace.test.ts failed as expected on base (18,840 versus zero).
- pnpm -C packages/core exec vitest run src/devices/vbic src/mna passed on head: 331 tests in 23 files, including GREEN and fingerprint.
- spice-heavy pnpm test exited 1: 5,551 passed, 10 expected failures, 8 skipped, one 30-second timeout in transient-convergence.test.ts (half-wave rectifier). 414 files passed, one skipped. It is unrelated to VBIC.
- pnpm -C packages/core exec vitest run src/analysis/transient-convergence.test.ts passed both tests on isolated rerun, rectifier 9,309 ms. No timeout changes were made. Exact-head CI is authoritative for the full gate.

Only the model's allocation plumbing, its new regression test and these explicitly requested round-8 reports change. No raw logs, profiles or scratch scripts are committed.
