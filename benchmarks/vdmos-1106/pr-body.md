## What / why

Fixes #1106.

Repair generic benchmark plot pairing and reference DC coordinate export, not the VDMOS solver. A first numbered control plot can pair with a single descriptive raw header; explicit mismatched IDs, ambiguous multiple raw targets and later unmatched control plots remain unpaired. Packed batching carries resolved identities. The ngspice batch exporter declares dot-card provenance so a single literal nested .dc retains secondary coordinates despite straight-line control commands. Existing conservative dynamic guards and tolerances remain unchanged.

No packages/core, parser, deck, fixture, tolerance, fine-step or aggregate-report changes. Sources and complete actual plot/vector inventories are documented in benchmarks/vdmos-1106/.

## Evidence

RED-first commit 5e52d9e8b0140b99c2ed8c56e31610da9d97078d captures actual exported shapes and reproduces six failures. GREEN tests also verify packed/unpacked receipt equivalence and ambiguous/explicit identity and provenance guards.

Both engines ran all eight byte-identical original decks against ngspice-47 under spice-heavy. Threshold stays 0.01. Before n-8..n-13 had zero signals/null error.

| Deck | Before | Before signals | After | After signals | Worst normalized error |
|---|---|---:|---|---:|---:|
| n-6 | matched | 7 | matched | 7 | 1.52e-8 |
| n-7 | matched | 5 | matched | 5 | 0.00104 |
| n-8 | not-compared | 0 | matched | 10 | 6.54e-13 |
| n-9 | not-compared | 0 | matched | 10 | 0.00424 |
| n-10 | not-compared | 0 | matched | 8 | 8.34e-5 |
| n-11 | not-compared | 0 | matched | 8 | 8.66e-5 |
| n-12 | not-compared | 0 | mismatch | 10 | 3.16e-5 |
| n-13 | not-compared | 0 | matched | 8 | 1.48e-8 |

n-12 remains a coverage loss: extra spice-ts dc2 (486 points) has no batch raw counterpart. It remains an unmatched record, not dropped. Common-vector scoring is unchanged; all noncommon/missing vectors are explicitly inventoried in after.json.gz coverage. Saved device vectors on n-8/n-9 remain missing, so matched here is not full-vector coverage. No revealed numerical error exceeds 0.01 and no numerical mismatch issue was necessary. Remaining saved-vector/control-vs-batch inventory scope is reported to the supervisor.

Root cause: ID-bearing control plots were refused against ID-less headers (n-8/n-9/n-12); suppression of ngspice outer coordinates forced bit-identical reset-ordinal checks, rejecting all nested groups on tiny primary-grid rounding differences (n-10/n-11/n-13, also n-12). Adding actual declared coordinates uses existing secondary-value alignment without loosening any tolerance.

## How to test

- pnpm install --frozen-lockfile
- pnpm build
- pnpm lint
- pnpm exec tsx --test benchmarks/vdmos-1106/comparison.test.ts benchmarks/dot-analysis-pairing.test.ts benchmarks/plot-alignment.test.ts
- spice-heavy pnpm exec tsx benchmarks/vdmos-1106/run.ts after
- python3 benchmarks/vdmos-1106/report.py
- spice-heavy pnpm test

All executed successfully locally. Compressed logs and complete before/after exports/receipts are committed. report.py verifies eight input hashes, unchanged exported samples and plot inventories (except added ngspice secondary metadata), and identical n-6/n-7 comparisons. Required exact-head CI will be recorded in the Kanban handoff. No merge requested from this engineer.
