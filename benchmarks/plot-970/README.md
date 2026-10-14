# Plot identity and nested DC alignment (#970)

Implementation slice. The exhaustive 700-entry corpus delta inventory and the supervisor's final dynamic-coordinate fallback policy are gated follow-up work (t_8f41d8b0), followed by independent review of the post-audit head (t_18974a9e) and a merge gate (t_801de2db). Do not merge this implementation head or close #970 before those gates finish. No aggregate regeneration in this lane.

## Adapter changes

- Retain all native control runs and all retained ngspice control plots. Export by the actual ngspice plot IDs, not `setplot <type>1`.
- Pair plots one-to-one by engine ID. Legacy descriptive raw titles use name/occurrence without reference reuse. Report unmatched plots from either engine, including empty plots; unmatched receipts and zero-sample signals cannot produce a corpus match.
- Preserve plot IDs and secondary DC coordinates in packed and lazy transports. Normalize each signal against the actual paired reference plot, including repeated descriptive names.
- Match explicit secondary coordinates independently of outer-group order. Interpolate only within the matched primary group. Report unmatched groups and keep them in the missing-coverage count.
- Keep a whole nested coordinate space when measuring it. The old 25,000-target-point chunks lost reset identity at chunk boundaries. The baseline replay aligns 25,000 of 30,000 identical synthetic points and excludes 5,000; the new regression aligns all 30,000.

Reference secondary coordinates are reconstructed from straight-line literal DC commands and the observed primary resets. Dynamic control scripts deliberately do not receive invented coordinates. The current receipt marks the legacy fallback `sweepAlignment: reset-ordinal`. The audit child owns the newly settled stricter fallback policy: equal group count and matching primary grids, unmatched otherwise, and fixture tag `ordinal-aligned`. That policy acceptance is not claimed by this implementation slice.

The existing metric's relative-zero threshold and all normalization floors and match thresholds are unchanged. No deck, core source, SOURCES catalogue or AGGREGATE_PARITY artifact was changed. No runtime superiority claim.

## j-14 on identical original input

The input is ngspice's `examples/mos/nmos_pmos_BSIM330.sp`, already licensed and attributed in `benchmarks/SOURCES.md` and corpus-j/SOURCES.md. Input SHA256 is `64980e734428b4a24605d1fff5004cd393a1108be56e36618c1c280847fc0952`.

#968 is not assumed merged. Both adapters replay the exact reference core `cc1896298a1e7e884f1989593228a1bc2b97419f`, built in an ignored directory from its git archive. Production core sources and built production dist are not replaced. The baseline adapter and metric come from fresh main `c4858434e58fedeeedab142f2479252e0a59e851`. The baseline projects the old first-plot export from the same ngspice output, while its native adapter exposes the latest DC result. This is adapter evidence, not a simulator improvement.

| Metric | Before | After |
|---|---:|---:|
| Compared plots | 1 | 6 |
| Aligned points | 6 | 1236 |
| Excluded points | 180 | 0 |
| Worst normalized mismatch | 11.640724167089497 | 7.609774879516523e-9 |

All six raw output pairs are saved in `j14-raw.json.gz`. `j14.json` records every signal's absolute/relative max/RMS errors and each plot's secondary coordinates/group coverage. An offline test recomputes every after comparison and asserts that the near-zero TEMP losses remain:

- NMOS dc3 i(vdsn): absolute max 5.84894348297301e-13 A, relative max 1.336169668272112.
- PMOS dc6 i(vdsp): absolute max 8.36588334233654e-13 A, relative max 1.4273786867425677.

The large relative residuals at -40 C are not erased by the small normalized error.

## Scoped neighboring-fixture delta

`corpus-j-delta.json` covers all five control fixtures of corpus-j using the same pinned reference core for both adapters. j-12 and j-13 have unchanged error/alignment; j-14 has lower adapter error and more coverage. j-16 and j-18 remain unsupported and unscored, with their .title/.backanno errors preserved. This is not an exhaustive other-corpus inventory. That remaining acceptance item belongs to the gated audit child.

## Reproduce

From the repository root:

1. `pnpm install --frozen-lockfile`
2. `mkdir -p benchmarks/plot-970/.reference`
3. `git archive cc1896298a1e7e884f1989593228a1bc2b97419f packages/core | tar -x -C benchmarks/plot-970/.reference`
4. `pnpm -C packages/core exec esbuild ../../benchmarks/plot-970/.reference/packages/core/src/index.ts --bundle --format=esm --platform=node --outfile=../../benchmarks/plot-970/.reference/index.js`
5. `python3 benchmarks/plot-970/prepare.py`
6. `pnpm exec tsx benchmarks/plot-970/chunk-red.ts` (expected exit 1 against the archived baseline)
7. `spice-heavy pnpm exec tsx benchmarks/plot-970/j14.ts`
8. `spice-heavy pnpm exec tsx benchmarks/plot-970/corpus-j-delta.ts`
9. `pnpm build && pnpm lint`
10. `pnpm exec tsx --test --test-skip-pattern='runs the spice-ts child without per-sample|compares both engines on every signal' benchmarks/comparison-harness.test.ts benchmarks/aggregate-report.test.ts benchmarks/corpus/corpus-f/corpus-f.test.ts`
11. `spice-heavy pnpm test`

The targeted command passes 95 tests. It omits the two long corpus-f heap/engine tests; the guarded full suite runs them. The new synthetic and saved-receipt tests join the existing CI-allowlisted classic report test entrypoint. The comparison-harness entrypoint also imports those tests plus the live export test, without changing package scripts or CI files. The export test explicitly skips if ngspice or built core is absent; the offline saved-receipt test needs neither.

The first five regression tests were run before the pairing fix and reproduced two failures (reference reuse and silently dropped reference plots). The chunk-boundary defect was additionally reproduced by replaying the archived baseline after initial implementation. Logs are real captured tool output, not reconstructed transcripts. An auxiliary standalone tsc check reports the pre-existing raw-stream.ts control-flow error; normal build/lint and executed tests are the verification gates.
