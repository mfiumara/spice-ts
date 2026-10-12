# BSIM3v32 (LEVEL=8/49 VERSION=3.2.x) parity with ngspice-47 (#594)

ngspice-47 picks the BSIM3 implementation of a `LEVEL=8/49` card from the prefix of its `VERSION=` string (`src/spicelib/parser/inpdomod.c`): `3.0` → BSIM3v0, `3.1` → BSIM3v1, `3.2` → BSIM3v32, and `3.3`, `default` or no version → BSIM3 (3.3.0). Before #594, spice-ts implemented only 3.3.0 and rejected every 3.2.x card with `UNSUPPORTED_MODEL_VERSION`.

spice-ts now runs 3.2.x cards with the bsim3v32 revisions. `b3v32set.c` maps the string to an integer revision: exactly `3.2.4` or prefix `3.24` → 3.2.4, the same rule for 3.2.3 and 3.2.2, and any other `3.2…` string → 3.2. The bsim3v32 device has the same card names, defaults and equations as the 3.3.0 device apart from the revision-dependent blocks ported here:

| Source (ngspice-47) | Difference from 3.3.0 | spice-ts |
| --- | --- | --- |
| `b3v32set.c` | `LMLT` scales the instance L | `bsim3v3-params.ts` `computeBsim3Size` |
| `b3v32temp.c` | 3.2 leaves `IsEvjsm/IsEvjdm` unset | `computeBsim3Size` |
| `b3v32ld.c` junctions | 3.2 linearises above `vjsm` with slope `(Is + IJTH) / Nvtm` | `bsim3v3.ts` `junction` |
| `b3v32ld.c` Abulk | 3.2 rescales only `dAbulk_dVb` when `Abulk < 0.1` | `bsim3v3-dc.ts` |
| `b3v32ld.c` Vds = 0 | 3.2 keeps the smoothed Vdseff (DC) and VdseffCV (capMod 2/3) | `bsim3v3-dc.ts`, `bsim3v3-charge.ts` |
| `b3v32ld.c` capMod 3 | every 3.2.x: VdsatCV = (Vgsteff − ΔΦ)/AbulkCV, no `VgDP` smoothing, capMod-2 VdseffCV form; 3.2 also has its own dTcen/dVd,b | `bsim3v3-charge.ts` |
| `b3v32ld.c` capMod 1/2, 3.2 | `dVfb` terms, which are identically zero for `Vfb = vfbzb` | none needed |

What else changed with #594:

- **Circuit temperature.** BSIM3 devices of every revision now follow `.options TEMP` through the existing `b3temp.c`/`b3v32temp.c` port; before, they were rejected with `UNSUPPORTED_TEMPERATURE`. The corpus-f decks of #594 run at `TEMP=25`.
- **NQS selectors.** An effective `NQSMOD=1` (b3v32set.c resolution: an instance value of 0/1 wins, otherwise the card value, otherwise 0) is now rejected with `UNSUPPORTED_MODEL_PARAMETER`, and so is the 3.3.0 `ACNQSMOD=1`. Before, spice-ts silently simulated the quasi-static model. On the inverter chain below, `NQSMOD=1` moves ngspice's v(out) by 0.70 V of a 2.5 V swing ([#692](https://github.com/mfiumara/spice-ts/issues/692)).

Not ported, and documented:

- The `b3v32temp.c` `pParam` reuse of revisions 3.2 and 3.2.2 for repeated instance geometries. It is equal to spice-ts whenever geometries are distinct or the previously processed instance has the same geometry, which covers every deck here.
- **TCJ compounding.** In revisions 3.2 and 3.2.2, `b3v32temp.c` scales CJ/CJSW/CJSWG by `1 + TCJ·(T − TNOM)` in place, and ngspice reruns that update before every analysis. Within one ngspice session the junction capacitance therefore compounds from one analysis to the next (capbd 2.1006e-15 → 2.0597e-15 → 2.0196e-15 F for repeated `ac` at one bias). spice-ts applies the factor once, as ngspice does for a deck with a single analysis. `reference.ts` runs the affected cases in a fresh ngspice session per analysis.
- **RSH series resistance.** `RSH × NRD/NRS` is not modelled for any BSIM3 revision ([#691](https://github.com/mfiumara/spice-ts/issues/691)); ngspice defaults to NRD = NRS = 1 square. On the TSMC card that is a 9.7% current difference, so the parity decks set `NRD=0 NRS=0`.

## Files

| File | What |
| --- | --- |
| `cards.ts` | 16 DC and 27 charge cases. They cover the corpus-f TSMC 0.25u VERSION = 3.2.2 cards (tcl-testbench4 `Nmod`/`Pmod`, MNA0/MPA0 geometry) and the #589/#626 cards at VERSION 3.2, 3.2.2, 3.2.3, 3.2.4 and 3.24, including every revision branch. There are also `.options temp` variants for 3.2.x and 3.3.0, and the three-stage inverter-chain deck. |
| `reference.ts` | ngspice-47 batch runs. DC: `@m1[id gm gds gmbs vth]` and i(vd) at 84 biases plus an Id-Vds sweep. Charge: `@m1[cgg … capbs]` at 90 biases plus 24 AC terminal-capacitance matrices at 1 GHz. Transient: the inverter chain at TMAX = 2 ps. Output: `ngspice-47-bsim3v32.json`. `--only a,b` regenerates selected cases. |
| `compare.ts` | Scores a build through `simulate()` only, so it also runs on builds without this branch. |
| `before.json` / `after.json` | `compare.ts` receipts for main and this branch. |

## Reproduce

    pnpm install --frozen-lockfile && pnpm -C packages/core build
    spice-heavy pnpm exec tsx benchmarks/bsim3v32-594/reference.ts        # needs ngspice-47 on PATH
    pnpm exec tsx benchmarks/bsim3v32-594/compare.ts --output benchmarks/bsim3v32-594/after.json
    pnpm -C packages/core exec vitest run src/devices/bsim3v32-ngspice-parity.test.ts

## Results (ngspice-47, identical netlists, 1% threshold)

| Check | main e2c73b29 | this branch |
| --- | ---: | ---: |
| DC terminal i(VD), 1344 operating points (16 cases) within 1% | 0 (every deck rejected) | 1344 / 1344, worst 1.4e-08 |
| DC Id-Vds sweeps, 400 points | 0 | 400 / 400, worst 0.00031 |
| AC terminal capacitance entries, 5832 (27 cases) | 0 | 5832 / 5832, worst 0.00068 |
| b3v32ld.c Id/gm/gds/gmbs/Vth and charges/capacitances (device level, vitest) | n/a | 43 / 43 cases within 1% |
| TSMC 3.2.2 inverter chain, TMAX 2 ps: v(n1) / v(n2) / v(out) / windowed q(vdd), max err ÷ peak | rejected (`UNSUPPORTED_MODEL_VERSION`) | 9.7e-05 / 0.00012 / 0.00028 / 0.00028 (2031 points; ngspice 2032) |

`before.json` comes from `compare.ts --core <main e2c73b29 dist>`. Both receipts were taken on an Apple M5 Pro running Node 22.

Corpus-f (identical fixtures, ngspice side unchanged at success, tran:37049):

| Fixture | main | this branch |
| --- | --- | --- |
| examples/tclspice/tcl-testbench2/example.cir | unsupported: `LEVEL=8 VERSION=3.2.2` | unsupported: `NQSMOD` (BSIM3 NQS, #692) |
| examples/tclspice/tcl-testbench4/example.cir | unsupported: `LEVEL=8 VERSION=3.2.2` | unsupported: `NQSMOD` (BSIM3 NQS, #692) |

Published losses: both corpus-f decks of #594 are still spice-ts losses. Every one of their 96 transistors sets `NQSMOD=1`, which spice-ts does not implement (#692). Their TSMC cards also need the RSH series resistance (#691). With `NQSMOD=0` the decks compile and run, but that is not the identical deck, so no parity is claimed for it. The committed corpus-f `outcomes.json` is not regenerated here; the new `NQSMOD` gap bucket is added to `lib.ts` for the next corpus run.
