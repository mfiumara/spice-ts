# Issue #472: VBIC DC through the substrate latch-up fold

Receipts: `report.json` (this branch, on origin/main `1e8d9f8`) and `before.json` (origin/main `1e8d9f8`, same verifier, same inputs).
After rebasing onto origin/main `96a9039` (#469 transient LTE), `verify.ts --check` still matches every deterministic field.
Regenerate with `pnpm -C packages/core build && npx tsx benchmarks/results/issue-472/verify.ts --output benchmarks/results/issue-472/report.json`; check with `--check`.
Machine: Apple Silicon macOS, Node 22.23.1, Homebrew ngspice-47. Both engines get the same netlist bytes. Metrics come from the aggregate's own `compareExecutions` (spice-ts grid, linear interpolation, no per-circuit tolerance). Tolerances are the defaults in both engines; nothing was loosened.

## Root cause

Two gaps against ngspice-47, and the sweep needs both closed.

1. VBIC junction limiting. `VBIC.limitNewtonStep` scaled the whole Newton step by the most restrictive junction. Each junction also used its own saturation current (IBEI+IBEN, IBCI+IBCN, ISP) for the critical voltage. ngspice `vbicload.c` lines 656-667 apply `DEVpnjlim` to each of the six junction voltages (Vbei, Vbex, Vbci, Vbcx, Vbep, Vbcp) on its own, against the value linearized at the previous load (`CKTstate0`). All six use one `tVcrit` from IS (`vbictemp.c`). The resistive branches (Vrci, Vrbi, Vrbp) are not limited. Once the latch drives the substrate and collector junctions forward together, the global scale shrinks every node's step to the worst junction's limit. Newton then stalls or cycles. spice-ts converged below 2.36 V and above about 2.45 V, but not in between.
2. DC sweep continuation. ngspice `dctrcurv.c` calls `CKTop` (plain Newton, then dynamic gmin, then true gmin stepping) when Newton from the previous sweep point fails. spice-ts's sweep ran Newton only and gave up. ngspice needs this fallback here as well: it prints "Starting dynamic gmin stepping" at VSUB=2.4 in the 0.1 V sweep, and at a cold-start `.op` anywhere on the latched branch (checked at 2.4, 2.5 and 3.0 V).

Ablation on the 10 mV upward sweep (`.dc Vsub 2.3 2.5 0.01`): with the sweep fallback but the old global limiter, the sweep still fails (ConvergenceError). With the new limiter but no fallback, it fails at the first latched point. With both, every point converges and the fold falls between 2.36 and 2.37 V, the same place as in ngspice.

## What changed

- `packages/core/src/devices/vbic.ts`: the model is now evaluated over branch voltages (the six junctions, three resistive branches, and xf1/xf2 when TD > 0) and mapped onto nodes through the branch incidence, as `vbicload.c` does. Each stamp limits each junction with ngspice-47 `DEVpnjlim` against its previous linearized value, using `tVcrit = vt*ln(vt/(sqrt(2)*IS))`. It then linearizes about the limited point: I(v) ~ I(vl) + dI/dv (v - vl). The first load uses the `MODEINITJCT` start: Vbei=Vbex=tVcrit, Vbci=Vbcp=-tVcrit, all others 0. A limited iterate reports `limitedLastStamp()`. The global `limitNewtonStep` is gone. AC/PZ still linearize at the converged node voltages.
- `packages/core/src/analysis/newton-raphson.ts`: DC Newton no longer declares convergence on an iterate a self-limiting device just limited (ngspice `CKTnoncon`). Before, only transient Newton checked this. In DC it now applies to VBIC and to the RS=0 diode, which already limited its own junction.
- `packages/core/src/analysis/dc-sweep.ts`, `dc.ts`: when Newton fails at a sweep point of a nonlinear circuit, the point is retried with the operating-point gmin homotopies (dynamic, then true gmin stepping). These are the same functions `.op` already used, now exported as `gminSteppingHomotopy`. Source stepping is not part of this fallback.

## Before / after (max absolute error vs ngspice-47; max relative error in brackets)

| Fixture / signal | origin/main | this branch |
|---|---|---|
| vbic-substrate/dc-latchup (committed, 0.1 V) | **failed**: ConvergenceError | 41/41 points; `v(2)` 1.24e-4 V (8.1e-4), `i(vb)` 4.28e-6 A (5.5e-4), `i(vsub)` 3.58e-6 A (2.5e-3 at the zero crossing), `i(vcc)` 1.24e-7 A (6.7e-5) |
| dc-latchup @ `.dc Vsub 2 3 0.01` | **failed** | 101/101 points converge (100 aligned by the harness); `v(2)` 5.32e-6 V (5.0e-6), `i(vb)` 4.09e-8 A (6.5e-4), `i(vsub)` 4.10e-8 A (6.1e-4) |
| dc-latchup @ `.dc Vsub 3 -1 -0.01` (downward, latched branch) | **failed** | 401/401 points converge (400 aligned); `v(2)` 7.31e-5 V (7.2e-4), `i(vb)` 1.41e-6 A (1.6e-4), `i(vsub)` 1.51e-6 A (1.7e-4) |
| vbic-substrate/dc `v(2)` | 3.529688e-10 V (2.06028e-10) | 3.529732e-10 V (2.06031e-10) |
| vbic-substrate/dc `i(vb)` | 1.357109e-14 A (3.7422e-9) | 1.361272e-14 A (3.7537e-9) |
| vbic-substrate/ac `v(5)` | 3.05227e-6 (6.7003e-8) | 3.05228e-6 (6.4366e-8) |
| vbic-substrate/ac `i(vmeas)` | 2.872977e-6 (6.67090e-8) | 2.872981e-6 (6.67091e-8) |
| ngspice/vbic-fo `i(vb)` / `i(vc)` | 3.7715832e-6 (9.2865e-4) / 6.7147755e-6 (6.40503e-4) | unchanged to 11 digits (`i(vc)` abs 1.7e-17 lower) |
| ngspice/vbic-common-emitter-ac `i(vmeas)` | 2.8729960e-6 (6.67094e-8) | 2.8729880e-6 (6.67092e-8) |
| ngspice/vbic-common-emitter-ac `.pz` worst relative | 7.6216e-8 (pole(6)); pole(1) 6.137e-9 | 7.6215e-8 (pole(6)); pole(1) **6.717e-9** |

Small losses, reported as measured. pole(1) relative error rises from 6.14e-9 to 6.72e-9. `vbic-substrate/dc` `i(vb)` max relative error rises from 3.742e-9 to 3.754e-9. Two `.ac` columns move in the 7th digit. All of these are converged-point shifts at Newton-tolerance level: the iterates now take a different path to the same operating point. Every other row is unchanged or improves.

## Per-point error on the committed fixture (dc-latchup.cir, 0.1 V steps)

ngspice and spice-ts values come from the ngspice raw file and the spice-ts result (full precision). Absolute error is |spice-ts - ngspice|.

| VSUB (V) | ngspice v(2) | spice-ts v(2) | v(2) abs err (V) | i(vcc) abs err (A) | i(vb) abs err (A) | i(vsub) abs err (A) |
|---|---|---|---|---|---|---|
| -1 ... 2.1 (32 points) | 1.713223e+00 | 1.713223e+00 | <= 2.24e-13 | <= 2.24e-16 | <= 3.75e-17 | <= 2.41e-17 |
| 2.2 | 1.713207e+00 | 1.713207e+00 | 3.53e-10 | 3.53e-13 | 1.36e-14 | 2.04e-14 |
| 2.3 | 1.712453e+00 | 1.712451e+00 | 1.07e-06 | 1.07e-09 | 2.40e-09 | 2.42e-09 |
| 2.4 | 1.463217e-01 | 1.463217e-01 | 7.22e-16 | 1.30e-18 | 2.78e-17 | 4.16e-17 |
| 2.5 | 1.535926e-01 | 1.537168e-01 | **1.24e-04** | 1.24e-07 | 4.28e-06 | 3.58e-06 |
| 2.6 | 1.611264e-01 | 1.611297e-01 | 3.32e-06 | 3.32e-09 | 3.68e-08 | 6.55e-08 |
| 2.7 | 1.685570e-01 | 1.685569e-01 | 1.83e-07 | 1.83e-10 | 2.69e-08 | 1.59e-08 |
| 2.8 | 1.759956e-01 | 1.759956e-01 | 1.42e-08 | 1.42e-11 | 2.42e-08 | 1.08e-08 |
| 2.9 | 1.834438e-01 | 1.834438e-01 | 2.18e-08 | 2.18e-11 | 1.90e-08 | 8.38e-09 |
| 3.0 | 1.909000e-01 | 1.909000e-01 | 1.46e-08 | 1.46e-11 | 1.51e-08 | 6.78e-09 |

The 2.5 V point is the largest error, and it comes from ngspice's own sweep. A standalone ngspice-47 `.dc Vsub 2.5 2.5 1` on the same bytes gives v(2) = 1.537168e-1, the spice-ts value. The 0.1 V sweep takes 1.535926e-1, a Newton iterate accepted at the default reltol=1e-3 (a 1.24e-4 V change on 0.154 V is 8.1e-4 relative). The same thing happens at 2.3 V: standalone ngspice gives 1.712451, matching spice-ts, while the sweep gives 1.712453. The full table, with all four signals at full precision, is under `perPoint` in `report.json`.

## Runtime (not a speed claim)

From the receipt: spice-ts ran the 10 mV upward and downward variants in 106 ms and 276 ms (in process). ngspice took 23 ms and 51 ms, including process spawn. spice-ts is slower here. The points next to the fold go through gmin stepping in both engines.

## Corpus-wide impact (100-fixture aggregate)

`aggregate-report.ts --check` cannot run on main right now (see below), so the impact was measured by hand. I regenerated the aggregate in two scratch worktrees, origin/main `1e8d9f8` and this branch's fix commit. In both, the stale `SOURCES.md` pin was bumped to the current hash and the status-transition explanation check was disabled; those scratch edits are not committed. Excluding runtimes and ngspice's own error text (elapsed time and DRAM figures differ between runs), the only spice-ts outcome changes are the `ngspice/vbic-fo` and `ngspice/vbic-common-emitter-ac` metrics, at the Newton-tolerance level shown in the table above. No fixture changes status. No diode, BJT or MOS fixture changes, so the DC `CKTnoncon` check moves no other row. Outcome hashes: main `d18334bb…3b07`, branch `915c487b…bdda`.

## Not in scope / follow-ups

- `benchmarks/results/issue-453/verify.ts --check` now exits 1. It pins the #453 receipt, where dc-latchup was the retained ConvergenceError, and dc-latchup now succeeds. The other #453 rows move only at the Newton-tolerance level shown above. This lane does not own `issue-453/`, so its receipt is left untouched.
- `benchmarks/aggregate-report.ts --check` exits 1 on origin/main `1e8d9f8` and on this branch for the same reason: the `benchmarks/SOURCES.md` pin is stale and awaits the aggregate refresh lane (#470). The aggregate files are not edited here.
- A sweep-point fallback to source stepping (ngspice `gillespie_src`) is not implemented.
