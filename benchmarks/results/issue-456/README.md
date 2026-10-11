# Issue #456: nonlinear device charges integrated with NIintegrate state

Machine: Apple M5 Pro, macOS (Darwin 27.0.x arm64), Node 22, Homebrew ngspice-47. The host was heavily shared (load average 9 to 25), so timings are interleaved A/B medians, not absolute numbers.
Base: `origin/main` 2c11c9f (contains #452 diode charge integration and #454 HFET inverse fix).

## What changed

ngspice integrates each device charge with `NIintegrate`. The history is the accepted charge q(n) and its capacitor current i(n), not a C(v) matrix. spice-ts already did this for the diode (#452). Every other nonlinear-C device still stamped C(v) into the C matrix. Its trapezoidal history then came from `b(n+1) + 2C/dt·x(n) − G(x_{n+1})·x(n) + b(n)`, i.e. the new-iterate Jacobian applied to the old voltages.

`packages/core/src/devices/charge-state.ts` adds `TransientChargeState`, an engine mechanism shared by all these devices. It implements NIintegrate for BE, TRAP and Gear-2, including the order-1 bootstrap after breakpoints and restarts. Charges and currents are committed only on accepted timepoints. The same file adds a shared depletion-charge helper. Each device uses it through the existing #452 hooks (`integratesTransientCharge`, `stampTransientCharge`, `stampAcceptedChargeCurrent`). `stampDynamic` is unchanged for AC, noise and pole-zero.

| Device | Charge (as ngspice) |
|---|---|
| HFET1 (NHFET level 5) | qgs, qgd advanced as hfetload.c: q = q(n) + C(v)·(v − v(n)) |
| MESA (NMF level 2) | qgs, qgd as mesaload.c (same incremental rule) |
| JFET | exact gate depletion charge from jfetload.c (grading 1/2, FC continuation) |
| BJT | qbe (depletion + TF diffusion with XTF/VTF/ITF/qb, plus the dQbe/dVbc cross term), qbc (depletion + TR diffusion), qsub, from bjtload.c |
| MOSFET levels 1-3 (this class) | q = C·v for the constant CGDO·W, CGSO·W, CBD, CBS that spice-ts models |
| BSIM3v3 (bounded) | capacitance-only model: Meyer-style averaged increment (DEVqmeyer) for Cgd, Cgs, Cgb, Cbd, Cbs |

Not covered: MOS6 (level 6, `mos6.ts` from PR #455). #455 merged while this change was being measured, and this branch is rebased on top of it, but MOS6 still stamps its averaged Meyer and bulk-junction C(v) through the generic path. The before/after numbers below were measured on 2c11c9f, before #455, so the MOS6 rows reflect the old MOS6 handling. Moving MOS6 onto `TransientChargeState` is remaining scope. Diode behaviour from #452 is unchanged, and there is no sidewall work (#450).

The BJT charges are functions of the clamped junction voltage (`limitForwardJunctionVoltage`, a static clamp, not iterate-relative like pnjlim). Their companion therefore applies the chain rule through the clamp. Without it, a converged point kept a residual `2C/dt·(v − v*)`, and trapezoidal integration turned that into persistent ringing. During development this rang 420 times on an internal BJT base in `classic/lossy-line-24-inch` and tripled its point count (3112 → 9615). With the chain rule: 3146 points.

The generic `G·x(n)` raw-RHS history is **kept**. After this change only the breakpoint clause selects it (and the unreachable two-terminal diode RS fallback). As an experiment I forced the static-current history for every circuit. That fails `bjt-schmitt-transient › recovers across the charge-free regenerative jump`, so something still depends on the generic path.

## RED → GREEN (`packages/core/src/devices/nonlinear-charge-history.test.ts`)

| Test | main 2c11c9f | this change | bound |
|---|---|---|---|
| JFET gate charge vs ngspice-47 (every 2 ns) | 21.9 mV (fail) | 0.39 mV | 5 mV |
| NHFET chain v(4) edge vs converged ngspice-47 (1.0-1.2 ns) | 85.5 mV (fail) | 21.2 mV | 40 mV |

## Identical-netlist ngspice-47 per-signal metrics (`verify.ts`)

Receipts: `receipts/verify-{before,after}-{stock,flag-reset}.json`. Metrics are abs max / abs RMS from the aggregate harness on the spice-ts grid.

| Circuit / signal | ngspice | before | after |
|---|---|---|---|
| hfet-inverter v(4) | stock ngspice-47 (published loss, #448) | 2.2723 / 1.6148 V | 2.2723 / 1.6172 V |
| hfet-inverter v(3) | stock | 2.2312 / 1.2339 V | 2.2312 / 1.3278 V |
| hfet-inverter v(4) | flag-reset diagnostic build | 1.0382 / 0.2352 V | 0.9951 / 0.2248 V |
| hfet-inverter v(3) | flag-reset | 0.0504 / 0.0159 V | 0.0459 / 0.0134 V |
| hfet-inverter i(vdd) | flag-reset | 2.30e-4 / 4.20e-5 A | 2.29e-4 / 3.64e-5 A |
| hfet-inverter-converged v(4) | stock, both engines at reltol=1e-6, TMAX 0.1 ps | 18.4 / 1.29 mV | 10.0 / 0.69 mV |
| hfet-inverter-converged v(3) | stock | 0.79 / 0.11 mV | 0.38 / 0.059 mV |
| jfet-gate-charge v(g) | stock | 30.2 / 6.5 mV | 2.65 / 0.41 mV |
| jfet-gate-charge i(vd) | stock | 4.96e-4 / 1.93e-4 A | 8.86e-6 / 1.52e-6 A |
| mesa-oscillator worst | stock | 0.178 V v(6) / 0.0244 V | **0.358 V v(4) / 0.103 V (loss)** |

The flag-reset build is ngspice-47 with one diagnostic line, `inverse = FALSE;`, reset per HFET instance in `hfetload.c`, as described in benchmarks/results/issue-448. It is never a published result. It agrees with stock ngspice-47 on the driver-first fixture to 2.7e-5 V.

**The remaining ~1 V hfet-inverter v(4) gap against the flag-reset build is mostly ngspice's own truncation error.** At its default settings, ngspice-47 puts the 1.07-1.09 ns v(4) edge 0.96 V away from ngspice-47 run to convergence (reltol=1e-6, TMAX=0.1 ps) on the same driver-first deck. Against that converged reference, spice-ts at the fixture's default settings is within 21 mV after this change (76 mV before). The "~15 ps lag" of #448 is therefore ngspice being early at default settings, not spice-ts being late.

**mesa-oscillator loss.** The period stays correct. On the fixture, rising v(8) crossings at 0.33 V are 0.8820 ns apart after vs 0.8833 ns before, against 0.8815 ns for converged ngspice. The whole waveform, however, shifts by about 45 ps during the start-up transient (first crossing 1.4988 ns after vs 1.4537 ns before, converged ngspice 1.4486 ns, converged spice-ts 1.4515/1.4521 ns before/after). Start-up amplifies the step error exponentially. With the history fixed, spice-ts's voltage-predictor LTE (`trtol·(reltol·|v| + vntol)`) lets steps grow further in start-up (2732 vs 4256 points before 1.4 ns), and the start-up becomes less accurate. Averaging C in the MESA increment changed nothing (1.4993 ns). The loss is in step control, not in charge history. ngspice uses a charge-based LTE (CKTterr on each integrated charge), which the device charge state now makes possible; that is filed as follow-up work.

## Aggregate (100 fixtures), before/after

`aggregate-delta.json` comes from `node compare-aggregate.mjs before.json after.json`, run once on 2c11c9f and once on this change. The aggregate preflight fails on both main and this branch because the `SOURCES.md` pin is stale on main (it predates #452/#454). Both measurement runs therefore pinned the then-current hash locally. Nothing was committed to the aggregate files: refreshing them is a separate card. Statuses are unchanged (ngspice 52/9/39, spice-ts 61/1/38, 65 analyses). The outcome moves from `ed60abc0…` to `03c646eb…`, and 18 analyses change:

Wins (worst abs max, before → after; spice-ts points):
- classic/rca3040-wideband-amplifier TRAN: v(14) 0.3542 → 0.3386 V; abs RMS down on 12 of 21; 3994 → 714 points.
- classic/rtl-inverter-chain TRAN: v(5) 0.2959 → 0.2849 V; RMS down 5 of 8; 3247 → 234 points.
- classic/coupled-lossy-lines TRAN: 0.8895 V v(x3.1) → 0.8699 V v(x3.3); RMS down 27, up 15 of 47.
- classic/lossy-line-24-inch TRAN: v(2) 1.133 → 1.130 V; RMS down 2 of 3.
- ngspice/schmitt-trigger and classic/ecl-schmitt-trigger TRAN: abs RMS down on 8 of 10 (worst v(6) 0.7635 → 0.7700 V, a loss on that signal).
- classic/mos-memory-cell TRAN: v(8) 1.909 → 1.906 V (RMS down 6, up 7 of 13).
- BJT/MOS transients take far fewer points at similar error: bjt-differential-pair 3184 → 159, corpus-e bjt-diffpair-transient 3195 → 166, bjt-diffpair-current-source 3291 → 228, mos6-inverter-transient 3782 → 840, mos6-simple-inverter-transient 2767 → 317 (ngspice 308), mos-amplifier 1855 → 716.

Losses (published):
- ngspice/mesa-oscillator: worst 0.178 → 0.358 V, abs RMS up on 36 of 37 (start-up phase shift; see above).
- corpus-e/bjt-rtl-inverter-chain TRAN: v(3) 0.2949 → 0.5997 V, i(vcc) 3.96e-4 → 6.00e-4 A, abs RMS up on 5 of 8, on 170 instead of 3229 points (ngspice 80). Before and after converge to the same waveform when tightened: v(3) 0.2793 / 0.2785 V from converged ngspice, which is a model gap. The default-setting loss is the larger step taken on the 8-9 ns edge (the same voltage-LTE limit).
- ngspice/mos-amplifier-transient and classic/mos-amplifier: worst v(6) 4.754 → 4.805 V (RMS 2.215 → 1.968 V); abs RMS up on 11 of 24. These fixtures have volt-level model gaps unrelated to integration.
- ngspice/mos6-inverter-transient and classic/mos6-inverter-chain: abs RMS up on 27, down on 17 of 44, worst v(43) unchanged at 5.004 V. MOS6 itself is not in this change (#455). The MOS1 devices in the same netlists integrate their charge.
- ngspice/mos6-simple-inverter-transient: v(11) 2.956 → 2.962 V.
- classic/bjt-differential-pair, corpus-e/bjt-diffpair-transient, corpus-e/bjt-diffpair-current-source: abs RMS up on 7, 7 and 6 of 12 signals, with worst abs max within ±0.002 V.
- ngspice/hfet-inverter (stock): v(3) abs RMS 1.234 → 1.328 V (still the #448 order-dependent loss).

All 47 other compared analyses are byte-identical, including every DC/OP/AC analysis and the TRAN of corpus-e/mos1-inverter-sweep, xyce/rlc-transient, xyce/inductor-transient, ngspice/ltra-line-transient, classic/lossy-line-aluminium and the rc-transients.

`pnpm bench:accuracy`: identical to main 2c11c9f on all 8 metrics (7 ✓, 1 ~ bjt-ce-bias as on main).

## TRAN timing (hot path), `perf-ab.ts`

Interleaved A/B in one process, 7 rounds plus warm-up, medians. Receipts: `receipts/perf-ab.json` (main loaded first) and `receipts/perf-ab-swapped.json` (this change loaded first). Point counts on the vitest bench circuits are identical.

| Circuit | run 1 main → change | run 2 (swapped) main → change |
|---|---|---|
| bench RC chain 10 / 100 (no nonlinear device) | +49% / +26% | +2.1% / +0.1% |
| bench LC ladder 50 | +8.6% | +3.3% |
| bench CMOS inverter chain 10 | −13.4% | +6.2% |
| bench ring oscillator 5 / 11 | +11.3% / −4.0% | +1.5% / +4.4% |
| bench CMOS inverter single | +3.2% | +2.8% |
| corpus bjt-differential-pair | 746 → 8.3 ms (−98.9%) | 412 → 5.4 ms (−98.7%) |
| corpus rtl-inverter-chain | 552 → 10.5 ms (−98.1%) | 363 → 6.5 ms (−98.2%) |
| corpus mos6-inverter-transient | 8370 → 356 ms (−95.8%) | 4643 → 263 ms (−94.3%) |
| corpus hfet-inverter | 102 → 65 ms (−35.7%) | 76 → 51 ms (−33.1%) |
| corpus mesa-oscillator | 7841 → 6756 ms (−13.8%) | 5739 → 5594 ms (−2.5%) |

The RC chain runs the identical code path on both sides, and it still moved 26-49% in run 1. So single-digit percentages on the bench circuits are within host noise. The second run puts the per-device charge stamp overhead at 0-6% on MOS-only bench circuits. The corpus TRAN fixtures get faster because they take far fewer timepoints.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm -C packages/core build
npx tsx benchmarks/results/issue-456/verify.ts --output after.json
npx tsx benchmarks/results/issue-456/verify.ts --diagnostic-ngspice <ngspice-47 with inverse reset> --output after-flag-reset.json
npx tsx benchmarks/results/issue-456/perf-ab.ts <base-checkout> . 7
node benchmarks/results/issue-456/compare-aggregate.mjs <base aggregate-report.json> <change aggregate-report.json>
```
