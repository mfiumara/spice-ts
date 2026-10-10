# Issue 249 RED receipt

Command: `pnpm -C packages/core test -- src/analysis/distortion.test.ts`

Base: `f737698`

Result: expected failure. Vitest executed the core suite because of the package script argument shape. 78 files ran, 77 passed and 1 failed. 852 tests ran, 845 passed and 7 failed.

The failures prove the missing behavior before implementation:

- `DistortionResult.products` is absent for the existing single-tone result.
- The exact two-tone fixture is rejected at `.DISTO DEC 10 1k 1Meg 0.9`.
- bounded `f2overf1` validation is absent.
- non-zero `DISTOF2` remains rejected even for the intended two-tone form.
- the three ngspice products `f1+f2`, `f1-f2`, and `2f1-f2` are not representable.

The unchanged suite otherwise passed 845 tests. The full generated JUnit output is not committed because it includes the worktree path and unrelated suite details.
