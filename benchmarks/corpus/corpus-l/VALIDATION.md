# Validation receipt (#1045)

Commands executed in this isolated worktree:

- `pnpm install --frozen-lockfile`: exit 0. Initial missing MCP dist bin warnings disappeared after build.
- `pnpm exec tsx benchmarks/corpus/corpus-l/survey.ts`: exit 0, 20 statically eligible/hash-novel candidates, before either engine ran.
- `pnpm exec tsx benchmarks/corpus/corpus-l/ingest.ts`: exit 0, 20 original decks vendored; rerun after adding provenance generation produced identical manifest bytes.
- `spice-heavy pnpm exec tsx benchmarks/corpus/corpus-l/parity.ts`: exit 0. Guard waited for an available slot, then ran both engines serially. Complete progress receipt in run.log.gz.
- `pnpm exec tsx benchmarks/corpus/corpus-l/parity.ts --render`: exit 0. Reclassified the temperature error and added all-gap numerical buckets from the existing execution receipt. No engine status, comparison metric, input, threshold or runtime changed.
- `pnpm exec tsx --test benchmarks/corpus/corpus-l/corpus-l.test.ts`: exit 0, 3 tests passed. Receipt in offline.log.gz.
- `pnpm build`: exit 0. Receipt in build.log.gz. Existing showcase bundle-size warning retained.
- `pnpm lint`: exit 0. Receipt in lint.log.gz.
- `spice-heavy pnpm test`: initial older-base run exited 0. After refreshing and rebuilding current main, the guarded full run exited 1 on the unrelated #871 exact floating-point assertion (189 pass, 1 fail, 4 skip in the final benchmark stage). The final failing receipt is test.log.gz; no all-green final-suite claim.
- `git diff --cached --check -- . ':!benchmarks/corpus/corpus-l/fixtures/**' ':!benchmarks/corpus/corpus-l/licenses/**'`: exit 0 for authored files. The unrestricted staged check reports original upstream trailing whitespace and blank EOF lines. These are deliberately preserved for byte identity, not cleaned up.
- Independent byte comparison with `git show <pinned-revision>:<upstream-path>`: all 20 fixture Buffers equal upstream blobs. Root SOURCES.md retains the exact original byte prefix and only appends this batch.

Baseline results, not a simulator before/after improvement:

- ngspice-47 success/failed/unsupported: 19/0/1.
- spice-ts success/failed/unsupported: 17/1/2.
- 11 matched, 5 mismatched, 3 spice-ts execution losses, 1 ngspice unsupported.
- All 8 ngspice-success gaps accounted for: AC numerical mismatch 1; parser TypeError 2; transient numerical mismatch 4; non-nominal temperature rejection 1. Numerical root causes are not diagnosed here.

Production code and previous corpus/aggregate outcomes are unchanged. CI run IDs and exact-head checks are external publication receipts, recorded on the PR and Kanban handoff after push. Independent review is required; this worker does not merge.

The first publication used an older main base. CI run 38542895427 exposed the unrelated #871 exact decimal assertion difference and rejected the newly tracked POTETO note and raw offline log. The note/raw log were untracked; the compressed offline receipt is retained. Current main f31762cd0c7620f93cf024bebd9061cd062cf9ab was merged without authored simulator edits. A pre-build #871 probe passed using stale dist and is not valid final evidence. After build, the targeted #871 probe and full suite both reproduce the failure at ngspice-bugs.test.ts:95: actual -0.16666666666666663 versus expected -0.16666666666666666. Current main CI run 38540814748 has the identical failure, so this is a verified upstream blocker outside this card, which forbids edits to ngspice-bugs and packages/core.

Build/lint, both-engine corpus-l measurement and all three corpus checks were rerun successfully. Totals and gap counts remain unchanged. Final core tree is 5c3bc23221cbb930fbf61a1697453c08fe6d5260. Neither failed CI run is presented as a green receipt. The implementation must wait for the supervisor-routed upstream fix, then refresh and obtain all four green checks at its new exact head before completion.
