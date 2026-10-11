# Issue 530: MOS level-1 body effect, signed VTO, LD, and no silent Level-1 fallback

Issue: https://github.com/mfiumara/spice-ts/issues/530

## What changed in spice-ts

The level-1 MOSFET (`packages/core/src/devices/mosfet.ts`) now evaluates the drain current like ngspice-47
`mos1load.c` and resolves parameters like `mos1set.c`/`mos1temp.c` (TNOM = 27 C):

- Body effect. `von = type*VTO - GAMMA*sqrt(PHI) + GAMMA*sarg`, where `sarg = sqrt(PHI - vbs)` for vbs <= 0,
  otherwise `max(0, sqrt(PHI) - vbs/(2*sqrt(PHI)))`. `gmbs = gm*GAMMA/(2*sarg)` is stamped on the bulk
  column. In reverse mode (vds < 0) the drain and source swap and vbd is used. As in ngspice, the
  vbs/vbd that enter the drain current are the DEVpnjlim-limited junction voltages. GAMMA defaults to 0 and
  PHI to 0.6. With TOX and NSUB given, both are derived from NSUB unless they are given.
- Signed VTO. The threshold is `type*VTO`, no longer `|VTO|`. An NMOS with VTO < 0 or a PMOS with VTO > 0 is
  a depletion device and conducts at vgs = 0. DEVfetlim pivots on the previous iteration's von (ngspice
  `MOS1von`).
- LD. `Beta = KP*W/(L - 2*LD)`. `.noise` flicker density also uses `W*(L - 2*LD)`, as in `mos1noi.c`.
  A non-positive effective length is an `InvalidCircuitError`.
- Unimplemented MOS levels. A MOSFET card whose LEVEL is not 1, 6, 8 or 49 raises
  `UnsupportedModelLevelError` (`code: 'UNSUPPORTED_MODEL_LEVEL'`, with `deviceName`, `modelName`, `level` and
  `supportedLevels`) at compile time. Before this change, LEVEL 2/3 (MOS2/MOS3), 4/5 (BSIM1/BSIM2) and any
  other level ran the Level-1 equations without a warning. The #518 VTO/KP defaults for levels 2 and 3 are
  removed, because no LEVEL 2 or 3 card reaches this class any more.

## Reproduce

    pnpm -C packages/core build
    pnpm exec tsx benchmarks/results/issue-530/compare.ts --label after
    pnpm exec tsx benchmarks/results/issue-530/summarize.ts

`compare.ts` feeds byte-identical inputs to native ngspice-47 and to spice-ts. The inputs are every committed
corpus fixture that the base revision ran through the level-1 MOSFET class (an NMOS/PMOS card whose LEVEL is
not 6/8/49) plus the six project-authored fixtures in `fixtures/` (MIT). Fixture hashes are checked against
the manifests. `before.json` was measured at base `fbbbe85`, and `after.json` was measured with this branch's
runtime code. `SUMMARY.md` is the full before/after table: every changed signal with its max/RMS absolute and
relative errors, losses included. No fixture, tolerance or per-circuit setting changed.

## Wins (after vs ngspice-47, worst absolute max)

| fixture | analysis | before | after |
|---|---|---:|---:|
| classic/mos-memory-cell (spice3f5 `mosmem.cir`, NSUB-derived GAMMA, bulk tied to a rail) | tran v(8) | 1.91 V | 0.0831 V |
| classic/mos-memory-cell | tran v(5) | 1.86 V | 0.0284 V |
| classic/mos-memory-cell | tran v(3) | 1.87 V | 0.248 V |
| classic/mos-memory-cell | tran i(vs) | 0.0124 A | 0.00852 A |
| issue-530/nmos-body-effect-vbs-sweep | dc i(vd) | 1.66e-4 A | 2.2e-19 A |
| issue-530/nmos-body-effect-vgs-sweep | dc i(vd2) | 1.11e-3 A | 3.0e-18 A |
| issue-530/nmos-depletion-signed-vto | dc i(vd) | 8.75e-4 A | 4.3e-19 A |
| issue-530/nmos-lateral-diffusion | dc i(vd) | 5.75e-4 A | 1.7e-18 A |
| issue-530/nmos-nsub-derived-gamma | dc v(out) / tran v(out) | 0.593 / 0.599 V | 1.87e-5 / 0.00522 V |
| issue-530/pmos-signed-vto-body | dc v(d3) / v(d2) | 2.99 / 0.341 V | 0.00112 / 0.000177 V |

## Losses (published as measured)

- Four corpus fixtures no longer run. They use MOS levels spice-ts does not implement, so they now fail with
  `UnsupportedModelLevelError` instead of returning Level-1 numbers:
  - ngspice/mos-amplifier-transient and classic/mos-amplifier (spice3f5 `mosamp2.cir`, LEVEL=2). Before this
    change, worst tran v(5) was 5.25 V abs max (0.437 rel max).
  - classic/bsim1-device-sweep (LEVEL=4). Before, worst dc i(vds) was 1.31e-4 A.
  - classic/bsim2-device-sweep (LEVEL=5). Before, worst dc i(vds) was 2.40e-4 A.
  These fixtures stay in the corpus. They come back when MOS2 or BSIM1/2 are implemented.
- classic/mos-memory-cell: i(vw) rel max 1.78 to 1.79 and i(vwb) rel max 1.00 to 1.02, at unchanged absolute
  max (0.0272 A and 0.0351 A). v(7) abs max 4.43e-14 to 4.61e-14 V.
- issue-530/nmos-nsub-derived-gamma tran i(vin) abs max 9.07e-8 to 9.35e-8 A.
- Rounding-level changes only (below 1e-12 relative) on ngspice/ltra-line-transient, xyce/nmos-level1-dc and
  corpus-e/mos1-inverter-sweep.

Unchanged: ngspice/mos6-*, classic/mos6-inverter-chain and xyce/pmos-level1-dc. corpus-d/colpitts-oscillator,
corpus-e/opamp-*, corpus-e/mos1-nand-transient and corpus-e/mos7-nand-no-bypass are still not compared,
because one of the two engines does not run them, for reasons unrelated to this issue.
