## What and why

Fixes #970 once the gated corpus audit and independent post-audit exact-head review finish. This is the benchmark-adapter implementation slice, not the final merge-ready evidence head.

Retain every control plot and its engine ID; pair plots one-to-one in both shared and classic reports; report unmatched plots instead of silently dropping them. Preserve identity/secondary coordinates through packed and lazy transports and normalize against each actual paired reference peak. Compare explicit secondary coordinates per group and preserve reset identity across the old 25k target-chunk boundary. No core source, deck, SOURCES catalogue, threshold or AGGREGATE_PARITY artifact changes.

## How to test

- `pnpm install --frozen-lockfile`
- `pnpm build && pnpm lint`
- `pnpm exec tsx --test --test-skip-pattern='runs the spice-ts child without per-sample|compares both engines on every signal' benchmarks/comparison-harness.test.ts benchmarks/aggregate-report.test.ts benchmarks/corpus/corpus-f/corpus-f.test.ts` (95 passed)
- `spice-heavy pnpm test`
- `pnpm exec tsx --test benchmarks/plot-970/receipt.test.ts` (offline raw receipt replay)
- Live exact-#968 reference replay recipe in `benchmarks/plot-970/README.md`; its engine runs are guarded with `spice-heavy`.

The offline synthetic/saved-receipt checks join the existing CI-allowlisted classic report test entrypoint, without editing CI/package scripts.

## Evidence

Fresh base c4858434e58fedeeedab142f2479252e0a59e851. #968 was still open; reference engine cc1896298a1e7e884f1989593228a1bc2b97419f is built only in an ignored archive directory. Both adapters receive identical original j-14 input (SHA256 64980e734428b4a24605d1fff5004cd393a1108be56e36618c1c280847fc0952).

- j-14 before: 1 compared plot, 6 aligned points, 180 excluded, worst normalized 11.640724167089497.
- j-14 after: 6 compared plots, 1236 aligned points, 0 excluded, worst normalized 7.609774879516523e-9.
- TEMP losses retained: NMOS/PMOS drain absolute max 5.84894348297301e-13 / 8.36588334233654e-13 A and relative max 1.336169668272112 / 1.4273786867425677.
- Nested chunk baseline RED: 25,000/30,000 aligned, 5,000 excluded. GREEN: all 30,000 aligned.
- Neighboring corpus-j controls: j-12/j-13 unchanged; j-16/j-18 remain unsupported and unscored. All five control rows retained in corpus-j-delta.json.
- First pairing RED run reproduced 2 failures out of 5 tests. A separate classic-caller RED/GREEN checks the sibling report path.

Every signal's raw/max/RMS/relative metrics is retained in `benchmarks/plot-970/`, including the near-zero -40 C residuals. No speed claim. Auxiliary standalone TypeScript checking retains the pre-existing raw-stream.ts state-narrowing error; normal build/lint/executed tests pass.

## Remaining gates. Do not merge this head

Supervisor-owned child t_8f41d8b0 audits all 700 manifest entries on the same raw outputs, lists every comparison change/direction, and enforces the settled dynamic fallback policy (equal reset-group count + matching primary grids; otherwise unmatched; inventory tag `ordinal-aligned`). The current legacy reset-ordinal fallback still permits within-group interpolation, so final dynamic-policy acceptance is explicitly deferred to that child. It will fast-forward audit commits onto this PR branch. Independent review t_18974a9e and merge gate t_801de2db apply to the post-audit exact head. Aggregate regeneration stays with the nightly lane.
