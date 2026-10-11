# Issue #462: MOS1 inverter-chain `.op` at 40k-50k stages

## Root cause

Homotopy, not pivoting. On these decks direct Newton fails in both simulators and
ngspice-47 `CKTop` runs dynamic gmin stepping, which also fails from 40k stages on
(ngspice prints `Warning: Dynamic gmin stepping failed`). ngspice then runs
**true gmin stepping** (`new_gmin` in `cktop.c`), which steps the device gmin
(`CKTgmin`, the conductance MOS1 adds across its bulk junctions) instead of a
node-to-ground diagonal shunt, and converges. spice-ts stopped after dynamic gmin
stepping and rethrew the direct-Newton error.

The `SingularMatrixError` itself is not a zero pivot in the LU factorization. It
is the overflow guard in `GilbertPeierlsSolver.solve()`. Near the chain's
period-doubling point the linearized stage gain is slightly above 1, so a Newton
step grows like g^N along the chain and overflows `Float64` somewhere between 30k and 40k stages. That
is why 20k passed and 40k failed. The column it reports depends on the AMD ordering
(`s39998` before #449, `s135` after).

## Fix

`solveDCOperatingPoint` now runs ngspice-47's fallback order: dynamic gmin, then
true gmin. Both share one adaptive schedule (`stepGmin`), ported line for line. The
only differences are the stepped quantity, the target, and the slow-step factor
floor, which is 3 for `new_gmin`. Device gmin reaches devices through the new
optional `StampContext.gmin` (default `DEVICE_GMIN` = 1e-12 S) and the
`MOSFET.batchStamp` fast path. MOS1 bulk junctions use it. No tolerance, iteration
limit, or circuit-specific value changed. Circuits that converged before take the
same path as before, because true gmin only runs once dynamic gmin has failed.

Scope limit: only MOS1 (`devices/mosfet.ts`) reads the stepped gmin. Diode, BJT,
JFET, MOS6, BSIM and the other models keep their fixed 1e-12 S junction gmin
during true gmin stepping, so on those devices the homotopy is weaker than
ngspice's.

## Receipts

`receipts/runs.jsonl`, measured on an Apple Silicon Mac with ngspice-47 (Homebrew)
and Node 22.23.1. `before-3490527` is a build of `main` at 3490527. `after` is this
branch. Each run generates the deck once and gives ngspice and spice-ts the same
bytes (the SHA-256 is in the receipt). All nodes are compared against ngspice's
7-significant-digit `.op` listing; ~3.2e-7 relative is the rounding of that
listing. They are also compared against the numdgt=12 ngspice values used by the
unit tests (|dV| < 1 nV on high nodes, < 0.1 % on low nodes).

| deck | stages | ngspice-47 homotopy | spice-ts before | spice-ts after | nodes outside 12-digit tolerance (after) |
|---|---:|---|---|---|---:|
| true-gmin | 6,000 | dynamic failed → true gmin completed | `SingularMatrixError` (s107) | ok | 0 / 6,000 |
| issue-428 | 20,000 | dynamic gmin completed | ok | ok (unchanged path) | 0 / 20,000 |
| issue-428 | 40,000 | dynamic failed → true gmin completed | `SingularMatrixError` (s135) | ok | 0 / 40,000 |
| issue-428 | 50,000 | dynamic failed → true gmin completed | `SingularMatrixError` (s135) | ok | 0 / 50,000 |

The wall-clock times in the receipt are noisy because other jobs shared the
machine (load average ~10). Across two runs: 40k after took 31.7 s and 42.2 s
(ngspice 46.8 s and 64.5 s), and 50k after took 40.7 s and 24.3 s (ngspice 73.7 s
and 53.2 s). Before the fix, spice-ts failed after 25-76 s. The 20k deck is
unchanged at ~3.5-11 s under the same noise. These numbers are not a speed claim.

## Reproduce

```sh
pnpm -C packages/core build
node benchmarks/results/issue-462/measure.mjs --stages 6000 --variant true-gmin
node benchmarks/results/issue-462/measure.mjs --stages 40000
node benchmarks/results/issue-462/measure.mjs --stages 50000
# before: --dist <path to a main build> --label before
SPICE_TS_SLOW_TESTS=1 pnpm -C packages/core exec vitest run src/mos1-inverter-chain-op.test.ts
```
