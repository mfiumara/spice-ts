# Issue 451: `.pz` eigenvalue root-finder receipt

Tools: ngspice-47 (Homebrew, `ngspice -b`), Node v22.23.1, Apple M5 Pro, macOS 27.0.1 arm64. Base: `origin/main` `34905274f3cf46761e95c3fcf9877cf6442ade68`. No fixture bytes changed, no tolerance was loosened, nothing is tuned per circuit.

## What changed

`solvePoleZero` used to build the characteristic polynomial of `G⁻¹C` from traces of matrix powers (Newton identities), trim its coefficients at 1e-10/1e-12 of the largest one, and find roots with Laguerre iteration. Across 8 decades of time constants that polynomial cannot be represented in double precision, so roots were lost.

It now finds the finite roots s of `det(A + sB)` directly as eigenvalues (`packages/core/src/analysis/real-eigen.ts`: balancing, Householder Hessenberg reduction, Francis double-shift QR):

- poles: `A = G`, `B = C`. Zeros: the bordered pencil `A = [[G, b], [cᵀ, 0]]`, `B = [[C, 0], [0, 0]]`. For `vol`, the poles are the zeros of the driving-point transfer, the same definition as before.
- `B = X·Y` is a rank-revealing factorization on a power-of-two row/column-equilibrated copy, so henries next to picofarads do not drop a capacitor. The eigenproblem is `M = Y (A + σB)⁻¹ X`, rank(B) × rank(B), with μ = 1/(σ − s).
- M is split into irreducible diagonal blocks (strongly connected components of its exact nonzero pattern). Unilateral couplings such as cascaded gm stages fall between blocks, so they cannot distort rank decisions.
- Within a block, infinite roots (zero eigenvalues of M, including Jordan chains from relative degree ≥ 2) are removed by repeated rank-revealing `M = QR → RQ` with a tolerance fixed from the block's original scale. They are not removed by a magnitude cut on the eigenvalues.
- σ = 0 unless A is singular (a root at s = 0, for example a zero at DC). In that case σ is a fixed irrational multiple of the geometric-mean pole magnitude, and roots at the origin are the zero eigenvalues of `I − σM`, removed the same way and reported as exact zeros.
- Output order is now ngspice's: ascending real part, with the positive-imaginary member of a conjugate pair first. The aggregate harness compares `pole(k)`/`zero(k)` by index, so the old negative-first order showed a spurious `2·|Im|` error on every complex pair.
- The `MAX_DYNAMIC_ORDER = 12` limit and the typed `InvalidCircuitError`s are unchanged. A non-converging QR iteration raises `InvalidCircuitError('.pz eigenvalue iteration did not converge')`.

## Acceptance fixture: `ngspice/vbic-common-emitter-ac` (`CEamp.cir`, SHA-256 `088d1ebe…20ab`, unchanged)

ngspice-47 prints 7 poles and 6 zeros. spice-ts before: 3 poles, 1 zero. After: 7 poles, 6 zeros.

Per-index aggregate metric (`compareExecutions`), after:

| root | max abs error | max rel error |
|---|---:|---:|
| pole(1)…pole(7) worst | 1.30e4 (pole 1, \|p\| = 1.17e12) | 1.2e-7 (pole 6) |
| zero(1)…zero(6) worst | 1.37e4 (zero 1, \|z\| = 1.32e12) | 1.9e-8 (zero 6) |

Every root agrees with ngspice's printed 6-significant-digit values. `vbic.test.ts` now runs the `#451` guard as a normal test (it was `it.fails`) with the issue's 1e-3 relative tolerance. That test's root sort now treats magnitudes within 1e-6 as a tie. Without that, ngspice's differently rounded conjugate halves (4.728303e10 / 4.72830e10) would pair each actual root with the wrong conjugate.

The "extra" zero at -6.475462e10: ngspice-47 prints it as zero(5) of 6 (`-6.47546e+10, 0`). An independent `scipy.linalg.eigvals` QZ on the exported bordered pencil gives the same 6 zeros, so it is a real zero and is expected. #446/PR #457 already pinned it in `NGSPICE_ZEROS`.

## Aggregate fixtures that declare `.pz` (same adapters as `benchmarks/aggregate-report.ts`)

`measure.ts` → `pz-fixtures-before.json` (base) / `pz-fixtures-after.json` (branch). Counts are spice-ts / ngspice.

| fixture | before counts | before worst rel err | after counts | after worst rel err |
|---|---|---:|---|---:|
| ngspice/vbic-common-emitter-ac | P 3/7, Z 1/6 | 0.9999998 | P 7/7, Z 6/6 | 1.2e-7 |
| classic/pole-zero-four-stage | P 4/4 | 1.3e-11 | P 4/4 | 1.7e-16 |
| classic/pole-zero-three-stage (triple pole) | P 3/3 | 2.4e-4 | P 3/3 | 1.8e-13 |
| classic/high-pass-pole-zero | P 1/1, Z 1/1 | 1.2e-16 | P 1/1, Z 1/1 | 1.2e-16 |
| corpus-d/passive-pole-zero-ac | unsupported (parse: `type=idc`); ngspice failed | — | unchanged | — |

No aggregate `.pz` fixture got worse. The committed aggregate artifacts were not regenerated here; the aggregate refresh lane owns them.

`benchmarks/pole-zero/compare.ts`: 0 failures / 0 losses before and after. Worst relative error: active-four-stage poles 1.3e-11 → 1.7e-16, passive-rlc-voltage poles 6.0e-16 → 2.4e-16, passive-rlc unchanged at 1.2e-16. Zeros are exact in both.

`bench:accuracy`: identical output on base and branch apart from paths. None of its 8 circuits uses `.pz`.

## Stress netlists (`stress/`, `stress.ts` → `stress-before.json` / `stress-after.json`)

These are 13 project-authored netlists. ngspice-47 and spice-ts get identical bytes. The table gives the worst relative root error against ngspice's print in ngspice order, or a count mismatch:

| netlist | before | after |
|---|---|---|
| four_pz (SPICE3f5 pz2 as `cur pz`) | error: singular interpolation point | P 3.9e-6, 4 exact zeros at 0 |
| three_pz (pzt as `cur pz`, triple pole) | P 2.4e-4 | P exact -20 ×3 |
| rcladder (relative degree 4, 6 decades) | P 1.8e-5 | P 2.3e-6, no spurious zeros |
| mixed (1 H next to 1 pF) | Z 1.7 (conjugate order) | Z 4e-7 |
| osc (two complex pairs) | P 1.7 (conjugate order) | P 6.1e-7 |
| reldeg2 | P 1.2 (conjugate order) | P 4.9e-7 |
| bandpass, floatcap, opamp2 (RHP poles), vloop (C across V source) | ≤ 2.3e-6 | same |
| rd3 | P 3 vs 4, Z 1 vs 4 | Z 9.3e-7; **P 5 vs ngspice's 4** (see below) |
| spread (time constants 1 s … 1e-18 s) | **P 2 vs 4 (loss)** | **P 2 vs 4 (loss, unchanged)** |
| feedback | ngspice prints one vector named `all` (-1.00009e6) | spice-ts: one pole -1.00009e6, before and after |

Two remaining differences, published as they are:

- `rd3.cir`: spice-ts reports 5 poles. ngspice prints 4, after warning `Pole-zero iteration limit reached; giving up after 268 trials`. The extra pole is -1.1e12: a 1 fF capacitor seen through roughly 909 Ω. C has rank 5, and an independent scipy QZ on the exported G/C gives the same 5 poles, including -1.1000e12. The other 4 poles and all 4 zeros match ngspice to ≤ 9.3e-7.
- `spread.cir` (18 decades in one irreducible block): spice-ts misses the -1e15 and -1e18 poles before and after. After the first reduction, rank decisions in double precision cannot tell the 1e-18 time constant apart from roundoff. scipy's LAPACK QZ also misses the -1e18 pole. ngspice finds all 4. This is a known limitation and not a regression. A follow-up would need cancellation-aware rank decisions.

## Runtime

Median of 30 `simulate()` runs (after 5 warm-up runs), two alternating rounds, base → branch: CEamp (`.ac` 501 points + `.pz`) 28.1/26.2 ms → 40.8/24.4 ms. pz2 0.21/0.18 → 0.28/0.14 ms. pzt 0.24/0.15 → 0.17/0.17 ms. simplepz 0.05/0.05 → 0.10/0.05 ms. The spread between rounds is larger than any difference, so no speed claim is made.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm -C packages/core build
pnpm exec tsx benchmarks/results/issue-451/measure.ts   # aggregate .pz fixtures
pnpm exec tsx benchmarks/results/issue-451/stress.ts    # stress netlists
pnpm exec tsx benchmarks/pole-zero/compare.ts
```
