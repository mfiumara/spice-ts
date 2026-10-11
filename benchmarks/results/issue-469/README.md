# Issue #469: charge-based LTE (ngspice CKTterr), and what actually caused the cited losses

Machine: Apple M5 Pro, macOS (Darwin 27.0.x arm64), Node 22.23.1, Homebrew ngspice-47. The host was shared, so timings are diagnostic only.
Base: `origin/main` 3a7ad44.

## Summary

1. **Charge LTE (asked for by #469) is implemented, but it does not cause or fix the cited losses.** It is ngspice `CKTterr` per integrated device charge, minimised over devices (`CKTtrunc`), used alongside the existing voltage LTE. On `mesa-oscillator` and corpus-e `bjt-rtl-inverter-chain` it never limits a step. Across all trial steps, its bound divided by the step is at least 6.3 (mesa) and 1.44 (bjt-rtl; only one of 218 checks is under 2x). The voltage LTE already takes smaller steps than ngspice's charge criterion would allow. The #469 hypothesis that the voltage LTE lets steps grow too far is **refuted** for both circuits.
2. **bjt-rtl's real cause: a PULSE with PER omitted had no breakpoints at all.** `pulseBreakpoints` looped on `delay + n * period` with `period = Infinity`, and `0 * Infinity` is NaN, so it emitted no corners. The first step went from 0 to 4 ns straight across the 2-4 ns rising edge. This PR fixes it, and makes omitted TR/TF default to TSTEP as in ngspice-47 (`vsrcload.c`; spice-ts used 1e-12, which the fix would otherwise expose on `rc.cir`).
3. **mesa-oscillator's real cause (and #477's): the raw-RHS trapezoidal history.** `useStaticCurrentHistory` is false whenever a source reports a breakpoint after t = 0. The linear capacitors then integrate a history built from the new-iterate Jacobian applied to the old voltages, which is the #463 flaw, here on linear C. This is not fixed in this PR (out of the card's file scope, and #463 found a test that depends on that path); follow-up issue filed.

## Charge LTE

- `TransientChargeState.truncationTimestep` implements `cktterr.c`: `tol = max(abstol + reltol·max|i|, reltol·max(|q0|,|q1|,chgtol)/Δ)`, the (order+1)-th divided difference over `CKTdeltaOld`, trap coefficients ½ and 1/12, Gear ½ and 2/9, a square root at order 2. It keeps one extra accepted charge, q(n-2).
- Device hooks (`truncateTransientStep`, ngspice DEVtrunc): MESA, HFET1 and JFET qgs/qgd; BJT qbe/qbc/qsub; MOS1-3 gate charges only (MOS1trunc does not truncate the bulk junctions); BSIM3v3 Meyer branch charges, standing in for BSIM3trunc's terminal charges. Diode (own state, #452) and MOS6 (#468, PR #478) are not included.
- Driver: a converged trial is rejected when the charge bound is below 0.9·Δ (dctran.c), and the next step is at most the bound. This uses the same reject-bypass and femtosecond floor as the voltage LTE. New option `chgtol` (`.options chgtol=`), default 1e-14 as in ngspice.
- Tests: `devices/charge-truncation.test.ts` (closed-form CKTterr for TRAP/BE/Gear-2, history gating, no side effects) and `analysis/transient-charge-lte.test.ts` (driver passes the accepted step history and tolerances; steps never exceed the bound).

## RED → GREEN (`packages/core/src/pulse-omitted-period.test.ts`, `devices/voltage-source.test.ts`)

| Test | main 3a7ad44 | this change | bound |
|---|---|---|---|
| bjt-rtl lands on the 2/4/84/86 ns PULSE corners | fail (first step 0 → 4 ns) | pass | 1e-14 s |
| bjt-rtl v(3), default vs same deck converged (reltol=1e-6, TMAX 10 ps) | 0.341 V (fail) | 3.8 mV | 20 mV (ngspice-47 itself: 16 mV) |
| `rc.cir` `pulse (0 1)` ramps over TSTEP like ngspice | pass on main only by accident (no point inside the 1e-12 s ramp); fails with the PER fix alone | pass | 1e-9 V |
| `pulseBreakpoints` with PER = Infinity / PER = 0 | fail / fail | pass / pass | exact |

`PER = 0` → one pulse was checked against ngspice-47 directly. `PULSE(0 1 1n 1n 1n 2n 0)` lands on 1, 2, 4 and 5 ns and does not repeat. The old unit test that expected no breakpoints for PER = 0 contradicted both ngspice and `evaluatePulse`, so it was replaced.

## Identical-netlist ngspice-47 numbers

`probe.ts` (abs max / abs RMS, aggregate harness, spice-ts grid):

| corpus-e bjt-rtl-inverter-chain v(3) | main | change |
|---|---|---|
| spice-ts vs ngspice-47, same deck | 0.5997 / 0.196 V (170 pts) | 0.2940 / 0.131 V (179 pts; ngspice 80) |
| converged spice-ts vs converged ngspice (model gap) | 0.2785 V | unchanged |

`crossings.mjs`, mesa-oscillator first rising 0.33 V crossing of v(8):

| run | spice-ts | ngspice-47 |
|---|---|---|
| default (fixture as committed), main and this change (identical) | 1498.78 ps (3861 pts) | 1450.52 ps |
| reltol=1e-6, TMAX 0.1 ps on both decks | 1455.63 ps | 1448.56 ps |
| diagnostic only: main with `useStaticCurrentHistory` forced true (not committed) | 1444.87 ps (424 pts before 1.4 ns, vs 2732) | – |

#477 (MOS1 22-stage chain, `cmosInverterChainTran(22)`): s1/s2/s5/s10 crossings are 221.39/314.93/601.13/1079.26 ps on main, also on this change. With the same diagnostic forced static history they are 225.39/319.56/608.46/1090.27 ps, against ngspice-47 225.45/319.65/608.73/1090.75 (issue table). So #477 shares mesa's root cause. Its deck has PER=10n, and MOS1 without TOX has no truncated charge, so neither fix in this PR touches it.

`rc-exact.mjs`, ngspice `tests/general/rc.cir` against its closed-form answer, worst |v(2) error|: main 7.55e-4 V (79 pts), change 2.32e-4 V (107 pts), ngspice-47 2.42e-4 V (86 pts).

## Aggregate (100 fixtures), before/after

Receipts: `receipts/aggregate-delta-*.json` (`compare-aggregate.mjs` from issue-456). Runs on main 3a7ad44 and on this change, both with the same two local, uncommitted harness edits. The SOURCES pin was set to the current `SOURCES.md` hash, and the stale-transition guard was skipped (`ngspice/vbic-common-emitter-ac` after #473; the aggregate refresh is PR #470). Statuses are unchanged: ngspice 52/9/39, spice-ts 63/1/36, 70 compared analyses. The outcome moves from 0bc6303b to 31023005, and 11 analyses change; the other 59 are byte-identical.

Wins (worst abs max; points before → after, ngspice):
- corpus-e/bjt-rtl-inverter-chain TRAN: v(3) 0.5997 → 0.2940 V, i(vcc) 6.00e-4 → 3.85e-4 A, v(2) 0.214 → 0.119 V; abs RMS down on 6 of 8; 170 → 179 (80). PULSE fix.
- ngspice/mos-amplifier-transient and classic/mos-amplifier: v(6) 4.805 → 4.784 V; RMS down 12, up 9 of 24; 716 → 698 (2429). Charge LTE.
- classic/coupled-lossy-lines: 0.866 → 0.845 V; RMS down 29, up 12 of 47; 3810 → 3917 (739). Charge LTE.
- classic/lossy-line-24-inch: v(2) 1.135 → 1.115 V; 3143 → 3289 (728). Charge LTE.
- ngspice/schmitt-trigger and classic/ecl-schmitt-trigger: RMS down 8, up 1 of 10, worst unchanged 0.770 V; 3224 → 3227.

Losses (published):
- ngspice/rc-transient and classic/rc-transient: v(2) and i(vin) 6.9e-4 → 1.67e-3 (V and A), RMS up on 3 of 3; 79 → 107 points. Against the closed-form answer spice-ts improves, 7.55e-4 → 2.32e-4 V (ngspice-47: 2.42e-4 V). The ramp is now resolved, and ngspice's sparser grid, interpolated, is what dominates the matched-point metric.
- corpus-e/bjt-rtl-inverter-chain v(5): 0.243 → 0.282 V abs max (RMS 0.143 → 0.117).
- classic/lossy-line-24-inch v(3): 1.104 → 1.122 V.
- mos-amplifier v(5) 4.494 → 4.571 V, v(4) 1.266 → 1.276 V, v(16) RMS 0.977 → 1.005 V.
- classic/mos-memory-cell: RMS up on 8 of 13 (worst v(8) 1.906 V unchanged); 143 → 152 points.
- classic/rtl-inverter-chain: RMS up 4 of 8, v(3) 0.2807 → 0.2809 V; 234 → 210 points.
- ngspice/mesa-oscillator: unchanged (0.358 V loss from #463 remains; root cause above).

Attribution (`aggregate-delta-charge-lte-only.json`, `aggregate-delta-pulse-defaults-only.json`): the charge LTE alone changes 7 analyses (the two mos-amplifier copies, both lossy lines, mos-memory-cell and the two schmitt-trigger copies). The PULSE defaults change both rc-transient copies, rtl-inverter-chain, bjt-rtl-inverter-chain and mos-memory-cell.

`pnpm bench:accuracy`: identical to main 3a7ad44 on all 8 metrics (7 ✓, 1 ~ bjt-ce-bias as on main).

## TRAN timing (`perf-ab.ts` from issue-456, base = main 3a7ad44)

Interleaved A/B, 5 rounds, medians, receipt `receipts/perf-ab.json`. Point counts are identical except corpus rtl-inverter-chain (170 → 179). Bench circuits move by -1.8% to +0.1%, which is noise. Corpus: bjt-differential-pair +1.3%, rtl-inverter-chain -5.6%, mos6-inverter-transient -3.4%, mesa-oscillator +2.9% (1617 → 1665 ms; the extra charge evaluation per trial step, with no change in points), and **hfet-inverter +13.3% (29.3 → 33.1 ms, same 457 points)**, the per-step cost of the extra HFET charge evaluation. That is a published cost.

## Reproduce

```
pnpm install --frozen-lockfile && pnpm -C packages/core build
node benchmarks/results/issue-469/crossings.mjs [--converged]
node benchmarks/results/issue-469/rc-exact.mjs
PROBE_SPICE_CONVERGED=1 PROBE_VARIANT='.tran 5ns 200ns=>.options reltol=1e-6\n.tran 5ns 200ns 0 10ps' \
  npx tsx benchmarks/results/issue-469/probe.ts corpus-e bjt-rtl-inverter-chain
node benchmarks/results/issue-456/compare-aggregate.mjs <main aggregate-report.json> <change aggregate-report.json>
npx tsx benchmarks/results/issue-456/perf-ab.ts <main checkout> . 5
```
