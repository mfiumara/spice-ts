# Validation and reproduction (#1045)

This is new baseline evidence, not a simulator optimization: production core, existing fixture bytes, thresholds and AGGREGATE_PARITY.md are unchanged.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
spice-heavy pnpm test
pnpm exec tsx --test benchmarks/corpus/corpus-m/corpus-m.test.ts

# One pinned source checkout, ignored and never published:
git clone --filter=blob:none --no-checkout https://github.com/Xyce/Xyce_Regression benchmarks/corpus/corpus-m/.upstream-xyce
pnpm exec tsx benchmarks/corpus/corpus-m/survey.ts
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/probe.ts
pnpm exec tsx benchmarks/corpus/corpus-m/ingest.ts
spice-heavy pnpm exec tsx benchmarks/corpus/corpus-m/parity.ts
pnpm exec tsx --test benchmarks/corpus/corpus-m/corpus-m.test.ts
```

All commands above were executed locally with exit 0 (clone once). The final offline guard passed 2/2 tests. Full `spice-heavy pnpm test` passed; its final benchmark Node runner reported 198 passing tests, 4 skipped, 0 failed (202 total); workspace package suites also passed. No RED/GREEN simulator change is claimed: this card imports benchmark data only. An initial probe script with top-level await failed before any probe; corrected to the repository's async-main convention and rerun successfully.

Survey: 83 candidates; 37 already present, 9 external dependencies, 3 licence exclusions, 1 no analysis, 33 novel eligible standalone candidates. Probe: 24 success, 9 unsupported, 0 failed. Every probe record is retained with original-byte hash and error line. All 24 successful candidates were ingested before running spice-ts; rejected source bytes are absent. Pinned upstream blob SHA-256 and retained README identity were independently rechecked after ingestion.

Paired corpus result: ngspice-47 24 success, 0 failed, 0 unsupported. spice-ts 21 engine successes (15 matched, 6 mismatches), 1 unsupported, 2 failed. All nine gaps are published. Detailed metrics and actual cold engine-group wall times are in outcomes.json, with machine, Node/core version and core tree hash. No per-circuit configuration/tolerance modifications. No speed-superiority claim.

Source-family scope is explicit in survey.ts. Vendor/LTspice/textbook/ISCAS candidates without an explicit verified redistribution grant are not copied. Xyce GPL-3.0-or-later data is retained separately from MIT packages with full licence and README grant.

CI URL and exact PR head SHA are recorded in the Kanban handoff and PR body after publication; this file cannot self-contain its own Git commit SHA.
