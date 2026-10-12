# Issue #669 — linear scaling decks vs ngspice-47, sparse-solver bottleneck

Scope: `packages/core/src/solver/gilbert-peierls.ts` only. Decks are the
byte-identical generated RC-ladder transient and 2-D resistor-mesh OP decks of
`benchmarks/performance/scaling-m2-fixture.mjs` (issue #426; original
material, MIT). Machine: Apple M5 Pro, macOS 27, Node v22.23.1, ngspice-47
(Homebrew) with `option klu` from a per-run `.spiceinit`. The host is shared
with other workloads, so absolute numbers drift; the paired, rotating-order
design below is what makes before/after comparable.

## Profile (before, base 68b64909, 10k nodes, `profile-scaling-m2.mjs`)

| deck | top solver frame | self time |
|---|---|---|
| resistor-mesh-op 10k | `factorize` | 30.6 % (next: `amdOrdering` 13.3 %) |
| rc-ladder-tran 10k | `factorize` | 13.1 % (non-solver frames above it: `buildCompanionSystem` 15.8 %, `attemptStep` 14.3 %) |

Kernel counters on the 50k mesh (one numeric factorization, 2 988 840 factor
nonzeros): 218 M multiply-subtract updates and 64 M insertion-sort shifts
from fill that activates later pivot columns. On the RC ladder 174 of the 176
numeric factorizations per run re-derived the same pivots and pattern every
timestep, at ~39 ns per column on a tridiagonal-like system.

## Changes

1. Kernel bookkeeping (commit d889390b): fill-activated columns go into a
   binary min-heap popped in ascending column order (same order as before,
   so the same floating-point summation order), and a stamped per-row state
   replaces the per-update pivot-activation test.
2. Pivot reuse (commit 445d13ee): ngspice refactors on the previous pivot
   order (`spFactor`, `klu_refactor`) after the first ordering
   factorization. The solver now replays the stored L/U pattern in
   elimination-position space when the CSC structure is unchanged, but only
   accepts the result when the full kernel would have made exactly the same
   choices (no U or L entry turned zero, recorded zero rows still zero, the
   threshold-pivoting rule picks the same row). Otherwise it falls back to
   the full factorization. This is stricter than ngspice, which keeps a
   reused pivot until it fails a size test; that stricter rule is what keeps
   results bit-identical.

## Correctness evidence

- `packages/core/src/solver/gilbert-peierls-equivalence.test.ts` holds a
  frozen copy of the pre-#669 kernel and checks that L, U, the row
  permutation and the column pointers match it bit for bit on uniform grids
  (many pivot ties), graded grids, and 240 random nonsymmetric systems with
  ties, exact cancellation and explicit stored zeros, refactorized 6 times
  each (pivot-reuse path and fallback). Mutation check: deleting any one of
  the five reuse guards makes the suite fail.
- End-to-end waveform SHA-256 (full time vector plus 200 node waveforms or
  every mesh node voltage), base vs head: identical on rc-ladder 1k/10k/50k,
  resistor-mesh 1k/10k/50k and cmos-inverter-chain 1k.

## Results

### Solver only (`solver-ab.mts`, 7 rotating rounds, raw samples in `solver-ab.jsonl`)

| workload | base 68b64909 | head 445d13ee | paired speedup |
|---|---|---|---|
| 50 176-node grid, one full factorization | 752 ms | 574 ms | 1.30x |
| 50 000-node RC-ladder matrix, refactorization per timestep | 2.47 ms | 1.15 ms | 2.17x |

### End to end vs ngspice-47 KLU (`ab-669.mjs`, 7 rotating rounds, raw samples in `ab.json`)

spice-ts sample = median of 3 `simulate(netlist)` calls after one warmup in a
fresh process (parse + compile + analysis). ngspice sample = wall time of one
fresh `ngspice -b` (includes process start and parse).

| deck | base | head | paired speedup | ngspice KLU | head / ngspice |
|---|---|---|---|---|---|
| rc-ladder-tran 1k | 39.4 ms | 34.2 ms | 1.14x | 29.1 ms | 1.18x (loss) |
| rc-ladder-tran 10k | 342.6 ms | 341.3 ms | 1.05x | 172.6 ms | 1.98x (loss) |
| rc-ladder-tran 50k | 1683.5 ms | 1540.8 ms | 1.12x | 860.3 ms | 1.79x (loss) |
| resistor-mesh-op 1k | 18.0 ms | 16.5 ms | 1.07x | 24.6 ms | 0.67x (win) |
| resistor-mesh-op 10k | 170.9 ms | 148.9 ms | 1.14x | 124.2 ms | 1.20x (loss) |
| resistor-mesh-op 50k | 1393.9 ms | 1204.1 ms | 1.16x | 737.2 ms | 1.63x (loss) |

spice-ts is still slower than ngspice-47 KLU on 5 of the 6 decks. The
resistor-mesh-op 1k win is mostly ngspice process start-up.

## Remaining gap (not in this PR's scope)

- rc-ladder-tran: after this change the top self frames are outside the
  solver: `attemptStep` 18.3 %, `buildCompanionSystem` 17.4 %, then
  `refactorWithPivots` 8.0 %. spice-ts also takes 235 timepoints where
  ngspice-47 takes 120 on the same deck, so time-step control roughly
  doubles the work. That is a parity question for the transient engine,
  not a solver one.
- resistor-mesh-op 50k: `factorize` is still the top frame (one full
  factorization, ~218 M updates with the current AMD fill), then
  `amdOrdering` (~12 %). Closing the rest needs a cheaper ordering or a
  supernodal/blocked kernel.

## Reproduce

```
pnpm -C packages/core build      # in both trees
git worktree add --detach <base-tree> 68b64909 && (cd <base-tree> && pnpm install --frozen-lockfile && pnpm -C packages/core build)
spice-heavy node benchmarks/performance/results/issue-669/ab-669.mjs --base=<base-tree> --head=. --rounds=7 --output=benchmarks/performance/results/issue-669/ab.json
spice-heavy pnpm exec tsx benchmarks/performance/results/issue-669/solver-ab.mts --base=<base-tree> --head=. --rounds=7
pnpm -C packages/core exec vitest run src/solver/
```
