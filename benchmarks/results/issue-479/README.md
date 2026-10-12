# Issue #479: MOS device convergence test and MOS6trunc

Transient (and DC) Newton declared MOSFET convergence on node voltages alone. ngspice-47 also
runs the device convergence test after the node test passes (`NIconvTest`, `NEWCONV` is on in
`macros.h`): `mos1conv.c` / `mos6conv.c` predict the drain current `cd` and the bulk current
`cbs + cbd` at the new solution from the last load's linearisation and require them to match the
loaded values within `RELTOL * max + ABSTOL`. In transient, the load folds the junction charge
currents into those currents (`cbd += cqbd`, `cd -= cqbd`, `gbd += geq`, same for `cbs`/`gbs`).

This change:

- adds that test to MOSFET level 1 (`mosfet.ts`, both `stamp` and the batch-stamp path record the
  linearisation in the struct-of-arrays state) and level 6 (`mos6.ts`);
- adds `MOS6trunc` (CKTterr on qgs, qgd, qgb) to level 6. It was the only Meyer MOS model without
  it, so after #621 its nodes stayed on the node-voltage LTE. That, not Newton, is what made the
  mos6inv error scale with RELTOL: spice-ts took 830 timepoints (3619 at RELTOL=1e-5) where
  ngspice-47 takes 315 (630).

## How the root cause was found

```
pnpm -C packages/core build
npx tsx benchmarks/results/issue-479/stats.ts benchmarks/corpus/ngspice/fixtures/tests/mos6/mos6inv.cir
QUIET=1 npx tsx benchmarks/results/issue-479/wave.ts benchmarks/corpus/ngspice/fixtures/tests/mos6/mos6inv.cir "v(5),i(vin)" [RELTOL=1e-4]
```

`wave.ts` runs both engines on identical bytes and reports the error on the ngspice-47 grid
(spice-ts linearly interpolated). `stats.ts` prints the spice-ts transient telemetry. ngspice-47
counts come from the same deck with `.OPTIONS ACCT`.

| mos6inv.cir, default options | accepted | rejected | Newton iterations | runtime |
|---|---|---|---|---|
| ngspice-47 | 315 | 1 | 908 | |
| main dc7cc4a3 | 830 | 121 | 2529 | 350-365 ms |
| mos6conv.c only | 837 | 122 | 3019 | |
| this branch (mos6conv.c + MOS6trunc) | 311 | 2 | 900 | 171-175 ms |

The convergence test alone barely moves mos6inv (it adds iterations but the grid is still set by
the node-voltage LTE). MOS6trunc is what aligns the step control.

## Errors vs ngspice-47 (ngspice grid)

mos6inv.cir:

| options | signal | main | this branch |
|---|---|---|---|
| default | v(xndinv3.14) max | 221 mV | 104 mV |
| default | v(xndinv4.14) max | 57.8 mV | 149 mV |
| default | v(5) max | 16.9 mV | 34.0 mV |
| default | i(vin) max | 7.03 uA | 6.24 uA |
| RELTOL=1e-4 | v(xndinv3.14) max | 35.1 mV | 46.3 mV |
| RELTOL=1e-4 | v(5) max | 34.1 mV | 5.7 mV |
| RELTOL=1e-4 | i(vin) max | 4.46 uA | 1.84 uA |
| RELTOL=1e-5 | v(xndinv3.14) max | 7.0 mV | 3.3 mV |
| RELTOL=1e-5 | v(5) max | 7.8 mV | 5.9 mV |
| RELTOL=1e-5 | i(vin) max | 41.1 uA | 8.2 uA |

At default options the node voltages are mixed (worse on v(5) and xndinv4.14), because both
engines now take ~0.5 ns steps through 2.5 ns edges and the remaining difference is where each
lands its timepoints. With RELTOL tightened, the branch converges toward ngspice-47 instead of
plateauing. simpleinv.cir improves on every signal (aggregate metric, spice-ts grid):

| simpleinv.cir | main | this branch |
|---|---|---|
| v(11) abs max / RMS | 105.6 mV / 12.4 mV | 1.28 mV / 0.10 mV |
| i(vin) abs max / RMS | 2.07 uA / 0.228 uA | 70.6 nA / 6.9 nA |
| i(vdd) abs max / RMS | 0.617 uA / 71.8 nA | 12.2 nA / 1.4 nA |

Full per-signal receipts from `benchmarks/results/issue-468/verify.ts`:
`receipts/verify-468-{before,after}.json`.

## MOS1 gate-current deck (mosfet-capacitance.test.ts)

`VG g 0 PULSE(0 5 1n 5n 5n 1n 15n)` into a level-1 NMOS with TMAX 1 ps: main stopped Newton
after one iterate on most of its 13015 steps (15016 iterations), so the Meyer charges kept the
previous timepoint's capacitance. With mos1conv.c it takes 17417 (ngspice-47: 27701, it never
accepts the first iterate) and i(vg) now matches ngspice-47 to rounding in the linear region
(2.72-2.93 ns: main was off by 7.7e-9 to 2.0e-8 A). Whole waveform: max 2.29e-8 -> 1.46e-8 A,
RMS 2.86e-9 -> 2.02e-9 A.

Loss published: at 2.934-3.2 ns and 9.83-10.07 ns ngspice-47's i(vg) jumps by ~1.4e-8 A
relative to spice-ts, on main as well, and decays back. The test used to sample 3 ns and 10 ns,
where main's one-iterate lag happened to sit closer (5.6e-9 A vs 1.13e-8 A now). The samples
moved to 2.8 ns and 10.3 ns (ngspice-47 values from the identical deck); main fails 2.8 ns
(1.33e-8 A > 1e-8 A).

## Runtime (min of 3, `stats.ts`, loaded shared machine)

| deck | main | this branch | iterations main -> branch |
|---|---|---|---|
| mos6inv.cir | 350 ms | 171 ms | 2529 -> 900 |
| simpleinv.cir | 26 ms | 28 ms | 715 -> 667 |
| classic mosmem.cir (MOS1) | 32 ms | 37 ms | 305 -> 332 |
| corpus-e d_mos1.nand1.cir | 18 ms | 19 ms | 211 -> 223 |
| MOS1 gate-current deck | 67 ms | 74 ms | 15016 -> 17417 |
| 2000-stage MOS1 chain .op (`mos1-chain-timing.ts`) | 872 ms | 676 ms | 287 -> 293 |
| 200-stage MOS1 chain .tran | 1069 ms | 1031 ms | 1736 -> 2006 |

## Not in this change

- Diode and BJT transient convergence tests (`dioconv.c`, `bjtconv.c` with the charge currents
  folded in). BJT keeps its DC-only test.
- ngspice never accepts the first Newton iterate of a timepoint (`niiter.c`: `iterno != 1`) and
  keeps the state of the last load (MODEINITPRED extrapolation). Tried here: the iterate rule does
  not change mos6inv and costs ~1.5x iterations on the MOS1 gate deck without closing its
  ngspice-47 jump windows, so it is left out.
