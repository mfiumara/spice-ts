# PR955 X-call RHS continuation remediation

This new phase preserves all earlier #797 receipts. The shared preprocessor
now folds an X card's physical continuations before its assignment scanner,
expression substitution and nested-body compaction. Consumed continuation
lines retain blank slots so later source line numbers do not shift. Control
language is not folded. There is no circuit-specific logic or tolerance change.

## TDD and commands

RED reproduction commit: `79e15365`. The first invocation could not find
Vitest (exit 254), retained in `red.log`, and is not evidence of the bug.
After `pnpm install --frozen-lockfile` (exit 0), RED receipt commit `a71df84c`
records 10 failures / 10 tests, exit 1, before production edits.
GREEN production commit: `4bea4d76`.

    pnpm -C packages/core exec vitest run src/parser/x-call-continuation-797.test.ts
    pnpm -C packages/core exec vitest run src/parser/x-call-continuation-797.test.ts src/parser/comma-numparam-797.test.ts src/parser/subckt-param-order-857.test.ts src/subcircuit-params.test.ts src/subcircuit-port-parens-864.test.ts src/subcircuit-dynamic-params-888.test.ts
    pnpm -C packages/core exec vitest run src/parser src/circuit.test.ts
    pnpm build
    pnpm lint
    spice-heavy python3 benchmarks/comma-numparam-fix-797/rhs-continuation/run.py before
    spice-heavy python3 benchmarks/comma-numparam-fix-797/rhs-continuation/run.py after
    python3 benchmarks/comma-numparam-fix-797/rhs-continuation/verify.py

The first command is installed RED, exit 1. Every subsequent command exits 0.
Targeted GREEN passes 75 tests across 6 files. Parser/circuit GREEN passes
1384 tests across 57 files. No local full monorepo suite, full corpus or
aggregate report was run. Exact-head GitHub CI is the authoritative full gate.

## Same-byte measurements

Before comparison temporarily restored only `preprocessor.ts` from `a71df84c`
onto GREEN head `4bea4d76`, then restored HEAD immediately after the run.
`before.json` retains that full reverse working diff, not a misleading claim
that the clean GREEN commit failed. The after run records clean production.
Each engine receives the same committed `.cir` bytes; the offline verifier
checks SHA-256 before/after, raw values, statuses and metrics for all 40 rows.
Probe provenance is original project-authored MIT, recorded in the root
`benchmarks/SOURCES.md`. Legacy decks and provenance remain unchanged.

| continuation form | before top/nested native | ngspice-47 top/nested | after top/nested native |
| --- | --- | --- | --- |
| `alpha=` then `+5` | failed / failed | 5 V / 5 V | 5 V / 5 V |
| `alpha=` then `+seed*2` | failed / failed | 5 V / 5 V | 5 V / 5 V |
| brace expression split inside RHS | failed / failed | 5 V / 5 V | 5 V / 5 V |
| quote expression split inside RHS | failed / failed | 5 V / 5 V | 5 V / 5 V |
| inline comment, blank/comment lines, two continuations | failed / failed | 5 V / 5 V | 5 V / 5 V |

All ten new cases have zero max/RMS absolute and relative errors after the fix.
The fresh full legacy twenty-case table is unchanged: 15 numerical agreements,
4 both-failed cases, 1 native status loss, 0 numerical losses. Every legacy
case, value and metric appears in `after.json` and `verify.log`, including
`unbraced-missing-value`, which still fails natively. This is not 20 successes.
Original example01 retains max/RMS absolute errors
8.881784197001252e-16 / 5.127978741977898e-16 V.

Owned serial child wall: before 4.570986837 s; after 11.489855916 s.
Each child has a 12 s cap and each phase a 300 s cumulative cap. No timeout
occurred. These timings include startup, are not performance benchmarks,
and support no speed claim. Prior receipt files are byte-immutable.

PR: https://github.com/mfiumara/spice-ts/pull/955 (Fixes #797).
The final evidence-only head and exact-head CI receipts are in the Kanban
review handoff and the PR remediation comment. Independent review is required;
this worker does not merge.
