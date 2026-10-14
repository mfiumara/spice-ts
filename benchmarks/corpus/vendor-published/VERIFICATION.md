# Verification receipts for #1113

This adds a published-reference dataset and harness only; simulator behavior is
unchanged. Before: no `vendor-published` cases. After: 20 distinct reconstructed
circuits, 270 published observations, 19 eligible cases (268 observations).
One ambiguous prose/netlist resistor value is excluded before comparison.

## Executed locally

- `pnpm install --frozen-lockfile`: exit 0; existing cached workspace dependencies,
  no simulator/account installation. Existing ngspice reports ngspice-47.
- `python3 benchmarks/corpus/vendor-published/fetch-references.py`: exit 0;
  `{cases:20, points:270, chapters:7, excluded:1}`. Re-fetched successfully.
- `pnpm build`: exit 0. Existing import.meta/CJS and large browser-chunk warnings.
- `pnpm lint`: exit 0, including six artifact-guard tests and workspace tsc.
- `spice-heavy pnpm test`: exit 0. Core: 326 passed files / 1 skipped;
  4,340 passed tests / 4 expected fail / 8 skipped. Root benchmark TAP:
  207 tests, 203 passed / 4 skipped / 0 failed. This initial full run included
  the first five comparator tests; the subsequent signed-zero regression is
  independently exercised below and registered in the root test command.
- `pnpm exec tsx --test benchmarks/corpus/vendor-published/report.test.ts`:
  initial RED (missing implementation), then five passed. Receipt replay exposed
  signed-zero JSON loss; added a regression and observed RED (5 passed / 1 failed)
  before canonicalizing -0. Final GREEN: six passed / zero failed.
- `spice-heavy pnpm exec tsx benchmarks/corpus/vendor-published/compare.ts`:
  all 20 cases execute successfully in both engines. Final receipt records
  267 compared eligible points and one missing time-zero UIC point per engine;
  30 TS / 29 ngspice observations outside the printed rounding interval.
- `spice-heavy pnpm exec tsx benchmarks/corpus/vendor-published/compare.ts --check`:
  exact observation/status/hash/totals replay succeeds (timings/environment not
  compared). Losses are not erased or made into a false all-pass gate.
- `git diff --check`: exit 0.

An additional ad-hoc TypeScript compile of the benchmark import graph using
`pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler
--types node --skipLibCheck --esModuleInterop ...` encounters the existing
TS2367 at `benchmarks/corpus/corpus-f/raw-stream.ts:167`; this is outside this
change. The normal project lint passes. No unrelated typing cleanup is included.

The first runner name (`report.ts`) unintentionally triggered the existing
classic helper's basename-only CLI guard when imported. The final runner is
`compare.ts` to avoid that side effect without modifying shared classic code.
Final replay runs only these 20 cases.

## Interpretation

The sole source family is Tony R. Kuphaldt's openly published CC-BY-4.0 textbook,
one of the source categories explicitly allowed by #1113. This is not vendor
measurement, commercial-engine or semiconductor-model parity evidence. Numeric
references are historical published simulation tables, not numbers generated
by either modern engine. There is no plot read-off error; printed rounding is
not physical/model/integration uncertainty. The largest rounding-normalized
metrics are dominated by near-zero instrumental-amplifier cancellation digits;
they must not be interpreted as simulator superiority. Both shared historical
losses and engine-specific BJT losses remain published. Cold-process ngspice and
warm in-process TS timings are receipts only, not comparable speed measurements.

Shared-file hotspots: `package.json` (one appended test path),
`benchmarks/SOURCES.md` (one source attribution section), and
`.github/workflows/ci.yml` (one offline benchmark test allowlist entry). No other corpus metrics,
roadmap rows, model parameters or production solver files are modified.

The first PR head conflicted with a concurrent SOURCES.md prepend, so GitHub did
not start Actions. Merged current main into this branch, retaining both source
sections without changing the dataset/harness. The comparator is registered in
the required `accuracy` job's fast offline allowlist; root tests alone are not
the CI benchmark allowlist. Post-merge six-test run and exact native receipt
replay pass. Final SHA/check results are in the Kanban review handoff.
