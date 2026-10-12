# BSIM3v3.3.0 charge model parity with ngspice-47 (#626, #582)

This directory holds the evidence for [#626](https://github.com/mfiumara/spice-ts/issues/626). That issue covers `adder_mos_circ` (a 4-bit all-NAND adder built on default BSIM3 cards), whose supply current was far off ngspice-47. The DC core already matched ngspice after #589/#624; the operating point of the unchanged deck matches exactly (i(vcc) = -1.5888e-10 A in both engines). The transient error came from the capacitance model. `bsim3v3-cap.ts` was a bounded Meyer-style tanh approximation, not ngspice's charge model.

That file is now replaced by `bsim3v3-charge.ts`, a line-by-line port of the ngspice-47 `b3ld.c` charge section:

- capMod 0, 1, 2 and 3 (CTM), each with the 0/100, 40/60 and 50/50 partitions, plus XPART < 0 (no intrinsic charge).
- The bias-dependent overlap charge (CGDL/CGSL/CKAPPA).
- The acmMod = 0 junction charge (bottom, sidewall, gate-edge sidewall) with the `b3temp.c` TCJ*/TPB* laws.
- The reverse-mode assembly.

The device integrates the state charges qg, qd = qdrn - qbd and qb = qbulk + qbd + qbs as NIintegrate does, with the full nonreciprocal 4x4 Jacobian (the `gc**b` terms). It truncates exactly those three charges (BSIM3trunc). The AC, noise and PZ analyses stamp the same matrix that `b3acld.c` uses. NQS (nqsMod/acnqsMod = 1) and ACM junction areas are not ported.

## Files

| File | What |
| --- | --- |
| `cards.ts` | 31 cases: the 16 #589 cards plus 15 capMod/XPART/overlap/junction/temperature variants; the bias grids; the NAND transient deck. |
| `reference.ts` | ngspice-47 batch run: `@m1[cgg..cds]`, `@m1[qg/qb/qd]`, `@m1[capbd/capbs]` at 90 biases per case, plus 24 AC terminal-capacitance matrices per case at 1 GHz. Output: `ngspice-47-charge.json`. |
| `transient-reference.ts` | Two adder NANDs at TMAX = 10 ps. Records v(9), v(10) and the windowed supply charge. Output: `ngspice-47-nand-tran.json`. |
| `compare.ts` | Scores a build against both references. `--device` adds the b3ld.c outputs, which only exist on this branch. |
| `before.json` / `after.json` | `compare.ts` receipts for main `b3f04506` and this branch. |
| `adder-run.ts` | Records a spice-ts waveform of a deck for `benchmarks/adder-timeout-611/compare.ts`, which applies the corpus metric. |
| `adder-mos-circ-*.json` | That metric on the unchanged corpus-f deck (sha256 `122f9480…`), at default steps and with `.TRAN 1NS 200NS 0 0.01NS` (`-tmax10p-`). |
| `sram-582-*.json` | `benchmarks/bsim3-reverse/compare.ts` (#582 6T SRAM write) for both trees. |

The quasi-static capacitance matrix does not depend on frequency. The AC reference uses 1 GHz because at 1 MHz the spice-ts complex AC solve resolves the imaginary current only to about 3e-10 of the real current, which corresponds to about 2e-19 F at forward-biased junctions. That error scales as 1/ω and does not come from the device. At 1 GHz it is below 1e-24 F.

## Reproduce

    pnpm install --frozen-lockfile && pnpm -C packages/core build
    pnpm exec tsx benchmarks/bsim3-charge-626/reference.ts             # needs ngspice-47 on PATH
    pnpm exec tsx benchmarks/bsim3-charge-626/transient-reference.ts
    pnpm exec tsx benchmarks/bsim3-charge-626/compare.ts --device --output benchmarks/bsim3-charge-626/after.json
    pnpm -C packages/core exec vitest run src/devices/bsim3v3-charge-parity.test.ts
    # adder: ngspice -b -r adder.raw adder_mos_circ.cir (ASCII raw), then
    pnpm exec tsx benchmarks/bsim3-charge-626/adder-run.ts adder_mos_circ.cir st.json
    pnpm exec tsx benchmarks/adder-timeout-611/compare.ts st.json adder.raw

`before.json` was produced by running `compare.ts --core <main b3f04506 dist>`, without `--device`.

## Results (ngspice-47, identical netlists, 1% threshold)

| Check | main b3f04506 | this branch |
| --- | ---: | ---: |
| AC terminal capacitance entries within 1% | 1744 / 6696 (0 / 31 cases) | 6696 / 6696 (31 / 31) |
| b3ld.c charges/capacitances within 1% (device level) | n/a (no charge model) | 39060 / 39060 (31 / 31) |
| NAND @ 10 ps: v(9) / v(10) / supply charge, max err ÷ peak | 0.204 / 0.959 / 0.621 | 1.2e-5 / 6.6e-5 / 1.8e-4 |
| adder_mos_circ, TMAX 10 ps (0-200 ns): worst node voltage | 0.999 | 9.1e-4 |
| adder_mos_circ, TMAX 10 ps: i(vcc) | 0.622 | 0.0146 |
| adder_mos_circ, unchanged deck: worst node voltage / i(vcc) / worst signal | 1.02 / 0.517 / 1.13 | 0.231 / 0.161 / 0.747 |
| adder_mos_circ, unchanged deck: points, wall time | 2123, 11.1-11.2 s | 1659, 6.4-6.5 s |
| #582 SRAM write: max abs err v(q) / v(qb) (1.8 V swing) | 0.339 V / 0.666 V | 0.0132 V / 0.0126 V |

Published losses:

- **adder_mos_circ at default steps is still a mismatch.** Worst signal: 0.747 (i(vin1a)); supply current: i(vcc) 0.161. At TMAX = 10 ps the same deck matches to 9.1e-4 on every node voltage, so the device is not the remaining cause. The residual is transient step selection: the two engines' grids diverge from the second step on. ngspice uses 0, 0.01, 0.02, 0.04 ns, while spice-ts uses 0, 0.01, 0.03, 0.07 ns ([#561](https://github.com/mfiumara/spice-ts/issues/561)). Before the 10 ns corner ngspice applies the 1.9x equalisation, 8.28 → 9.14 → 10 ns, while spice-ts goes 9.27 → 10 ns ([#608](https://github.com/mfiumara/spice-ts/issues/608)). Over the run that is 1659 against 1533 points, and a sub-ns edge offset when both engines take ~0.8 ns steps across ~1 ns edges.
- **Remaining current residual at fine steps.** i(vcc) 0.0146 and the input-source currents (gate dQ/dt) at TMAX = 10 ps come from two harness effects. First, the metric interpolates across PULSE corners. Second, both engines show trapezoidal ringing at the corners, and they sample it in different phases (e.g. -1.06/-4.0 µA in spice-ts vs -1.11/-3.95 µA in ngspice at 40 ns). The windowed supply charge, which trapezoidal integration conserves, matches to 1.8e-4.
- **Per-step cost.** The charge model costs more per Newton iteration than the Meyer approximation, as it does in ngspice. The vitest BSIM3 bench (mean, quiet host) went from 9.00 to 10.44 ms on the 3-stage inverter chain and from 21.1 to 22.3 ms on the 5-stage chain. adder_mos_circ at TMAX 10 ps went from 30.0 to 38.9 s at equal step counts. The unchanged adder deck is 1.7x faster overall, because it needs 9.3k Newton iterations instead of 22k and has no NR retries.
