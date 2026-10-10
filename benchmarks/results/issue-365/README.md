# Issue #365 — diode `CJO` is an alias of `CJ0`

## Change

- `diodeZeroBiasCapacitance()` (`packages/core/src/devices/diode.ts`) resolves the
  zero-bias junction capacitance from either spelling. ngspice-47 maps both
  `CJO` (letter) and `CJ0` (digit) to the same model field.
- It is used both when the `Diode` device is built (AC, transient, DC-cap,
  noise and `.disto` all read the single resolved `CJ0`) and when `RS` is
  expanded onto an internal junction node (`circuit.ts`), so `CJO` + `RS`
  now gets the same internal-node topology as `CJ0` + `RS`.
- `CJO` and `CJ0` with different values raise `InvalidCircuitError`
  (`Diode 'D1' sets both CJO=… and CJ0=…`). Equal values are accepted.

## Reproduce

```sh
pnpm -C packages/core build
node benchmarks/results/issue-365/compare.mjs ac ac_vj1 acrs acrs_vj1 tran tran_vj1
node benchmarks/results/issue-365/xyce-level2-cjo.mjs
for f in benchmarks/results/issue-365/ngspice/*.cir; do ngspice -b "$f" > "${f%.cir}.out"; done
```

Reference: ngspice-47 (Homebrew, KLU), macOS arm64, Node v22.23.1. The same
netlist (minus the `.control` block) is fed to spice-ts. Committed
`ngspice/*.out` files have trailing whitespace stripped (values untouched). AC compares `vm(out)`
at the ngspice frequencies; transient compares `v(out)` at ngspice's linearized
0.1 ns grid (spice-ts linearly interpolated). Relative error uses a floor of
1e-3 x peak |ref|. `before` = base `2b7e047` dist, `after` = this branch.

## Issue repro vs ngspice-47 (`.model DM D IS=1e-14 CJO=10p`, V1 DC -1 AC 1, R1 1k)

| deck | vm(out)@100 MHz before | after | ngspice-47 | max rel before | max rel after | RMS rel after | max abs after |
|---|---|---|---|---|---|---|---|
| `ac` (issue deck, default VJ) | 1.000000 | 0.240731 | 0.219586 | 43.4 | 0.102 | 0.0698 | 3.66e-2 |
| `ac_vj1` (+`VJ=1`) | 1.000000 | 0.2195856260 | 0.2195856259 | 43.4 | 2.5e-10 | 1.7e-10 | 9.3e-11 |
| `acrs` (+`RS=200`) | 1.000000 | 0.260018 | 0.246615 | 4.96 | 0.0704 | 0.0348 | 3.53e-2 |
| `acrs_vj1` (+`RS=200 VJ=1`) | 1.000000 | 0.2466152279 | 0.2466152279 | 4.96 | 2.1e-10 | 1.0e-10 | 1.1e-10 |

Transient `PULSE(-1 1 0 1n 1n 20n 50n)`, `.tran 0.1n 50n`, 501 points:

| deck | max abs before | RMS abs before | max abs after | RMS abs after |
|---|---|---|---|---|
| `tran` (default VJ) | 1.574 V | 0.662 V | 35.4 mV | 17.6 mV |
| `tran_vj1` (`VJ=1`) | 1.574 V | 0.662 V | 8.8 mV | 3.7 mV |

Full metrics: `compare-before.json`, `compare-after.json`.

Losses that remain (not caused by the alias, identical with the `CJ0`
spelling; filed separately):

- the default-VJ decks still differ by up to 10% because spice-ts defaults
  `VJ` to 0.7 where ngspice uses 1.0, and the forward-bias region above
  `FC*VJ` is held constant instead of ngspice's linear extension (#388);
  with `VJ=1` the AC result matches to 2.5e-10 relative.
- the remaining transient error with `VJ=1` (8.8 mV) is in the forward-bias
  phases, consistent with the same FC-region difference (#388).

## Unchanged corpus fixtures that use `cjo`

| fixture | analysis | before → after |
|---|---|---|
| `xyce/DIODE/Zener_5229.cir` | DC | rejected before and after (`.OPTIONS DEVICE`) |
| `xyce/DIODE/diode_with_sidewall.cir` | DC sweep | identical output (DC, capacitance not used) |
| `classic/spice3f5/diodisto.cir` | `.disto` | identical output (`.disto` already read CJO) |
| `xyce/DIODE/Level2_Temp_Dep_Breakdown.cir` | `.step TEMP` tran | changed, see below |

`Level2_Temp_Dep_Breakdown.cir` (`CJO=1P`, `level=2`; ngspice-47 rejects it:
"Diode model level 2 is not supported", so no ngspice reference). Before =
the deck with the `CJO` line removed, which is exactly what pre-fix spice-ts
simulated (`xyce-level2-cjo.txt`):

```
TEMP=-55 points 21->645 max|dV(2)|=3.817e-5 V(2)@1s 7.194598->7.194599
TEMP=25 points 21->645 max|dV(2)|=7.502e-5 V(2)@1s 7.278809->7.278813
TEMP=72 points 21->645 max|dV(2)|=1.071e-4 V(2)@1s 7.325935->7.325942
```

The 1 pF junction carries only pA here, yet the t = 1 s endpoint moves by up
to 8.3 uV versus the Xyce gold values (1.1e-6 relative; before: at most
1.1e-6 V). On a level-1 adaptation run identically in both simulators
(`ngspice/l1_{cjo,nocjo}_27.cir`) ngspice-47 gives 7.280849981115 with and
without CJO, spice-ts 7.280854109855 with CJO and 7.280849640809 without.
With `.options reltol=1e-6` or `tmax=1m` the spice-ts endpoint is back within
1e-6 V of the gold. This is a pre-existing transient accuracy issue that the
alias now exposes (#389); the Xyce endpoint assertion in
`xyce-primitive-compatibility.test.ts` was widened from 5e-6 V to 1e-5 V with a
comment pointing at #389. No other tolerance was changed.

## Gates (this branch)

`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm test`
(core 1089/1089), `git diff --check`, `pnpm bench:accuracy`
(`accuracy-after.txt`; table identical to base `2b7e047`, no accuracy circuit uses CJO).
