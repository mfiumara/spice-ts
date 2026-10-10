# Issue 321 aggregate parity refresh receipt

This receipt covers the 100-fixture aggregate run on PR #325 after merging current `main`. It makes no M1 completion, parity, speed, or superiority claim.

## Inputs and tools

- Base commit: `d3eaf5a9e6a19ebb56741967d14291c2b3392be1`. The artifacts were generated after merging `250656c` and checked again with `--check` after the final merge of `d3eaf5a` (#364). That merge touches only `packages/wasm` and `benchmarks/results/issue-362`. It changes no aggregate input, no `packages/core` file, and not `benchmarks/SOURCES.md`.
- Previous aggregate: issue #321, PR #325, head `e400d87c791dfa27f572a349777c8ebb9f2450d4`, deterministic outcome `26be9f80744c077c0bdb98fa5c6c9cffc8615c2e2589383507abd59fd6fed41b`.
- Aggregate corpus-tree SHA-256: `01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1`, unchanged.
- `benchmarks/SOURCES.md` SHA-256: `f8cc57771ac07684b1bdebb43ad2ab572f048a9e67d5df98386dc9eb706a188f`. It was `b6540a743d176a01cc8e8aff6412655cc09f5fbf30554a53222c1d290c3029a1`. The change comes only from source records merged on `main`; this branch does not edit `SOURCES.md`.
- Corpus Git trees are identical to `e400d87`: ngspice `699f294d0fc87274038a3e172764fbef8eabba5c`, classic `4c9595e209ee58f0f2c36282684b9c8e69b91606`, Xyce `da56eb29bfa63e6834d4923335fb41fb55a897ab`, corpus D `85c56dbef57304ef6d1871faa62f24cb505d7713`, corpus E `f1aad3d7785e4479fe45ff86e3094cf9d43a9fd7`. The ordered 100-fixture byte set is therefore unchanged (`ed8b373960cc1b7b7a926cf4b9efb156db1bf059dfd775ef6f3105acc8701b1b`).
- Apple M5 Pro, macOS 27.0.1 (Darwin 27.0.0) arm64, Node v22.23.1, pnpm 10.28.1, spice-ts 0.3.0, ngspice-47.
- Both engines received the same recorded fixture bytes. No fixture, source record, manifest, simulator package, or per-circuit tolerance changed.

## Runner change: bounded spice-ts execution

`simulate()` does not terminate on the unchanged `xyce/inductor-transient` fixture. A standalone run was still going after 300 s. This hang caused the earlier two-hour timeouts of this refresh. Filed as #366.

The aggregate now runs spice-ts in a child process with the same 120000 ms wall-clock bound that `benchmarks/corpus/classic/report.ts` already applies to every ngspice subprocess. A run that exceeds it is recorded as `failed` with error `spice-ts exceeded the 120000 ms aggregate execution bound`. The child uses the unchanged in-process adapter and returns its result through v8 serialization. A focused test checks that the bounded result deep-equals the in-process result.

The engines now run one after the other for each fixture, so a runtime receipt never includes time spent in the other engine. The spice-ts runtime is the adapter time measured inside the child. For a timeout it is the wall-clock time until the kill.

## Aggregate result

- Deterministic outcome SHA-256: `68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9`.
- ngspice-47: 52 success, 9 failed, 39 unsupported. These totals did not change.
- spice-ts: 55 success, 2 failed, 43 unsupported. The previous totals were 51 success, 3 failed, 46 unsupported.
- Comparable results: 58 analyses across 43 fixtures, up from 54 analyses across 39 fixtures.
- Matched signals: 878 absolute and 848 relative. Samples: 9,182,709 absolute and 9,147,783 relative. Exact-zero references excluded from relative metrics: 34,926.
- Full worst per-signal envelope: absolute max `1169140310571.719`, absolute RMS `1169140310571.719`, relative max `45497356677842.63`, relative RMS `872317191517.6284`.
- The absolute max and RMS still come from `ngspice/vbic-common-emitter-ac` pole-zero signal `v(pole(1))`. The relative max and RMS now come from `classic/coupled-lossy-lines` transient signal `v(5)`, whose absolute max error is `1.4200318868351707` V. The relative metric divides by near-zero ngspice samples there.
- Single-run descriptive runtime sums: ngspice `77150.906 ms`; spice-ts `270491.926 ms`, including the `120342.326 ms` inductor timeout. Other jobs were loading the host heavily during the run (load average about 26–46; generation took 9 min 56 s wall clock at 21% CPU). These sums are not comparable with the previous in-process sample. They are diagnostics, not a speed comparison.
- All 48 non-success ngspice rows and all 45 non-success spice-ts rows remain published per fixture. The JSON retains every engine error string and every per-signal max/RMS absolute and relative metric.

## Status transitions

All 7 status transitions are for spice-ts. No ngspice classification changed.

- `ngspice/ltra-line-transient`: unsupported to success after the accepted benchmark-bounded lossy LTRA subset (#308, PR #320).
- `classic/lossy-line-24-inch`: unsupported to success, same LTRA change.
- `classic/lossy-line-aluminium`: unsupported to success, same LTRA change.
- `classic/coupled-lossy-lines`: unsupported to success, same LTRA change.
- `ngspice/hfet-inverter`: failed to unsupported. Accepted subcircuit device validation (#338, PR #341) now rejects the `Z` card at parse time. Before, the run reached a singular matrix at node `3`.
- `ngspice/mesa-oscillator`: failed to unsupported. The same validation now rejects the `B` card. Before, the run reached a singular matrix at node `xinv01.2`.
- `xyce/inductor-transient`: unsupported to failed. Disabled `NEWBPSTEPPING` support (#322, PR #326) removes the parse rejection. The transient then does not terminate and is recorded as a bounded-execution failure (#366).

## Comparison and diagnostic transitions

- The four LTRA fixtures add four transient comparisons, 317 absolute signals, and 1,219,613 absolute samples.
- Two-source nested DC sweeps (#354, PR #359) now emit every nested point. `ngspice/jfet-vds-vgs` (26 → 104 points), `xyce/njfet-2109-dc` (16 → 64), `xyce/nmos-level1-dc` (19 → 361), and `xyce/pnp-dc` (6 → 30) compare the same signal sets on the full grid, adding 3,474 absolute samples. `corpus-e/diode-temperature-sweep` emits 2 DC points instead of 3. ngspice fails that fixture, so it has no comparison.
- Status-preserving error changes: `xyce/diode-level2-temperature-breakdown` now reports a missing top-level transient result instead of a TEMP step error, after bounded TEMP LIST stepping (#318, PR #327). `classic/bjt-noise` and `classic/resistor-noise` now report a missing noise result instead of a `.noise` parse error, after the classic noise-interval fix (#336, PR #337). All three stay unsupported.
- The larger relative envelope is a published loss. No tolerance changed to hide it.

## Commands and results

```text
pnpm install --frozen-lockfile
PASS, lockfile unchanged (9.7 s).

pnpm build
PASS, all workspace builds completed (4 min 41 s on the loaded host).

pnpm lint
PASS, all workspace TypeScript checks completed (5 min 34 s on the loaded host).

pnpm test
NOT GREEN LOCALLY. Two runs on the shared host (load average 40-58, memory pressure) failed only by
vitest timeouts in packages/core (4 and then 13 tests, e.g. "Test timed out in 5000ms"; one
"realloc: can't allocate 1073741824 bytes"). This branch has no diff under packages/ or examples/
relative to main d3eaf5a. The exact-head CI test (20) and test (22) jobs are the authoritative run.

pnpm bench:accuracy
PASS, all eight circuits completed; seven checks passed and the retained BJT CE bias warning was 2.61%.

pnpm exec tsx --test benchmarks/aggregate-report.test.ts
PASS, 13/13 tests.

pnpm exec tsx benchmarks/aggregate-report.ts --check
PASS after the final main merge, 100 fixtures, 58 comparable analyses, deterministic outcome
68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9 (16 min 8 s on the loaded host).
An earlier attempt failed with a projection mismatch while a concurrent `pnpm build` was rewriting
packages/core/dist. It was not diagnosed further. The check now names each differing fixture.

git diff --check
PASS.
```

Exact-head CI and independent review are recorded on the delivery PR.

## `/poteto-mode` receipt

RED: the two new bounded-execution tests failed because `runBoundedSpiceTs` and `SPICE_TS_TIMEOUT_MS` did not exist. The ledger tests also failed against the stale committed artifacts (3/12 pass). GREEN is 13/13 after adding the bounded runner, the per-fixture `--check` diagnostic, and the transition ledger, and regenerating the artifacts from the same 100 fixture bytes.
