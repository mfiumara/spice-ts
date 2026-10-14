# Native retained dot-analysis pairing (#1009)

Adapter-only change. No core, deck, tolerance or solver-order changes.
Baseline main is `169d683d89b77c8ccb5a9459bc3888c4ec0aba62`.
Node v22.23.1, ngspice-47, macOS. These are coverage/error measurements,
not a speed claim.

## Identity rule

`analyses[]` retains native execution order. For ac/dc/op/tran, source rank k
among n runs maps to raw same-type occurrence n-1-k (zero based).
The adapter emits `dot:<type>:<occurrence>` IDs, with occurrence one based.
The shared pairer resolves these against the full raw list, never Plotname.
Packed signal batches preserve the already-resolved identity instead of
reindexing their singleton subset. Unsupported or absent targets stay unmatched.
Evidence is `benchmarks/repeated-dot-1009/README.md`, including the interleaved
probe and the diode's 3-point second card preceding its 11-point first card.

Without retained runs the original adapter path is unchanged. Unmeasured
noise/pz/disto types keep the aggregate mapping. Both interpreted and lowered
straight-line `.control` decks keep the legacy control path. Core also puts
lowered-control runs in `analyses[]`, but the dot-card batch rule does not apply
there. `.step` remains unchanged, including the legacy adapter's unsupported
step-envelope result. One plot is emitted per retained supported run even if
the manifest repeats its type.

## Five-deck audit

`inventory.json` contains full scalar errors, input hashes and raw receipt hashes.
Each before/after pair maps the same memoized native `simulate()` result.
There is one native simulation and one byte-identical ngspice run per fixture,
not a rerun per analysis card. The exact main adapter is snapshotted by
`prepare.py`. Its result also equals the diagnostic last-per-type reconstruction.
All packed comparisons equal the object comparisons.

| Fixture | Before paired/unmatched | After paired/unmatched | Worst normalized error on newly paired plots |
| --- | --- | --- | --- |
| corpus-e/bjt-diffpair-current-source | 3 / 2 | 5 / 0 | 3.4971261986e-7 (AC v(3)) |
| corpus-e-spice3/vcvs-operating-point | 2 / 4 | 6 / 0 | 1.6709965559e-16 (AC v(4)) |
| corpus-e-spice3/diode-temperature-sweep | 2 / 2 | 4 / 0 | 2.6144031412e-5 (DC i(v1)) |
| corpus-e-spice3/mos1-nand-transient | 2 / 4 | 6 / 0 | 0.0037937190314 (OP v(5)) |
| corpus-e-spice3/dual-lc-uic-rejection | 1 / 1 | 2 / 0 | 2.2382632412e-14 (TRAN i(l1)) |

Total paired 10 -> 23, unmatched 13 -> 0. All five become matched under the
existing uniform 0.01 normalized-error threshold. There are no newly paired
mismatches to file. The NAND OP error remains nonzero and is published, not
hidden by changing its voltage floor or tolerance.

## Aggregate gate and diagnostic (not a canonical refresh)

The required `spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check`
was actually run. It exits 1 before simulations because main's SOURCES and
fixture-tree pins are stale. The exact main checker reproduces exit 1.
Thus the canonical check delta is FAIL -> FAIL, not a claimed pass.
Production pins, `aggregate-report.json`, and `AGGREGATE_PARITY.md` are untouched.
The checker requires a coordinated pin/report refresh; that is outside this
adapter card and must not be silently folded into it.

For numeric regression evidence, `prepare-aggregate.py` creates an ignored,
explicitly diagnostic checker copy. Only its historical pin rejection is
bypassed; every fixture's manifest byte hash is still verified. It records
both adapter views from the same native execution, writes a separate raw
receipt, then still exits 1 at the canonical accounting/provenance gate.
No diagnostic result is substituted for a green canonical gate.
`aggregate-delta.json` is the scalar summary of those 100 fixtures:

- Matched / not matched: 44 / 56 -> 45 / 55.
- Paired / unmatched plots: 71 / 27 -> 73 / 32.
- All 71 previously paired comparisons have exactly unchanged numeric receipts,
  including primary and plain-linear metrics. Zero matched-to-not-matched losses.
- Native engine status stays 68 success, 1 failed, 31 unsupported.
- ngspice status stays 52 success, 48 failed.
- Additional unpairable native plots are honestly exposed in the original,
  untranslated corpus-e diode (2 -> 4), NAND (2 -> 6), and dual-LC (1 -> 2)
  decks. Their references already fail; these are distinct from the translated
  corpus-e-spice3 decks above. More unmatched coverage is not a regression in
  already-paired data, and it is not called a win.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm -C packages/core exec vitest run src/simulate-dot-analysis-runs-1009.test.ts
pnpm exec tsx --test benchmarks/dot-analysis-pairing.test.ts benchmarks/plot-alignment.test.ts benchmarks/plot-identity-970/audit.test.ts benchmarks/comparison-harness.test.ts
python3 benchmarks/dot-analysis-1009/prepare.py
spice-heavy pnpm exec tsx benchmarks/dot-analysis-1009/compare.ts
spice-heavy pnpm exec tsx benchmarks/aggregate-report.ts --check
spice-heavy pnpm exec tsx benchmarks/dot-analysis-1009/.snapshot/main/before-check.ts --check
python3 benchmarks/dot-analysis-1009/prepare-aggregate.py
spice-heavy pnpm exec tsx benchmarks/dot-analysis-1009/.snapshot/diagnostic.ts --check
python3 benchmarks/dot-analysis-1009/summarize-aggregate.py
spice-heavy pnpm test
```

Install, build and lint exit 0. Targeted core Vitest has 8 passing tests.
Targeted Node tests have 109 passing tests. The first regression commit
`f0ad46b0` fails before the adapter fix; the additional lowered-control guard
also has a captured RED receipt. The full guarded suite and exact-head CI
receipts accompany the PR/handoff. Compressed command logs are committed.
The final guarded full suite exits 0 (core 4,135 passed, 2 skipped; root
benchmark Node tests 188 passed, 4 skipped; other workspace suites also pass).
The initial RED fixture incorrectly named a step device `resistance`; the
final regression uses real R1 and asserts the unchanged unsupported envelope.
Raw waveform/comparison receipts are an attached evidence archive, not new
canonical report artifacts. Initial diagnostic setup failures (ESM named
import, prepended shebang, circular executable-name guard and stale pins)
were corrected or explicitly scoped before collecting the final diagnostic.

## Sources

Fixtures are unchanged GPL-3.0-or-later Gnucap originals/translations already
recorded in `benchmarks/SOURCES.md`. Synthetic regression tests and evidence
scripts are original MIT project work. No third-party deck or licence is added.
