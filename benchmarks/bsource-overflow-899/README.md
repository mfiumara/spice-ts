# B-source finite-Jacobian overflow (#899)

The identical original deck `V1 in 0 400 / B2 n2 0 V = V(in)*1e307 / R2 n2 0 1k / .op` aborts at the first triangular solve before the fix, although ngspice-47 (SPARSE 1.3) returns `v(in)=400`, `v(n2)=inf`, `i(B2)=-inf`. The negative-input variant has opposite infinite signs.

## Reproduce

From the repository root, with ngspice on PATH:

```
spice-heavy pnpm exec tsx benchmarks/bsource-overflow-899/compare.ts
```

To reproduce the baseline measurement in a separate source directory:

```
mkdir -p baseline-899
git archive 283e0c7ecfac8ce0f51b73b8f8f42d3aee9f1de5 packages/core/src | tar -x -C baseline-899
spice-heavy pnpm exec tsx benchmarks/bsource-overflow-899/compare.ts baseline-899/packages/core/src/simulate.ts benchmarks/bsource-overflow-899/before.json
```

All 460 archived source files were hash-checked against that commit. This is the main commit containing prerequisite #897. Both engines receive the same bytes; all five input hashes agree between before/after receipts. Sources/licence: project-authored MIT, recorded in `benchmarks/SOURCES.md`. No tolerances or parameters are changed between engines.

## Results

Machine: macOS 27.0.1 arm64, Node v22.23.1, Homebrew ngspice-47. Its build advertises KLU support, but these default-mode runs explicitly select SPARSE 1.3.

| Probe | ngspice | Before spice-ts | After spice-ts |
| --- | --- | --- | --- |
| input 400, product | output +inf, current -inf | SingularMatrixError at n2 | same signed infinities |
| input -400, product | output -inf, current +inf | SingularMatrixError at n2 | same signed infinities |
| input 10, product | output 1e308, current -1e305 | same finite values | same finite values |
| input 400, bounded tanh | output 1, current -0.001 | same finite values (source stepping) | same finite values (source stepping) |
| conflicting voltage source | OP fails | SingularMatrixError | SingularMatrixError |

Status/vector matches increase from 3/5 to 5/5, including one matched failure (not a successful circuit). Infinite values are compared by sign, not by undefined RMS/relative arithmetic. The four successful probes also compare their input voltage and B-source current.

Single-run spice-ts timings before -> after (ms): positive 11.904 -> 11.219; negative 3.361 -> 3.204; finite 2.271 -> 2.342; bounded 1.625 -> 2.504; conflict 1.357 -> 1.442. These tiny timings include first-call/JIT effects, and ngspice timings include process startup. They are receipts, not a speed claim; both increases and decreases are retained in JSON.

## Fix and boundaries

Default sparse-solver callers still reject finite-RHS solve overflow. Newton can defer that rejection until substitution has completed and certify it only when a B-source evaluates to a signed infinity at entirely finite control values. A huge derivative alone is not certification: the bounded tanh probe still falls back to source stepping. The existing long gain-chain solver test checks rejection with both natural and AMD ordering, including an explicitly rejecting validator. Factorisation singularity handling is unchanged.

The next affine stamp at the certified point contains `inf - inf`. On convergence, ngspice dumps its linearisation point (`CKTrhsOld`), rather than the resulting NaN solve. For this certified-overflow path only, spice-ts retains that point. Ordinary finite solves keep the project's converged-solve convention; this is not the broad output-vector change investigated in #847.

This is scoped OP evidence, not proof that every overflowing circuit or subsequent AC/transient analysis matches ngspice. Other nonfinite-RHS propagation remains the behavior introduced by #897. The analytic accuracy script passes eight metrics, but its ngspice columns are empty: it is not differential evidence. The five identical-deck probes above provide the differential evidence for this fix.
