# Issue #714: brace expressions and output variables in .print lines

spice-ts ran numparam substitution on `.print` cards, so a brace expression over output quantities
(`{DB(V(b))}`, `{abs(I(VT1))}`, `{fmod(99.5,V(1))}`, `{log(inoise)}`) rejected the whole deck with
`Unknown function` / `Undefined parameter`. ngspice-47 numparam never substitutes `.print`/`.plot`
cards (or their `+` continuations): the brace text reaches the frontend print command verbatim, which
warns and the analyses still run with exit status 0. Probed with `ngspice -b` on a 2-resistor deck:

| `.print dc V(1) ...` | ngspice-47 |
|---|---|
| `{abs(V(1))}` | `Error: no function as {abs with that arity.`, exit 0 |
| `{2*gain}` (gain a `.param`) | `Warning: can't parse '{2*gain}': ignored`, exit 0 (not substituted) |
| `{nosuch}` | `Warning: can't parse '{nosuch}': ignored`, exit 0 |
| `{log(inoise)}` | `Error: no such function as {log, ...`, exit 0 |
| `.plot dc V(1) {2*gain}` | same warning, exit 0 |
| `.save V(1) {2*gain}` | `incomplete or empty netlist`, exit 1 (unchanged in spice-ts, out of scope) |

`.func` macros are still expanded on `.print` cards (ngspice-47 prints `((v(1))*2)` for `{ff(V(1))}`
with `.func ff(x) {x*2}`), and spice-ts keeps that.

spice-ts now leaves `.print`/`.plot` lines and their continuations unsubstituted and reports each brace
expression as a structured `parse` warning (`.print/.plot expression '{...}' is not evaluated ...`).
spice-ts returns every computed vector through its result API, so the analyses are unchanged. The brace
expressions are not evaluated as derived vectors (ngspice-47 does not produce them either).

## Corpus-g bucket "output: expressions and output variables in .print lines" (11 decks)

Byte-identical corpus-g (#711) fixtures through ngspice-47 and spice-ts with the corpus-f runner, metric
and 1% threshold, no per-circuit tuning. Receipts: `receipts/parity-before.json` (the committed #711
`outcomes.json`, main 45d6ea73), `receipts/parity-after.json` (this branch rebased on main 9048f8cf, which
includes #713 Xyce `.options` packages and #715 MOS3/MOS9).

| Fixture | Analysis | Before | After | Worst signal (after) |
|---|---|---|---|---|
| ABM_DB/dbTest.cir | ac | unsupported | matched, 4.73e-16 | ac i(v1) |
| ABM_INT_FLOOR_CEIL/int_floor_ceil.cir | tran | unsupported | matched, 1.96e-13 | tran i(v1) |
| ABM_NINT_FMOD/fmod.cir | dc | unsupported | matched, 0 | dc i(v1) |
| ACSENS/ac-sens-current-obj_FD.cir | ac | unsupported | matched, 9.34e-16 | ac v(v1_r1) |
| EXPPRINT/expPrint.cir | dc | unsupported | matched, 2.08e-16 | dc i(vt1) |
| POWER/power_bjt_gear.cir | tran | unsupported | matched, 1.12e-07 | tran i(vie1) |
| Verilog_POWER/power_juncap200_gear.cir | tran | unsupported | matched, 4.93e-4 | tran v(5) |
| MULTIPLICITY_FACTOR/bjt_diffpair_noise_baseline.net | noise | unsupported | **failed**: `.noise does not support BJT model parameter 'CJC' for 'Q1'` | - |
| NOISE/cascodeBjtNOISE.cir | noise | unsupported | **failed**: `.noise does not support BJT model parameter 'VAR' for 'Q2'` | - |
| SENS/bsim4_issue694_FD.cir | tran | unsupported | **unsupported**: MOSFET LEVEL=54 (BSIM4) | - |
| VANOISE/commonEmitterBjt_mextram.cir | noise | unsupported | **unsupported**: `Unsupported bounded BJT model parameter: 'DTA'` | - |

7 of 11 now match ngspice-47. The 4 losses are past the `.print` line and blocked by other gaps:
the BJT `.noise` parameter guard (#736, 2 decks), BSIM4 (#3) and the BJT `DTA` model parameter
(1 deck, no issue filed).

## Reproduce

```sh
pnpm build
for id in abm-db-dbtest-cir abm-int-floor-ceil-int-floor-ceil-cir abm-nint-fmod-fmod-cir \
  acsens-ac-sens-current-obj-fd-cir expprint-expprint-cir multiplicity-factor-bjt-diffpair-noise-baseline-net \
  noise-cascodebjtnoise-cir power-power-bjt-gear-cir sens-bsim4-issue694-fd-cir \
  vanoise-commonemitterbjt-mextram-cir verilog-power-power-juncap200-gear-cir; do
  spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts --corpus-g-fixture-child "$id"
done
```

Tests: `pnpm -C packages/core exec vitest run src/parser/print-brace-714.test.ts src/parser/preprocessor.test.ts`.
