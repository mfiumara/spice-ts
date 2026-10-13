# Resistor card forms (#498)

spice-ts vs ngspice-47 for the ngspice resistor syntax used by the nine
corpus-f batch-1 decks in the `device: R-card forms` bucket (#484):

- keyword values: `r1 1 2 r=1k`, `RLoad OUT 0 r = 8`, `resistance=`;
- AC resistance: `R1 1 2 1k ac=4k` (DC/transient use 1k; AC, noise and
  pole-zero use 4k, as `resload.c RESacload` / `respzld.c` do);
- `noisy=0` / `noise=0` (noiseless in `.noise`, `resnoise.c`);
- `m=`, `scale=`, `tc=`/`tc1=`/`tc2=`/`tce=` (incl. ngspice's `tc=a b` form);
- `.model R` references: model `r=`/`res=`, `rsh` with `l`/`w`/`defw`/
  `short`/`narrow` geometry, and instance defaults on the model card
  (`.model myres r(resistance=2k)`).

Semantics follow ngspice-47 `restemp.c RESupdate_conduct`: an explicit value
wins, then `RSH*(L-2*SHORT)/(W-2*NARROW)` when `L*W*RSH > 0`, then the model
`R`, else 1 mOhm with a warning (#574, see `../resistor-default-574`).
`G = M / (R * factor * SCALE)`; any `TCE` (instance or model) selects
`factor = 1.01^(TCE*dT)`, otherwise `1 + TC1*dT + TC2*dT^2`. Thermal noise
uses the DC conductance even when `ac=` is given (as ngspice does).
Instance `temp=`/`dtemp=` (or their `.model` defaults, including PSpice
`T_ABS`/`T_REL_GLOBAL` as ngspice-47 inpcompat.c translates them, #846) set the
instance temperature used by both the factor and the thermal noise; a given
`temp` ignores `dtemp` (restemp.c). An instance-line `temp=`/`dtemp=` combined
with a non-nominal `.options TEMP` is still rejected.

Still rejected with a typed `UnsupportedResistorParameterError`
(`code: 'UNSUPPORTED_RESISTOR_PARAMETER'`): unknown
keywords, unknown `.model R` parameters, and quoted/brace expression values
such as the behavioral `R = 'res + 0.033*res*V(r2)'`. `.noise` with a resistor
model `kf != 0` (1/f noise), `.disto` with an `ac=` resistor and AC `.sens`
of an `ac=` resistor are rejected with `InvalidCircuitError`.

Run:

    pnpm exec tsx benchmarks/resistor-forms/compare.ts

It writes `report.json`.

## Method

`res_array.cir` and `res_partition.cir` are committed byte-identical under
`fixtures/` (SHA-256 pinned in `report.json`) and run unmodified in both
engines. The other fixtures drive their analyses from ngspice `.control`
scripts (`if`/`let`/`dowhile`/`altermod`/`noise` commands), so the
identical-bytes corpus-f harness gets no ngspice vectors for them (#528) and
spice-ts rejects their control language (#488). For those, the comparison uses
the fixture's resistor, source and model cards verbatim plus dot analysis
cards equivalent to the `.control` analysis. Both engines read the same text,
except `temper-res-1`: ngspice runs `.dc temp 10 100 10`, spice-ts runs the
same body with `.op` and `.step TEMP LIST 10 20 ... 100`. `ac-resistance-pz`
drops `Vin` because spice-ts `.pz vol` accepts only R, L and C (#504).

## Result (ngspice-47, Apple M5 Pro, macOS 27, Node 22.23.1)

Before this change spice-ts rejected all nine fixtures at their first
resistor card. After it:

| Case | Signal(s) | Max relative error vs ngspice-47 |
|---|---|---|
| loop-model (`rmod` model `r=1k`) | op v(n1) | 0 |
| resdiv divider / `noisy=0` / filter | noise spectra and totals | 1.74e-7 |
| instance-defaults (`resistance=2k` on the model) | op i(v1) | 0 |
| ac-resistance (`ac=4k`) | op v(2), ac \|v(2)\| | 0, 2.4e-16 |
| ac-resistance pz | pole(1) | 1.2e-16 |
| temper-res-1 (tc1/tc2, model tce, instance tce) | i(v1..v3) over 10 temperatures | <= 3.4e-16 |
| res_array (identical bytes) | op, ac i(VR1..VR5) | 0 |
| res_array (identical bytes) | tran i(VR1..VR5), spice-ts interpolated onto ngspice times | 1.4e-3 (8.8e-4 of peak) |
| res_partition (identical bytes) | op, ac v(2), i(vin) | 0 |

The 1.74e-7 noise offset is the same on every noise vector and is not a
resistor effect: spice-ts uses the CODATA-2018 Boltzmann constant
(1.380649e-23), ngspice-47 `CONSTboltz` = 1.38064852e-23, and
sqrt(1.380649/1.38064852) - 1 = 1.74e-7. `benchmarks/differential-noise`
shows the same residual.

The res_array transient residual is a timestep/interpolation difference, not
the resistor stamp: the array is purely resistive, and `i(VRk)/v(1)` at each
engine's own timepoints is 1e-4, 1e-4, 0, 2e-4 and 1e-4 S in both engines
(agreeing to 1e-16). ngspice returns 59 points, spice-ts 80. The corpus-f
harness, which aligns differently, reports 2.53e-2 of peak for the same deck.

### Losses (not fixed here)

- `examples/Monte_Carlo/OpWien.sp`: behavioral resistors
  `R2 4 6 R = 'res + 0.033 * res*V(r2)'` are rejected with
  `UnsupportedResistorParameterError` (expression values, #493/#495). The deck
  also needs behavioral capacitors and `trrandom` sources.
- `examples/noise/bipolar-noise.cir`: the resistor cards now parse, but the
  BJT model's `VAR` parameter is still rejected (Gummel-Poon coverage, #5),
  and its `noise` runs from `.control` (#488).
- `examples/loops/loop-model.cir`: `.csparam` (#496) and `dowhile`/`altermod`
  control scripting (#488).
- The control-only regression decks (`resdiv`, `instance-defaults`,
  `ac-resistance`, `temper-res-1`) still stop at `if`/`let`/`noise`
  `.control` commands (#488) in the identical-bytes harness, although the
  resistor semantics above match.
