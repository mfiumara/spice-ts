# Issue #1310: VBIC DFF performance

Base: 931cd22563e5bfb0d557f638d0af9a063caa4d48. Node v22.23.1, macOS 27.0.1 arm64, Apple M5 Pro, shared host. All full-deck runs used spice-heavy. Wall times exclude queue wait, startup/import and output hashing. Each group runs three simulate calls in one process, without an extra warmup. The baseline process loaded the original build before the optimized build was produced and retained that loaded module for all three runs. Host load was uncontrolled; the baseline spread makes that limitation visible.

## Profile before changes

V8 CPU profile via source imports through tsx. Only for profiling, TRAN 0.25p 10n was shortened to TRAN 0.25p 0.1n, leaving other options and deck contents unchanged. The profile sampled 7058.4 ms. VBIC evaluate accounts for 83.3% inclusive time. The three largest self-time frames are all in VBIC automatic differentiation: map 32.7% self / 35.6% inclusive, add 16.7% / 19.2%, sub 12.1% / 14.3%. Inclusive frames overlap and must not be summed. This, not the solver or OP selection, is the bucket optimized.

Matrix: 122 unknowns, 832 structural nonzeros in the G/C union, inspected at MNAAssembler.lockTopology. The shortened run had 437 accepted steps, 28 rejected steps and 999 transient Newton iterations: 2.2860 iterations per accepted step or 2.1484 per attempted step. DC required 31 iterations with no source/gmin stepping. The full deck consistently has 100724 transient Newton iterations / 43272 accepted steps (2.3277 per accepted step), with 3139 rejected steps.

## Change

Only private VBIC Dual derivative storage and elementwise arithmetic changed. Ordinary JavaScript number arrays replace short Float64Arrays, avoiding their backing-store allocation overhead; indexed loops replace Float64Array.from callbacks. Both store binary64 values. Arithmetic expression order is unchanged, buffers are not shared, and no math approximations were introduced.

No OP/homotopy/initial-state logic, solver policy, timestep, tolerance, corpus fixture or ROADMAP.md changes. A loop-only typed-array candidate was explored but has no completed full-deck timing receipt and is not the shipped implementation. No performance claim is made for that candidate.

## Full unchanged deck: every run

Fixture: benchmarks/corpus/corpus-f/fixtures/examples/vbic/DFF_Y_ECL.sp. SHA-256: d811ecfa0f370d281fb35729ca3177e738fe034621d9b2909765d9d70f527cc6. Source/license are already recorded for corpus-f in benchmarks/SOURCES.md.

| Run | Before seconds | After seconds |
| --- | ---: | ---: |
| 1 | 1028.621798 | 72.579638 |
| 2 | 994.508378 | 77.611627 |
| 3 | 726.366138 | 76.027358 |

Median: 994.508378 s -> 76.027358 s. Reduction: 92.3553%, or 13.0809x speedup. The >=25% gate passes. These are shared-host observations, not isolated-machine throughput claims.

All six runs contain 43273 rows with identical convergence telemetry and bit-identical time points, returned node voltages and branch currents. SHA-256 over binary64 little-endian values, in returned order, is fa930f7d1b79d8ce7f05a5de675090f44ff445b143b18a85075f530dd52b19fc in every run. Maximum absolute before/after difference is zero. No tolerance exception is needed.

Remaining losses are explicit: this does not fix the known V(Q) parity loss tracked by #1309. The issue's ngspice-47 reference was 1.3-3.9 s / 40545 rows; optimized spice-ts still takes tens of seconds. No new ngspice timing or superiority claim is made here.

## Reproduction and validation

At each revision, run pnpm install --frozen-lockfile and pnpm -C packages/core build, then:

    spice-heavy node benchmarks/performance/dff-1310.mjs 3

Optional shortened independent timing:

    spice-heavy node benchmarks/performance/dff-1310.mjs 3 0.1n

For readable source profiles, use node --import tsx --cpu-prof with simulate imported from packages/core/src/simulate.ts and the same shortened deck. Summarize with benchmarks/performance/profile-summary.mjs. Profiling preceded simulator edits.

pnpm build and pnpm lint pass. All 217 tests in 14 src/devices/vbic*.test.ts files pass on the final implementation. Exact-head CI is the full-suite gate; no local root test suite was run for this card. Machine-readable timings, counters and output identity are in results.json.
