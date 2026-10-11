# Control-language review remediation (#488 / PR #584)

## Reproduce

From the repository root:

    pnpm install --frozen-lockfile
    pnpm build && pnpm lint && pnpm test
    pnpm exec tsx benchmarks/control-language-488/compare.ts

The comparison script runs `ngspice -b` on each original probe deck and the
same bytes through spice-ts. It also calls the existing corpus-f `runFixture`
harness on the three required upstream fixtures, without modifying their
netlists or tolerances. Pass a destination JSON path to retain the receipt.
Sources and licences are recorded in `benchmarks/SOURCES.md`.

`before.json` was measured with tracked changes stashed at `7c82f509` (the
rejected interpreter rebased onto main `85a48053`). `after.json` was measured
with the remediation applied; its `trackedDiff` identifies the working-tree
changes. Both record input hashes, commands, raw ngspice output and machine
information (ngspice-47, Node v22.23.1, Apple M5 Pro, Darwin arm64).
These are correctness receipts, not performance measurements or speed claims.

## Observed values

| Expression / check | Before spice-ts | After spice-ts | ngspice-47 |
|---|---:|---:|---:|
| `log(100)` | 2 | 4.605170185988092 | 4.60517 (echo precision) |
| `-7%3` | -1 | 1 | 1 |
| `7.5%2` | 1.5 | 1 | 1 |
| `5.9%2.9` | 0.10000000000000053 | 1 | 1 |
| `not 0 + 1` | 2 | 0 | 0 |
| `not 1 - 1` | -1 | 1 | 1 |
| `~0 + 1` | 2 | 0 | 0 |
| `mag(3,4)` | unsupported arity | 5 | 5 |
| Reusing the parsed idempotence circuit | first 1, then first 2 | first 1 on both calls | first 1 on fresh deck |

All 36 captured echo lines from `probes.cir` match ngspice's output exactly.
The logarithm fix covers real and complex vectors. NOT binds below arithmetic
and complex construction, but above comparisons; complex NOT considers both
components. Built-in functions consume comma expressions as complex operands;
user-defined functions retain argument-list semantics.

Important correction to the review's spelling list: bare `!` is **not** an
ngspice-47 logical NOT operator. `invalid-probes.cir` records ngspice rejecting
`!0 + 1` with `RHS "!0 + 1" invalid`. spice-ts now rejects it rather than
silently accepting it. `not` and `~` are supported. The same deck records
negative real logarithms and a modulo divisor whose integer magnitude is zero
as errors. ngspice continues after these diagnostics and exits 0 on `quit`;
spice-ts deliberately throws a structured expression error instead.

## Caller-state isolation

`simulateControlScript` snapshots fields that `alter`, `altermod` and `option`
can change and restores them in `finally`, after all script and trailing deck
analyses. Tests parse once and simulate twice, check identical echoed values
and currents, and check original instance/model parameters, source waveforms
and options. Error/quit paths are covered as well. Direct calls to the Circuit's
explicit mutation methods remain mutations; simulation no longer leaks them.

## Corpus-f before / after (unchanged)

| Fixture | Before | After | Worst peak-normalized error |
|---|---|---|---:|
| `examples/control_structs/if-batchmode.cir` | matched | matched | 0.000976, tran i(v0) |
| `examples/various/param_sweep.cir` | matched | matched | 1.49e-16, dc i(vdd) |
| `tests/regression/misc/bugs-1.cir` | spice-ts-loss | spice-ts-loss | not compared |

The first two compare three signals each. `bugs-1` still fails its own check
with `v(n1004_t) = 4 but should be -4`, then `quit 1`. ngspice succeeds but
exports no raw vectors because the control script quits. This remediation does
not fix or conceal that separate circuit-expression bug. The full historical
56-deck bucket was not rerun for this narrow remediation.

## Local verification

- `pnpm install --frozen-lockfile`: exit 0 (pre-build missing MCP bin warning).
- RED: focused control suite had 6 failing / 26 passing tests before the fixes.
- GREEN: full-suite runs include all new control regressions passing.
- `pnpm build`: exit 0; `pnpm lint`: exit 0.
- Two default `pnpm test` runs: exit 1 due only to pre-existing test timeouts
  under shared-host contention (observed load averages 166 then 205). First:
  BJT fixture, BSIM3 chain and half-wave rectifier; second: only half-wave
  rectifier. Second core run: 1828 passed, 1 timed out, 2 skipped.
- No numerical tolerances or test timeouts were changed. Final rerun and
  exact-head CI results are recorded in the PR remediation handoff.
