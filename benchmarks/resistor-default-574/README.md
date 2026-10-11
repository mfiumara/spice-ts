# Resistor default and too-low clamp (#574)

ngspice-47 never rejects a resistor for missing resistance:

- `restemp.c RESupdate_conduct`: with no instance value, `L*W*RSH <= 0` and
  no model `R` (`resmpar.c` records model `R` only when `R > 0`), it warns
  `<name>: resistance too low or not given, set to 1 mOhm` and uses 1e-3 Ohm.
- `resparam.c RES_RESIST`: a given value with `|R| < RESMIN = 1e-12` is
  clamped to `+/-1e-12` with `Value of resistor <name> is too small, set to ...`.

spice-ts now does the same and surfaces both messages as `'model'` simulation
warnings. Two documented differences remain:

- An exact `0` stays an exact zero-ohm branch constraint in spice-ts, where
  ngspice uses 1e-12 Ohm. The node voltages differ by at most `1e-12 * I`.
- A bare `Rname n1 n2` card (no value, no model, no parameters) is still a
  `ParseError`. ngspice-47 `inp2r.c` prints "is not a valid resistor instance
  line, ignored!" and drops the element, which silently opens the circuit.

Run (after `pnpm -C packages/core build`, ngspice on PATH):

    node benchmarks/resistor-default-574/measure.mjs

The four decks are project-authored (MIT) and run byte-identical in both
engines; ngspice reads them with an added `.control` `wrdata` block.

## Result (ngspice-47, Apple M5 Pro, macOS 27)

ngspice prints 7 significant digits, so ~1e-12 relative error is the
precision floor of the comparison.

| Deck | Signal | ngspice-47 | spice-ts | Relative error |
|---|---|---|---|---|
| model-without-r (`.model rx r kf=0`) | i(v1) | -1000 | -1000 | 0 |
| non-positive-model-r (`r=0`, `r=-5`, `rsh` with `w=0`) | v(2) | 2.999991e-6 | 2.999991000027e-6 | 9.0e-12 |
| | v(3) | 1.999994e-6 | 1.999994000018e-6 | 9.0e-12 |
| | v(4) | 9.99997e-7 | 9.99997000009e-7 | 9.0e-12 |
| | i(v1) | -9.99997e-4 | -9.99997000009e-4 | 9.0e-12 |
| keyword-only-card (`l=1u`, `tc1=1m`) | v(2), v(3) | 9.99999e-7 | 9.99999000001e-7 | 1.0e-12 |
| | i(v1) | -1.999998e-3 | -1.999998000002e-3 | 1.0e-12 |
| tiny-value-clamp (`1e-15`, `-1e-15`) | v(2) | 1e-12 | 9.99999999999e-13 | 1.0e-12 |
| | v(3) | -1e-12 | -1.000000000001e-12 | 1.0e-12 |
| | i(v1) | -2 | -2 | 0 |

Warnings match ngspice per resistor (ngspice prints the 1 mOhm warning twice,
once per temperature update; spice-ts reports it once).
