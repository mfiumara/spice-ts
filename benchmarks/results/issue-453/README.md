# Issue #453: bounded VBIC non-ground substrate terminal

Receipts: `report.json` (this branch, merged with origin/main `6bae695`) and `before.json` (origin/main `6bae695`, same verifier and fixtures).
Regenerate with `pnpm -C packages/core build && npx tsx benchmarks/results/issue-453/verify.ts --output benchmarks/results/issue-453/report.json`; check with `--check`.
Machine: Apple Silicon macOS, Node 22, Homebrew ngspice-47. Both engines receive the same committed netlist bytes, and metrics come from the aggregate's own `compareExecutions` (spice-ts grid, linear interpolation, no per-circuit tolerance).

## What changed

- The Q-card parser keeps the 4th (substrate) and 5th (thermal) terminals instead of dropping them, at top level and inside `.subckt` bodies. Before this change, a 4-node Q card inside a subcircuit used the substrate node name as the model name.
- Bounded VBIC (LEVEL=4) stamps the substrate node: RS runs from the external substrate to `si`, and with RS=0, `si` is the external substrate node. A 3-terminal instance still ties the substrate to ground, as ngspice does.
- The bounded Gummel-Poon BJT has no substrate junction, so it still ignores the substrate node (and still rejects substrate model parameters).
- A 5-terminal instance raises a typed `InvalidCircuitError`. For VBIC the message says self-heating is not implemented. For other BJTs it says only VBIC accepts a fifth terminal, matching ngspice-47, which allows the thermal node only on VBIC/HICUM.
- VBIC now adds `CKTgmin` to the same branches as ngspice-47 `vbicload.c` lines 756-771: Ibex, Ibep, Ibcp, and Irci via Vrci/Vbci/Vbcx. Before, it added gmin only to Ibe and Ibc. Ibcp gmin is the whole reverse substrate current, about 1e-12 A/V. Without it, `i(vsub)` was exactly 0 where ngspice reports 1.7-2.7 pA.

## Before / after (max absolute error vs ngspice-47; max relative error in brackets)

| Fixture / signal | origin/main | this branch |
|---|---|---|
| vbic-substrate/dc `v(2)` | 7.716e-4 V (4.5e-4) | 3.53e-10 V (2.1e-10) |
| vbic-substrate/dc `i(vsub)` | 8.147e-6 A (1.0) | 2.04e-14 A (2.5e-3, at the zero crossing) |
| vbic-substrate/dc `i(vb)` | 8.135e-6 A (1.87) | 1.36e-14 A (3.7e-9) |
| vbic-substrate/ac `v(5)` (substrate) | 77.8 V/A (1.0) | 3.05e-6 V/A (6.7e-8) |
| vbic-substrate/ac `i(vmeas)` | 9.25e-2 (0.136) | 2.87e-6 (6.7e-8) |
| vbic-substrate/dc-latchup | success but wrong (v(2) off by 1.567 V; substrate grounded) | **failed**: ConvergenceError between VSUB 2.38 and 2.42 V |
| aggregate row vbic-fo `i(vb)` | 3.7715827e-6 A (1.240e-3) | 3.7715832e-6 A (9.29e-4) |
| aggregate row vbic-fo `i(vc)` | 6.7147750e-6 A (6.40503226e-4) | 6.7147755e-6 A (6.40503273e-4) |
| aggregate row vbic-common-emitter-ac `i(vmeas)` | 4.631e-6 (1.08e-7) | 2.873e-6 (6.7e-8) |
| aggregate row vbic-common-emitter-ac `.pz` (7 poles, 6 zeros, after #466) | worst rel 1.20e-7 (pole(6)); pole(1) 1.11e-8 | worst rel 7.6e-8 (pole(6)); pole(1) 6.1e-9 |

On the vbic-fo row, the max absolute errors for `i(vb)` and `i(vc)` rise by 4.9e-13 A. That is 1.3e-7 of the error itself. The `i(vc)` max relative error rises by 4.7e-11, and the `i(vb)` max relative error falls from 1.24e-3 to 9.29e-4. Every vbic-common-emitter-ac AC signal and all 13 pole/zero errors improve.

## Retained loss

`dc-latchup.cir` is `dc.cir` with the sweep extended to 3 V and the default reltol. Past VSUB ~2.36 V the substrate junction is forward-biased and the NPN plus the parasitic PNP latch. ngspice-47 jumps from v(2)=1.702 V at 2.36 V to 0.1441 V at 2.37 V; a standalone `.op` at 2.4 V needs dynamic gmin stepping in ngspice too. spice-ts converges below 2.36 V and above about 2.45 V. Between 2.38 and 2.42 V its Newton/gmin-stepping loop oscillates, so the whole sweep fails. The branch reports that failure instead of the silently wrong grounded-substrate answer from main. The unit test `follows ngspice-47 through the substrate latch-up fold` is `it.fails` until #472 fixes VBIC DC convergence: per-junction pnjlim limiting instead of the global Newton step scale.

## Not in scope

- Self-heating (RTH with a thermal node) stays unsupported behind a typed error.
- Aggregate pins: `benchmarks/SOURCES.md` gained a section, so `SOURCES_SHA256` in `benchmarks/aggregate-report.ts` and the committed aggregate need the next aggregate refresh lane, as happened after #454.
