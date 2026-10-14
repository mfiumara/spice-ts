# Validation receipt (#1045)

Commands executed in this isolated worktree:

- `pnpm install --frozen-lockfile`: exit 0. Initial missing MCP dist bin warnings disappeared after build.
- `pnpm exec tsx benchmarks/corpus/corpus-l/survey.ts`: exit 0, 20 statically eligible/hash-novel candidates, before either engine ran.
- `pnpm exec tsx benchmarks/corpus/corpus-l/ingest.ts`: exit 0, 20 original decks vendored; rerun after adding provenance generation produced identical manifest bytes.
- `spice-heavy pnpm exec tsx benchmarks/corpus/corpus-l/parity.ts`: exit 0. Guard waited for an available slot, then ran both engines serially. Complete progress receipt in run.log.gz.
- `pnpm exec tsx benchmarks/corpus/corpus-l/parity.ts --render`: exit 0. Reclassified the temperature error and added all-gap numerical buckets from the existing execution receipt. No engine status, comparison metric, input, threshold or runtime changed.
- `pnpm exec tsx --test benchmarks/corpus/corpus-l/corpus-l.test.ts`: exit 0, 3 tests passed. Receipt in offline.log.
- `pnpm build`: exit 0. Receipt in build.log.gz. Existing showcase bundle-size warning retained.
- `pnpm lint`: exit 0. Receipt in lint.log.gz.
- `spice-heavy pnpm test`: exit 0. Guarded full monorepo run; complete receipt in test.log.gz.
- `git diff --cached --check -- . ':!benchmarks/corpus/corpus-l/fixtures/**' ':!benchmarks/corpus/corpus-l/licenses/**'`: exit 0 for authored files. The unrestricted staged check reports original upstream trailing whitespace and blank EOF lines. These are deliberately preserved for byte identity, not cleaned up.
- Independent byte comparison with `git show <pinned-revision>:<upstream-path>`: all 20 fixture Buffers equal upstream blobs. Root SOURCES.md retains the exact original byte prefix and only appends this batch.

Baseline results, not a simulator before/after improvement:

- ngspice-47 success/failed/unsupported: 19/0/1.
- spice-ts success/failed/unsupported: 17/1/2.
- 11 matched, 5 mismatched, 3 spice-ts execution losses, 1 ngspice unsupported.
- All 8 ngspice-success gaps accounted for: AC numerical mismatch 1; parser TypeError 2; transient numerical mismatch 4; non-nominal temperature rejection 1. Numerical root causes are not diagnosed here.

Production code and previous corpus/aggregate outcomes are unchanged. CI run IDs and exact-head checks are external publication receipts, recorded on the PR and Kanban handoff after push. Independent review is required; this worker does not merge.
