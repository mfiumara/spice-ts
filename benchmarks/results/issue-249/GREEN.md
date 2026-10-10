# Issue 249 GREEN receipt

Command: `pnpm -C packages/core exec vitest run src/analysis/distortion.test.ts`

Result: 1 focused file passed, 25 tests passed, 0 failed. `git diff --check` also passed.

Implemented behavior:

- `.disto dec points start stop f2overf1` accepts only finite `0 < f2overf1 < 1`.
- Two-tone mode requires exactly one valid non-zero `DISTOF1` and exactly one valid non-zero `DISTOF2` excitation.
- The ideal-linear result exposes ngspice's separate `f1+f2`, `f1-f2`, and `2f1-f2` products.
- Single-tone results retain selectors `2` and `3`.
- Product selectors from the other mode fail explicitly.
- DEC-only, ideal R/L/C and independent-source-only, unstepped, native-only boundaries remain enforced.
