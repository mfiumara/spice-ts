# Combined parser preparation receipt

Refs #1000. Refs #991. The combined candidate meets the issue's local fixed-matrix gate. Independent review and exact-head CI are separate gates; no merge is authorized by these measurements.

## Change and measured hypothesis

Pinned control `a521e9e221f4445639d899265589e5893a07e165`, the worktree's initial main revision. The production diff is seven added lines in `parser/numparam.ts` and `parser/preprocessor.ts`. No circuit-specific branch, cache, tolerance adjustment, tokenizer rewrite or options change. `parser/index.ts` is unchanged in the shipped diff.

The ten-round baseline attributes auto-bracing at 26.786 / 4.347 ms on RC10k and 30.572 / 4.464 ms on Mesh10k. Statement substitution is another 8.536 / 1.604 and 9.999 / 0.788 ms. Times are instrumented exclusive medians / IQR, not estimates of uninstrumented savings.

Combine the previously rejected empty-scope bracing guard with a delimiter/dispatch guard on substitution. Collect every parameter frame before checking emptiness, preserving later and nested definitions. Cards without braces or quotes bypass substitution only when they are neither B/E/G cards nor dot directives. B/E/G cards can contain bare expressions, and measurements can contain bare parameter operands. Their original paths remain intact. Expressions in comments are not ignored by the guard; existing diagnostics remain unchanged.

Expected saving was the old roughly 20% bracing reduction plus part of the measured substitution bucket. No isolated claim is made for either component in this run. The first and only combined comparison is retained. No screening attempts were discarded.

## Results

`table.md` contains all six parse and cold-wall medians / IQRs, native ratios, worst-wall losses and baseline subphase attribution. `baseline/table.md` retains every detailed instrumented bucket, including numeric-parameter and preparation leaves.

- RC10k parse 120.640 / 21.844 -> 82.524 / 17.923 ms, 31.595% reduction.
- Mesh10k parse 119.169 / 33.386 -> 88.445 / 11.176 ms, 25.782% reduction.
- Both 10k IQR pairs are disjoint. No 1k/50k parse regression beyond IQR.
- RC1k / Mesh1k reductions 26.607% / 29.792%; RC50k / Mesh50k 34.884% / 34.255%.
- Median cold wall improves in all six groups. Individual rounds still lose. RC10k worst cold wall increases 94.543 ms; Mesh50k worst cold wall increases 396.234 ms. Those cells are retained.
- All TS cold-wall medians remain slower than direct ngspice. No native superiority claim.

The shared Mac was busy. This is cold-start evidence, with considerable variance, not an isolated-host universal speedup. Mesh10k is only 0.782 percentage points above the gate. The independent reviewer must reproduce the fixed matrix and evaluate that margin, not select a favorable subset. Every cell includes load average and process counts. Parent wall includes Node startup, import, serialized-state hashing and complete output hashing; the native denominator includes raw emission but excludes its Node wrapper. Neither ratio is a parse-only comparison.

## Controls, equality and provenance

Node v22.23.1, Darwin 27.0.0 arm64, ngspice-47 with KLU. See `host.json` files for machine/version metadata and `receipts.jsonl` for cell load. Existing original MIT scaling generators are reused from `scaling-m2-fixture.mjs`, already recorded in `benchmarks/SOURCES.md`. No new external circuit or licence. Decks are byte-identical to the historical scaling matrix, checked by the unchanged preparation harness.

The unchanged #951 continuous-clock controller owns serial cold process groups, rotates control/candidate/ngspice order over ten rounds and enforces 30 s per-child and 300 s cumulative actual elapsed limits. Every heavy run uses `spice-heavy`.

- Baseline 60/60 certified cells, 32.190712 s actual elapsed.
- Comparison 180/180 certified cells, 148.854817 s actual elapsed.
- All owned groups reaped. No deadline failures, clock disagreements, censored cells, retries or trimming.
- Complete output hashes and enumerable Circuit-state hashes, including Map/Set entries, unchanged in every TS comparison cell at every size. Baseline and comparison 10k hashes also match.
- Full parser corpus capture compares 951 successful parse calls across 63 files / 1,431 tests, with 771 unique input/state pairs. The sorted multiset SHA256 is `fe6b2d01637f62bf5de89813c1de493c384340fc2d1d9e7cb63acbf9d7cb5c5f` before and after. Expected-error tests also pass, but successful-state capture does not serialize thrown errors, functions or non-enumerable state.

`corpus-hook.patch` is temporary benchmark-only instrumentation at the Circuit return boundary. It is archived but NOT applied in the production diff. The hook and setup run outside the timing matrix. Input and state hashes are retained per successful call in both `corpus-*.jsonl` files. This proves equivalence of the corpus's serializable parse state, not just equality of test pass counts.

`candidate.patch` archives the exact production change used for all measurements. Source HEAD remained the pinned baseline while that working diff was built. `prepared.json` stores bundle byte hashes, so the candidate is identified by both patch and exact executable bytes. Native raw bytes are retained losslessly as timestamp-varying headers plus deduplicated binary payloads. The unchanged verifier reconstructs each full raw and checks its SHA256. Text and bundles are gzip-compressed without omitting bytes.

## Commands and receipts

Executed locally, final exits 0 unless noted:

```
pnpm install --frozen-lockfile
pnpm build
pnpm -C packages/core exec vitest run src/parser
spice-heavy python3 benchmarks/performance/linear-10k.py benchmarks/performance/results/parse-1000-combined/baseline --parse
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/parse-1000-combined/baseline
# Apply candidate.patch, then:
pnpm -C packages/core exec vitest run src/parser
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/linear-10k.py benchmarks/performance/results/parse-1000-combined/comparison --parse --before benchmarks/performance/results/parse-1000-combined/baseline
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/parse-1000-combined/comparison
node --test benchmarks/performance/parse-1000.test.mjs benchmarks/performance/linear-10k.test.mjs
python3 benchmarks/performance/linear-10k-test.py
pnpm build
pnpm lint
spice-heavy pnpm test
node --test benchmarks/performance/results/parse-1000-combined/evidence.test.mjs
node benchmarks/performance/results/parse-1000-combined/report.mjs
```

Characterization tests were authored before production changes, then run on the control. Initial guessed expected formatting/case and comment behavior produced four assertion failures on unchanged code. Expected values were corrected to observed existing behavior, then all 1,431 parser tests passed before and after. This is performance characterization, not a claimed simulator bug reproduction. The first evidence-test execution failed on an incorrect relative import; corrected before the six final evidence tests passed.

Frozen install and all builds pass. Lint passes. Guarded full monorepo suite passes locally: core 4,110 passes / two existing skips, root benchmark tests 177 passes / four skips; all other workspace suites pass. Existing harness tests 17 passes, controller tests six passes, new evidence tests six passes. Full native corpora ran only through the guarded root suite. No aggregate report was invoked.

### Reproduce without overwriting receipts

The archived matrices are immutable. Run from the repository root in a fresh worktree of this PR. Use new output directories, which must not contain `receipts.jsonl`.

```
E=benchmarks/performance/results/parse-1000-combined
# Rebuild the source-identical control, then restore the candidate source.
git apply -R "$E/candidate.patch"
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/linear-10k.py "$TMPDIR/parse-combined-fresh-baseline" --parse
node benchmarks/performance/linear-10k-verify.mjs "$TMPDIR/parse-combined-fresh-baseline"
git apply "$E/candidate.patch"
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/linear-10k.py "$TMPDIR/parse-combined-fresh-comparison" --parse --before "$TMPDIR/parse-combined-fresh-baseline"
node benchmarks/performance/linear-10k-verify.mjs "$TMPDIR/parse-combined-fresh-comparison"
```

Alternatively compare the archived source-identical control bundle directly against a fresh candidate build using `--before "$E/baseline"`; the preparer supports gzip archives. Do not instrument either side of the decisive comparison.

Corpus reproduction, with fresh files named through `PARSE_CORPUS_RECEIPT`:

```
git apply "$E/corpus-hook.patch"
PARSE_CORPUS_RECEIPT="$TMPDIR/corpus-fresh-candidate.jsonl" pnpm -C packages/core exec vitest run --config ../../benchmarks/performance/results/parse-1000-combined/corpus.config.mjs
git apply -R "$E/candidate.patch"
PARSE_CORPUS_RECEIPT="$TMPDIR/corpus-fresh-control.jsonl" pnpm -C packages/core exec vitest run --config ../../benchmarks/performance/results/parse-1000-combined/corpus.config.mjs
git apply "$E/candidate.patch"
git apply -R "$E/corpus-hook.patch"
```

Compare sorted input/state multisets, preserving duplicate counts. Restore source patches even if a test fails. `evidence.mjs` shows the exact serialization/comparison. `archive.mjs` supports lossless compression of newly completed matrices; use once per fresh directory. SHA256SUMS covers archived bytes, not hypothetical regenerated timing results.

Exact PR head, required CI run and independent review are recorded in the PR and Kanban handoff after publication. This receipt never implies that a local gate substitutes for them.
