# Issue #467: aggregate refresh after #449, #457, #455, #464 and #460

Host: Apple M5 Pro, darwin arm64, Node v22, ngspice-47. Every row is one full
100-fixture `benchmarks/aggregate-report.ts` run. Rows 2-4 ran on that main
commit with the #391 harness (PR #464 head `5e9489e`) merged in. The status-
transition check was relaxed in those throwaway worktrees only, so stale ledger
entries did not abort the run. Bisect outcomes include ledger text, so compare
them by per-fixture metrics, not by hash.

| Run | Main commit | PR | Outcome | spice-ts S/F/U | Analyses / fixtures | Change vs previous row |
|---|---|---|---|---|---|---|
| 1 | `667a704` + #464 | #464 head `5e9489e` (committed; `--check` reproduced in review) | `3c5ec193` | 62/1/37 | 68 / 50 | baseline |
| 2 | `9776336` | #449 AMD LU ordering | `2634b6e5` | 62/1/37 | 68 / 50 | 40 fixtures change at rounding level or through shifted transient step sequences; no status change |
| 3 | `4c0b951` | #457 VBIC .ac/.pz | `39506ddf` | 63/1/36 | 70 / 51 | vbic-common-emitter-ac unsupported → success (+AC, +PZ); PZ sets the abs envelope at 1.2512e12 (#451) |
| 4 | `3490527` | #455 MOS6 level 6 | `68d50f5c` | 63/1/36 | 70 / 51 | three MOS6 fixtures: worst 5.0044 V → 0.2798 V and 2.956 V → 0.2215 V; i(vin) RMS loss (#461) |
| 5 | `4ed111e` | #460 diode NBV/TBV1 | `cc4edd5c` | 63/1/36 | 70 / 51 | per-fixture metrics identical to run 4; only this branch's #451/#461 gap links differ |
| 6 | `4ed111e` (PR #470 head `b8b3173`) | — | `fedbff5e` | 63/1/36 | 70 / 51 | first #470 head; `--check` passed in review, stale once #466 merged |
| 7 | `6bae695` + `b8b3173` | #466 .pz pencil eigenvalues | `e1bd8b6a` | 63/1/36 | 70 / 51 | only the 3 PZ fixtures: vbic PZ 3p/1z → 7p/6z like ngspice (rel ≤ 1.2e-7); abs envelope 1.2512e12 → 13716.6; 960 → 969 signals |
| 8 | `0f50fb1` + `b8b3173` | #463 nonlinear-C charge state | `b9cb7e52` | 63/1/36 | 70 / 51 | 15 transients; far fewer BJT/MOS points; mesa-oscillator and bjt-rtl losses (#469); rel envelope 3.212e11 → 2.481e11 |
| 9 | `25dd3ed` (this branch, pin-only) | #471 diode sidewall F1 + predictor | `6f8aa84d` | 63/1/36 | 70 / 51 | only the 3 diode-bearing lossy lines; rel envelope 2.481e11 → 2.483e11 |
| final | this branch, regenerated ledger | — | see AGGREGATE_PARITY.md | 63/1/36 | 70 / 51 | `--check` passes |

ngspice stays at 52/9/39 throughout. Run 5 reproducing run 4's metrics
bit-for-bit on a different worktree also serves as a determinism control, and
run 7 reproduces the reviewer's independent `e1bd8b6a` regeneration on the
#466 merge. Rows 7 and 8 ran in throwaway worktrees with the SOURCES.md pin set
to that commit's catalogue and the status-transition check skipped
(`AGG_BISECT`); row 9 ran in this worktree with only the pin updated, before
the ledger text was edited. Nothing from the bisect patches is committed.

## Notable moves (abs max / abs RMS)

- #466: vbic-common-emitter-ac PZ now 7 poles / 6 zeros, all 13 compared, relative 1.26e-9 to 1.20e-7; largest abs error 13716.6 on zero(1) (|zero| ≈ 1.3e12), which still sets the abs max/RMS envelope. pole-zero-four-stage 0.01295 → 1.49e-8; pole-zero-three-stage 0.004812 → 3.65e-12. This supersedes the #457 PZ loss below.
- #463 gains: rca3040 TRAN v(14) 0.3534 → 0.3386 V on 3993 → 714 points; rtl-inverter-chain v(5) 0.2959 → 0.2849 V; schmitt-trigger v(6) RMS 0.461 → 0.277 V; mos-amplifier v(5) RMS 2.656 → 2.334 V; coupled-lossy-lines v(5) rel max 3.212e11 → 2.481e11.
- #463 losses: mesa-oscillator 0.1782 → 0.3582 V, abs RMS up on 36 of 37 (#469); bjt-rtl-inverter-chain v(3) 0.2949 → 0.5997 V (#469); mos-amplifier v(6) 4.754 → 4.805 V; hfet-inverter v(3) RMS 1.261 → 1.328 V; rtl-inverter-chain v(5) RMS 0.041 → 0.145 V; BJT diff-pair abs RMS up on 6-7 of 12.
- #471 gains: lossy-line-aluminium abs RMS down on 224 of 261; lossy-line-24-inch RMS down on all 3, v(3) rel max 1059 → 193; coupled-lossy-lines worst 0.870 → 0.866 V.
- #471 losses: coupled-lossy-lines abs RMS up on 32 of 47 and v(5) rel max 2.481e11 → 2.483e11 (sets the relative envelope); lossy-line-24-inch v(2) 1.134 → 1.135 V.
- #449 gains: mesa-oscillator v(6) 0.1782 → 0.1771 V; coupled-lossy-lines v(4) rel max 970.5 → 280.7; lossy-line-24-inch v(2) 1.1333 → 1.1323 V; bjt-diffpair-transient v(4) RMS 0.0903 → 0.0877 V; relative envelope 321200769455.61 → 321200768925.45.
- #449 losses: hfet-inverter v(3) RMS 1.234 → 1.261 V and i(vin) rel max 3208 → 5425; bjt-diffpair-transient v(5) 0.0890 → 0.0969 V; lossy-line-24-inch v(3) rel max 171 → 196; mesa-oscillator abs RMS up on 27 of 37 signals (≤0.1%); rca3040 TRAN v(15) 0.3378 → 0.3389 V.
- #457: vbic-common-emitter-ac AC i(vmeas) 4.63e-6 A (rel 1.08e-7), v(1) 1.84e-4 V. PZ loss: 3 poles/1 zero vs ngspice's 7/6; pole(1) 1.14e12, zero(1) 1.25e12 abs error.
- #455 gains: mos6-inverter-transient / mos6-inverter-chain v(43) 5.0044 → 0.0062 V, abs RMS down on 41 of 44 signals; mos6-simple-inverter v(11) 2.956 → 0.2215 V.
- #455 losses: i(vin) RMS 5.22e-6 → 1.61e-5 A (simple inverter), 7.09e-6 → 1.47e-5 A (mos6inv rows); simple-inverter i(vdd) rel max 1729 → 22447.

No fixture, tolerance or harness logic changed. The runtime sums are diagnostic only.
