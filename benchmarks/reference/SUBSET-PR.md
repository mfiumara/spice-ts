## What / why

Publish the separate mutually accepted ngspice47 / Xyce7.10.0 cross-check for #948 step4. Start with the original100 aggregate fixtures, then grow in original F..J manifest order, independently of spice-ts outcomes.

Fixes #973. Refs #948, #974, #975. The umbrella #948 remains open.

## Results

- All661 original licensed A..J fixtures attempted and retained.
-124 reference-eligible; first100 selected deterministically.24 further eligible rows explicitly excluded only because the target was reached.
-337 unsupported,163 attempt-pipeline failures,37 transformed-with-loss retained. One inherited `native-failure` label is actually an Xyce translation limitation; its typed cause and the precise fixture are documented in SUBSET-EVIDENCE.md, not treated as convergence evidence.
- Selected100 descriptive buckets:29 absolute<=1e-9;12 relative<=1e-3;58 relative>1e-3;1 absolute-only. Uniform thresholds do not affect selection. No model-equivalence or spice-ts parity claim.
- Initial100 before/after remains26 eligible, with identical statuses, eligibility and all eligible/partial numerical metrics. More selection coverage is not a speed or accuracy improvement.

Artifacts in benchmarks/reference/mutual-948: subset manifest (ids/hashes/analysis types/every exclusion), all661 per-fixture rows and per-signal max/RMS absolute/relative errors, full native warnings and failures, canonical/projection hashes, summary buckets and reproduction instructions.

The initial run hit V8 JSON string-size limits while hashing a very large diagnostic export after632 saved rows. RED/GREEN bounded serialization hashes identical JSON bytes in4096-sample chunks, with no dropped samples. Resume validates original/canonical/input/output hashes and unchanged native adapter policy/manifest hashes; the632-row interrupted receipt and both source-hash execution segments are preserved. All remaining rows completed successfully.

## How to test

- pnpm install --frozen-lockfile
- pnpm build && pnpm lint
- spice-heavy pnpm test
- pnpm exec tsx --test benchmarks/reference/compare.test.ts benchmarks/reference/xyce.test.ts
- XYCE_BIN=<pinned Xyce7.10 serial executable> pnpm exec tsx --test benchmarks/reference/compare.test.ts benchmarks/reference/xyce.test.ts
- XYCE_BIN=<pinned Xyce7.10 serial executable> spice-heavy pnpm exec tsx benchmarks/reference/subset.ts --output-dir benchmarks/reference/subset-rerun

Local install/build/lint/types PASS; both guarded full-suite runs PASS; offline16 PASS/8 live SKIP, live24 PASS. The existing required build CI gate imports subset receipt tests. Evidence and logs are under benchmarks/reference/SUBSET-EVIDENCE.md and subset-*.log. Required CI on the exact PR head is tracked separately before handoff.

No aggregate ledger/scoring, simulator, package versions, npm, tags/releases or release PR edits. SOURCES.md is an additive hotspot only. Independent exact-head review required; no merge by the engineer.
