# Issue 340: B-source and NMF level-2 MESFET receipt

This receipt covers the unchanged ngspice fixture `ngspice/mesa-oscillator`
(`benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir`, SHA-256
`3cd4609cca7874775b7b2cac8cd0124bd2b8c5512064a0550a29de2da4896bcf`, BSD-3-Clause
provenance in `benchmarks/SOURCES.md`). Before this change spice-ts rejected
it at the first unsupported card (`B`, see issue-338). It now simulates it.
The waveform still differs from ngspice-47 on switching edges, and that
difference is published below as a loss.

## What was implemented (fixture-agnostic)

- **B-card `I=` behavioral current source** (`parser/behavioral-expression.ts`,
  `devices/behavioral-current-source.ts`). It parses expressions to an AST and
  stamps an exact first-derivative linearisation at every Newton iteration.
  Supported grammar: numbers with SPICE scale factors, `v(n)`, `v(n1,n2)`,
  unary `+`/`-`, binary `+ - * /`, parentheses, and `tanh exp sinh cosh atan
  sin cos abs`. These follow ngspice `ptfuncs.c` semantics: the exp clamp,
  the sin/cos 2π modulus and the divide fudge. Every other token, function,
  operator, `V=` form or instance parameter raises `ParseError`.
- **Z-card dispatch by model type** (`devices/z-device.ts`,
  `parser/z-device-parser.ts`). `NHFET` stays on the #339 HFET1 model and
  `NMF` uses the new MESA model. Z and B cards are now accepted both at top
  level and inside subcircuits.
- **NMF LEVEL=2** (`devices/mesa-model.ts`, `devices/mesa.ts`). This is a
  line-by-line port of ngspice-47 `mesatemp.c` plus `mesa1()`/`MESAload()` at
  TEMP=TNOM=27 °C. It includes:
  - the channel current with ngspice's forward-orientation gm/gds stamping
    (including inverse mode);
  - Schottky + GGR gate junctions with CKTgmin;
  - intrinsic RSI/RDI, external RD/RS, the AG correction, and Cgs/Cgd
    charge storage.

  Temperature, RG/RI/RF, sidegating, dispersion, level-3/4 parameters and
  instance `M/OFF/IC/TD/TS/DTEMP` are rejected rather than ignored.
  `.ac/.noise/.tf/.sens/.disto/.pz` with an NMF device raise
  `InvalidCircuitError`. `.step TEMP` was already rejected for every Z card.

The full supported/unsupported contract is in `report.json` → `contract`.

## Device-level parity (ngspice-47 `op`)

- `ngspice-op-points.cir` covers the intrinsic `driver` model at 30 bias
  points across subthreshold, linear, saturation, inverse and forward-gate
  regions. 21 points are checked in `devices/mesa-model.test.ts` for `i(vd)`,
  `i(vg)`, gm, gds, ggs and ggd. Each is within half a unit of ngspice's last
  printed digit (≤5.01e-6 relative).
- `ngspice-inverter-op.cir` is the fixture's `mesinv` stage, with B load,
  RD/RS and the Z driver, at vin = 0, 0.2, 0.3, 0.4 and 0.6 V.
  `v(3)`, `i(vdd)` and `i(vin)` match within 1e-5 relative
  (`mesa-behavioral-integration.test.ts`).
- The B-source `.op` and `.ac` results for `v1 1 0 dc 1 ac 1; r1 1 2 1k;
  b1 2 0 i=1m*tanh(v(2))` match ngspice-47: `v(2)=0.5212985` and
  `|v(2)|=0.5647022`.

## Fixture transient: identical input, `verify.ts`

Both engines receive the same immutable fixture `Buffer`. ngspice-47 runs as
a native child process (`-b -r`, ASCII raw). spice-ts runs in-process from
`packages/core/dist`. Timings come from one sequential run and are
descriptive only.

| Engine | Status | Points | Signals | Wall clock |
| --- | --- | --- | --- | --- |
| ngspice-47 | success | 201 (1.01–5 ns) | 37 | 131.8 ms (incl. process start) |
| spice-ts | success | 5307 (0–5 ns) | 59 | 22.59 s |

The comparison interpolates ngspice onto the spice-ts grid. It uses 2041
aligned points; 3266 spice-ts points before ngspice's first sample are
excluded. All 37 ngspice signals are compared. Selected rows (all signals are
in `report.json`):

| Signal | max abs | RMS abs | max rel | RMS rel |
| --- | --- | --- | --- | --- |
| v(8) | 0.1781 V | 0.02473 V | 0.8595 | 0.1038 |
| v(3) | 0.1456 V | 0.02276 V | 0.6006 | 0.08101 |
| worst ring node v(6) | 0.1782 V | 0.02436 V | 0.8081 | 0.09714 |
| v(xinv01.1) | 9.91e-5 V | 1.347e-5 V | 6.213e-5 | 8.447e-6 |
| i(vdd) | 1.674e-6 A | 5.149e-7 A | 6.064e-4 | 1.866e-4 |
| i(vnoise) | 1.576e-4 A | 1.625e-5 A | 123.1 | 3.587 |
| v(1) | 2.0e-15 V | 5.8e-16 V | 1.2e-15 | 3.6e-16 |

## Losses (not hidden, not tuned)

- **Phase drift.** The ring oscillator's phase drifts between the engines.
  The node-voltage errors (up to 0.178 V, RMS ≈ 0.024 V) sit on switching
  edges. The levels agree (≈0.115 V low, ≈0.554 V high). Contributing causes:
  - different timestep control;
  - spice-ts companion history for voltage-dependent capacitance versus
    ngspice's MESA charge-state integration;
  - no DEVpnjlim/DEVfetlim limiting;
  - linear interpolation between ngspice's ~20 ps samples across fast edges.
- **TSTART ignored.** spice-ts ignores the `.tran` TSTART (1 ns) and reports
  from t = 0. This is pre-existing and generic, not part of this change.
- **Extra signals.** spice-ts exposes 22 internal RD/RS node signals that
  ngspice does not output.
- **Speed.** spice-ts is ~170× slower than ngspice here (22.6 s vs 0.13 s).
  It takes 5307 points versus ngspice's ~201, and the CPU profile is ~50%
  sparse LU factorisation, which is outside this change.
- `i(vnoise)` relative errors are dominated by near-zero reference currents.

## Reproduce

```text
pnpm -C packages/core build
pnpm exec tsx benchmarks/results/issue-340/verify.ts --check
ngspice -b benchmarks/results/issue-340/ngspice-op-points.cir
ngspice -b benchmarks/results/issue-340/ngspice-inverter-op.cir
```
