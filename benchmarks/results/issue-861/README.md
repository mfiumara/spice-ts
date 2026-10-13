# Issue #861: BJT `XCJC < 1` together with `RB > 0`

ngspice-47 bjtload.c splits the base-collector depletion capacitance by `XCJC`. `czbc = XCJC*CJC` sits on the internal base (base prime) inside `qbc`, together with the `TR` diffusion charge. The rest, `czbx = (1 - XCJC)*CJC`, is a separate charge `qbx` from the external base node to the collector-prime node, with the same depletion law and `vbx = type*(V(base) - V(colPrime))` read from the last solution, never limited. bjtacld.c stamps `capbx` the same way. BJTtrunc limits the step with `qbe`, `qbc` and `qsub` only, not `qbx`. `qbx` adds nothing to `cb`/`cc`, so bjtconv.c does not see it.

spice-ts used to reject `XCJC < 1` with `RB > 0` and `CJC > 0`. With `RB` expanded into a resistor, the device never saw the external base node. Such a device now gets the external base as a fifth node and stamps `gx` itself (`1/RB`, the same path as `RBM != RB`). `circuit.ts` already routes that node through `hasBiasDependentBaseResistance`. With `RB = 0` the external base is the base node, and only the step control changes (`qbx` is no longer truncated, as in ngspice).

`.noise` rejects such a device explicitly. The bjtnoise.c RB thermal noise comes from the expanded resistor, so it would otherwise be dropped silently.

## Deck (ngspice-47 references in the test)

| deck | test |
|---|---|
| `decks/xcjc-rb-amplifier.cir`: NPN common emitter + PNP follower, both `RB > 0`, `XCJC < 1`; `.op`, `.ac`, `.tran` | `packages/core/src/devices/bjt-xcjc-rb-861.test.ts` |

The deck was written for this issue by the spice-ts project (no third-party content). Each reference value was printed by `ngspice -b decks/xcjc-rb-amplifier.cir` (ngspice-47, Homebrew, KLU) from the deck's own `.control` block with `set numdgt=12`. The transient is `linearize`d on the 0.2 ns grid. spice-ts reads the same bytes.

| check | ngspice-47 vs spice-ts |
|---|---|
| `.op` v(c1), v(e1), v(e2), i(vcc) | within 1e-9 relative (v(c1) 2.875193518349 vs 2.8751935182772) |
| `.ac` vm/vp of v(c1), v(e2), 9 points 100 kHz to 1 GHz | within 1e-7 relative / 1e-7 rad |
| `.tran` v(c1), v(e2), all 601 grid points | max abs error 1.31 mV (c1), 1.29 mV (e2) |

A lumped capacitance (`XCJC = 1`) is not close: ngspice-47 gives |v(c1)| = 2.90 at 31.6 MHz instead of 3.70, and the transient moves by 0.1 to 0.2 V.

`RB = 0` variant of the same deck (not committed): the transient matches ngspice-47 to 2.0 mV both before and after this change, on the same 626 time points.

## ngspice-bugs #737: TI OPA690 macromodel

The TI `OPA690.LIB` from the #737 attachment is TI copyright and is not committed (`pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 737` downloads it). Local bench: `vp vp 0 5`, `vn vn 0 -5`, `vin in 0 dc 0.1 ac 1`, `rin in inv 1k`, `rf inv out 2k`, `rl out 0 1k`, `xu 0 inv vp vn out dis OPA690`, `op` and `ac lin 1 1k 1k`. ngspice-47 ran it with `set ngbehavior=ltps`. spice-ts ran the same deck with the `OPA690_F*` subcircuits' `VF_*` cards moved ahead of their `F_*` cards, a local workaround for #860 that leaves ngspice-47's output unchanged.

| quantity | ngspice-47 (ltps) | spice-ts before | spice-ts after |
|---|---|---|---|
| op v(out) | -1.89202124360866e-01 | `Unsupported BJT model parameter: 'XCJC' < 1 together with RB > 0` | -1.8920212435923656e-01 |
| \|v(out)\| at 1 kHz | 1.997947129545327 | (same error) | 1.9979471295453275 |
