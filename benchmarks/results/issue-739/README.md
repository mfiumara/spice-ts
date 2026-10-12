# Issue #739: mutual inductance K cards inside .subckt

A `K` card inside a `.subckt` body was rejected at subcircuit expansion with
`Unsupported device card: 'K'`. ngspice-47 expands it like any other element: the coupled
inductor names get the instance prefix (`L1` inside `xa.x2` binds to `xa.x2.L1`), so a K card
only reaches inductors of its own instance. ngspice binds K cards after every instance exists
(`MUTsetup`), so a K card may also precede its inductors; spice-ts threw on that order at top
level as well. Both now match ngspice-47:

- `expandSubcircuit` emits a K descriptor with instance-prefixed inductor names and the coupling
  evaluated in the instance's parameter scope (`K1 L1 L2 {kc}`).
- `compile()` binds a K card whose inductors are not yet compiled after the device loop; a K
  card naming a missing inductor still fails (ngspice-47: `k.x1.k1: coupling to non-existent
  inductor l.x1.ltop`; spice-ts: `K-element 'X1.K1' references unknown or non-inductor
  device(s): X1.L1, X1.LTOP`).

## Unit evidence

`packages/core/src/subcircuit-mutual-inductance-739.test.ts` (5 tests, all failing on main
17783f96, all passing on this branch):

| Test | Reference |
|---|---|
| nested `pair` subckt with two `xfmr` instances, K before L2 | ngspice-47 `print v(2) v(3) v(4)` on the identical deck, 5 time points, 1e-4 V |
| same deck vs hand-flattened top-level couplings | identical time grid, 1e-10 V |
| `K1 L1 L2 {kc}` with instance override `kc=0.9` | flattened `K1 L1 L2 0.9`, 1e-10 V |
| top-level K before its inductors | K after its inductors, 1e-10 V |
| K naming an inductor outside the instance | error naming `X1.LTOP`, like ngspice-47 |

On the nested deck the worst spice-ts vs ngspice-47 error over every ngspice output point is
7.0e-6 V on v(2) (peak 1.04 V), 1.0e-6 V on v(3), 0.93e-6 V on v(4).

## Corpus-g TL1X/TL1X_mpi.cir

Byte-identical corpus-g (#711) fixture, corpus-f runner, metric and 1% threshold, no per-circuit
tuning: `pnpm build && spice-heavy pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts
--corpus-g-fixture-child tl1x-tl1x-mpi-cir`.

| Build | spice-ts | Outcome | Worst | Receipt |
|---|---|---|---|---|
| main 45d6ea73 (committed outcomes.json) | unsupported, `EXP` source | spice-ts-loss | | `outcomes.json` |
| #716 branch alone (b813b812, per #739) | unsupported, `K` in `.subckt` | spice-ts-loss | | issue #739 |
| this branch on main 17783f96 | unsupported, `EXP` source | spice-ts-loss | | `receipts/tl1x-this-branch.json` |
| this branch merged with #716 b813b812 (scratch, not pushed) | success, tran:3007 vs ngspice tran:3008 | matched | 7.18e-05 (`tran i(vslow)`, 84 signals) | `receipts/tl1x-with-716.json` |

TL1X stays a loss on main until #716 lands: its first blocker is the `EXP` source. With #716
and this change together the deck matches ngspice-47 well inside the 1% threshold.
`AGGREGATE_PARITY.md` and corpus-g `outcomes.json` are not regenerated here.

## Not in scope

AC analysis of a circuit with any K card (top level included) returns NaN on main 17783f96. That
is the complex LU pivoting bug #732: on a scratch merge with PR #741 the flattened coupled pair
`.ac lin 3 1k 100k` gives |v(3)| = 0.504526 / 0.104273 / 0.052950, ngspice-47 0.5045257 /
0.1042726 / 0.05295039. The new tests therefore use transient analysis.
