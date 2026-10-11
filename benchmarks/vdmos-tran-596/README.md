# inv_vdmos.sp transient vs ngspice-47 (issue #596)

corpus-f `examples/vdmos/inv_vdmos.sp` is scored as a transient loss: i(vdd) 0.100 normalised against ngspice-47 at the 1% threshold. This directory measures where that number comes from.

Reproduce (ngspice-47 on PATH):

    pnpm -C packages/core build
    node benchmarks/vdmos-tran-596/measure.mjs > benchmarks/vdmos-tran-596/results.json

The deck is the byte-identical fixture with its `.control` block replaced by a `.tran` card. No device or source card is changed. Errors use the corpus-f metric: max |a - b| at the scored engine's points, the other waveform linearly interpolated, divided by the reference peak. Machine: Apple M5 Pro, Node v22.23.1, ngspice-47.

## Result

The VDMOS device model is at parity. The 0.100 is a time-grid effect. ngspice's own `tran 1n 1u` waveform is off its converged answer by 4.8% on the same metric.

### 1. Corpus-f comparison (fixture `tran 1n 1u`, spice-ts vs ngspice)

| signal | normalised | abs max |
|---|---|---|
| i(vdd) | 0.100 | 0.0297 A |
| i(vss) | 0.0999 | 0.0297 A |
| v(3) | 0.0315 | 0.158 V |
| i(vin) | 0.0292 | 29.7 uA |

Points: ngspice 1050, spice-ts 1864. This reproduces the issue table.

### 2. Each engine against converged ngspice (TMAX 0.5p, t <= 340 ns, 680023 points)

| run | i(vdd) | v(3) | i(vin) |
|---|---|---|---|
| ngspice-47, fixture `tran 1n 1u` | 0.0484 | 0.0031 | 0.0046 |
| spice-ts, fixture `tran 1n 1u` | 0.0124 | 0.0016 | 0.0012 |
| spice-ts, TMAX 10p | 0.0010 | 0.00007 | 0.0001 |

At converged step sizes the two engines agree within 0.1% on every signal. On the fixture's own card, spice-ts is about 4x closer to the converged answer than ngspice is.

### 3. i(vdd) shoot-through peak vs TMAX (`tran 1n 180n 0 TMAX`)

| TMAX | ngspice rising | spice-ts rising | ngspice falling | spice-ts falling |
|---|---|---|---|---|
| default (1n) | -0.29674 | -0.30925 | -0.27647 | -0.28464 |
| 10p | -0.31923 | -0.31322 | -0.29390 | -0.28874 |
| 5p | -0.31622 | -0.31324 | -0.29131 | -0.28874 |
| 2p | -0.31443 | -0.31342 | -0.28977 | -0.28890 |
| 1p | -0.31383 | -0.31347 | -0.28926 | -0.28894 |
| 0.5p | -0.31353 | -0.31337 | -0.28900 | -0.28886 |

Both engines converge to the same peak, -0.3134 A rising and -0.2889 A falling. ngspice approaches it at first order in TMAX. spice-ts has converged by 10p.

## Root cause

The i(vdd) spike is channel shoot-through while both devices conduct. It lasts about 4 ns. With the fixture's `tran 1n 1u`, the maximum step is 1 ns. ngspice's charge-only truncation check (vdmostrun.c CKTterr on qgs, qgd and the body-diode charge) does not restrict the step during the edge, so ngspice crosses the spike with 1 ns steps (20.7, 21.5, 22.5, 23.5 ns) and under-reads the peak by 5.4%. spice-ts also applies its node-voltage truncation check, so it takes smaller steps through the edge. Its grid is different, and closer to the true waveform. Scoring one under-resolved grid against the other with linear interpolation gives the 10% gap. v(3) and i(vin) carry the same grid offset at 3%.

Disabling the spice-ts node-voltage check in a local experiment (not committed) gave 1069 points, close to ngspice's 1050. i(vdd) still stayed at 0.081 because the 1 ns steps land at different phases (ngspice 21.5/22.5 ns, spice-ts 20.99/21.99 ns). Only an identical step sequence would close the gap at this resolution. That would mean reproducing ngspice's truncation error, not the circuit.

## Status

This stays a published loss at the fixture's `tran 1n 1u`. It is not a VDMOS device bug: Cgs, the nonlinear Cgd (DevCapVDMOS), the body-diode charge and RG all agree with ngspice-47 once both engines resolve the edge (`packages/core/src/devices/vdmos.test.ts`, issue #596 test). Any remaining difference belongs to the transient time-step policy, which is a solver-wide question and not a per-circuit one.
