# MOS2 series-resistance evidence (#982)

Measured ngspice-47 before/after on original corpus-k git-object bytes. Baseline is the accepted receipt at `e05f5f1748bb7aaada478e9c3378ec4dfb45e17c`, not a rerun. After-build core tree is `afcd07b7b027cd11d7c2308ed84ab5d4e8b019f7`.

13 ngspice-successful fixtures were previously rejected for MOS2 resistance. After the change, 9 match, 3 run but mismatch, and 1 retains a separate temperature-model loss. e1480 stays a both-engine failure. No fixture edits, benchmark tolerance changes, aggregate refresh or speed-superiority claim.

| ID | Before | After | Worst normalized error | Worst signal | ngspice wall ms | spice-ts wall ms |
| --- | --- | --- | ---: | --- | ---: | ---: |
| k-1 | spice-ts-loss | matched | 7.29e-6 | ac i(vdd) | 178.54 | 489.15 |
| k-2 | spice-ts-loss | matched | 2.91e-6 | ac i(vdd) | 177.86 | 517.53 |
| k-3 | spice-ts-loss | matched | 1.77e-6 | op v(18) | 367.24 | 1149.70 |
| k-4 | spice-ts-loss | matched | 0.000571 | tran i(vin) | 290.48 | 806.22 |
| k-5 | spice-ts-loss | mismatch | 3.14 | tran v(xi30.13) | 277.53 | 947.29 |
| k-6 | both-failed | both-failed | not compared | - | 190.85 | 569.42 |
| k-7 | spice-ts-loss | matched | 0.00618 | tran v(x7.9) | 213.22 | 649.17 |
| k-8 | spice-ts-loss | spice-ts-loss | not compared | - | 197.19 | 518.64 |
| k-10 | spice-ts-loss | mismatch | 0.0158 | tran i(vdd) | 213.22 | 584.37 |
| k-11 | spice-ts-loss | matched | 0.00634 | tran v(444) | 830.57 | 3959.95 |
| k-12 | spice-ts-loss | matched | 0.000249 | tran i(vdd) | 240.38 | 906.49 |
| k-15 | spice-ts-loss | mismatch | 0.324 | tran v(6) | 385.42 | 1190.80 |
| k-16 | spice-ts-loss | matched | 2.94e-5 | dc v(2) | 218.86 | 607.46 |
| k-17 | spice-ts-loss | matched | 8.23e-5 | dc v(6) | 219.00 | 625.28 |

Full per-signal matched-point max/RMS absolute and relative metrics, grids, both engine statuses, original hashes and engine error lines are in `parity.json`. Null metrics mean no comparison. The uniform corpus-f 1% peak-normalized rule is unchanged. Cold engine wall includes Node/tsx startup, adapters, parse/solve and serialization, not solver-only runtime.

## Remaining scope

- k-5/cram mismatches at 3.14 normalized, worst `tran v(xi30.13)`.
- k-10/mosrect mismatches at 0.0158, worst `tran i(vdd)`.
- k-15/ring mismatches at 0.324, worst `tran v(6)`.
- k-8/gm6 rejects TEMP=125 C because the circuit temperature guard does not allow this MOS2 instance. This is no longer a resistance rejection.
- k-6/e1480 fails in both engines. After spice-ts reports timestep too small at t=0; it is not counted as a reference win.

These gaps are routed to the supervisor rather than widening this resistance-only change.

## Reproduce

Run from the repository root with ngspice-47 installed. `git fetch origin bench/980-corpus-k` retrieves the accepted fixture object if needed. Corpus-k has since merged into main; this branch was rebased onto main after that merge.

    pnpm install --frozen-lockfile
    pnpm build && pnpm lint
    python3 evidence/982/reference-probes.py
    python3 evidence/982/transient-reference.py
    spice-heavy pnpm exec tsx evidence/982/parity.ts
    pnpm exec tsx --test evidence/982/receipt.test.ts

Reference probe numbers in the unit tests come from the recorded original probe bytes and raw ngspice output (`ngspice-probes.json`, `ngspice-transient.json`). Public corpus provenance/licences are in `benchmarks/SOURCES.md` and the pinned corpus-k manifest/licence files. No GPL fixture bytes are duplicated in this evidence directory.

## Verification receipts

- RED before implementation: 18 failed, 3 passed. Exit 1.
- GREEN targeted tests after implementation and rebase: 47 passed in 6 files, including 23 new MOS2 series tests. Exit 0.
- `pnpm build` and `pnpm lint`, before and after rebase: exit 0.
- Guarded `spice-heavy pnpm test` on pre-rebase implementation `44497e89`: exit 0; 4166 passes (4010 Vitest plus 156 Node tests), 6 skipped; core 3613 passes. Final exact-head GitHub CI is the full gate after rebase.
- Guarded corpus runner: exit 0; 14 rows, 13 ngspice successes, no resistance rejection remains.
- Offline hash/status receipt test: 1 passed, exit 0.
- Ad hoc strict evidence-script tsc check: exit 2 in pre-existing imported `benchmarks/corpus/corpus-f/raw-stream.ts:167` (TS2367). Root lint is green; no unrelated harness type repair was made.
- Initial corpus-wrapper preflight exited 1 before any engines due to a selector spelling error. Corrected MOS2 to the actual baseline MOSFET level 2 error, independently verified all 14 selected IDs, and the guarded run completed.
- Nonrequired Vercel check is rate limited. No production, billing or release changes made.
