# BSIM3v3.3.0 DC core parity with ngspice-47 (#589)

This directory holds the evidence for [#589](https://github.com/mfiumara/spice-ts/issues/589). The BSIM3 (LEVEL=8/49, VERSION 3.3) DC drain current is now a line-by-line port of ngspice-47 `b3ld.c`. That covers Vth with SCE, narrow-width, DIBL and body effect, n, poly depletion, Vgsteff, Weff, Rds, Abulk, the three mobility models, Vdsat, Vdseff, VACLM, VADIBL, PVAG, VASCBE, Ids and the substrate current Isub, all with analytic derivatives. The port also includes the source/drain junction diode DC model, the `b3set.c` defaults, the `b3mpar.c` unit conversions and the `b3temp.c` size-dependent, binned and TNOM parameters. Junction limiting (DEVpnjlim) and gate/drain step limiting (DEVfetlim, DEVlimvds) follow `b3ld.c` too.

The capacitance model is **not** part of this change. It is still the bounded Meyer-style approximation in `bsim3v3-cap.ts`, not ngspice capMod charge. Only its inputs moved to the ngspice-sized values: Cox·WeffCV·LeffCV, `(CGSO+CF)·WeffCV` overlaps and AD/AS/PD/PS defaulting to 0.

## Files

| File | What |
| --- | --- |
| `cards.ts` | The 13 cases: model card, instance line, provenance and NMOS-convention bias grid. |
| `reference.ts` | Runs ngspice-47 on the identical decks and writes `ngspice-47-dc.json`. |
| `ngspice-47-dc.json` | Reference: 910 operating points (`@m1[id|gm|gds|gmbs|vth]`, `i(vd)`) and 13 Id-Vds sweeps (`i(vd)`). |
| `compare.ts` | Scores a spice-ts build against the reference (`--device` adds the b3ld.c outputs). |
| `before.json` / `after.json` | `compare.ts` receipts for main `3f26f107` and for this branch. |
| `sram-582-before.json` / `sram-582-after.json` | `benchmarks/bsim3-reverse/compare.ts` receipts (the #582 SRAM and the orientation checks) for the same two trees. |

Cases come from four sources. The #589 issue deck, the existing `bsim3-validation` cards and three stress cards are project-authored. The stress cards exercise mobMod 2 and 3, NGATE poly depletion, RDSW/PRWG/PRWB, A1/A2, PVAG, Isub (ALPHA0/BETA0), PSCBE, L/W/P binning with BINUNIT 1 and 2, TNOM != TEMP, GAMMA1-derived NCH/K1/K2, NCH > 1e20 and DELVTO. The BSIM3 cards from `examples/mos/nmos_out_BSIM330_plainwrite.sp`, `examples/Monte_Carlo/MC_ring.sp` and the all-defaults `examples/mos/adder_mos.cir` are read at run time from the corpus-f fixtures (provenance and licence: `benchmarks/corpus/corpus-f/SOURCES.md`). The fixtures are not modified.

## Reproduce

    pnpm install --frozen-lockfile
    pnpm -C packages/core build
    pnpm exec tsx benchmarks/bsim3-dc-589/reference.ts       # needs ngspice-47 on PATH; byte-identical rerun
    pnpm exec tsx benchmarks/bsim3-dc-589/compare.ts --device --output benchmarks/bsim3-dc-589/after.json
    pnpm -C packages/core exec vitest run src/devices/bsim3v3-ngspice-parity.test.ts

`before.json` was produced by copying `compare.ts` and `ngspice-47-dc.json` into a detached worktree of main `3f26f107` and running `compare.ts` (without `--device`, since the old evaluator has a different API) against that tree's build. `compare.ts` exits zero whenever it produced metrics; it does not gate on parity. The vitest file is the gate (1% of ngspice, as #589 requires).

Relative error is `|spice-ts - ngspice| / max(|ngspice|, 1e-12)`. Operating points re-run the same deck through `simulate` with the sources set to the bias. The sweep is the deck's own `.dc VD` (Vgs = type × 1.2 V, Vbs = 0).

## Results (ngspice-47, identical netlists)

Worst relative error per case. `[n/N]` counts points within 1%.

| Case | Before: op i(VD) | Before: sweep i(VD) | After: op i(VD) | After: sweep i(VD) | After: device Id / gm / gds / gmbs |
| --- | ---: | ---: | ---: | ---: | ---: |
| issue-589-nmos | 1.5e5 [0/70] | 3.1 [1/25] | 5.8e-15 [70/70] | 5.4e-8 [25/25] | 5.5e-15 / 4.6e-15 / 5.3e-15 / 5.0e-15 |
| issue-582-pmos | 1.1e5 [0/70] | 3.1 [1/25] | 6.7e-15 [70/70] | 1.1e-4 [25/25] | 5.5e-15 / 5.8e-15 / 5.8e-15 / 5.5e-15 |
| validation-nmos | 3.3e3 [0/70] | 2.3 [1/25] | 6.0e-15 [70/70] | 1.3e-6 [25/25] | 6.3e-15 / 5.9e-15 / 6.7e-15 / 3.6e-14 |
| defaults-nmos | 1.5e9 [0/70] | 8.9e8 [1/25] | 1.5e-14 [70/70] | 7.5e-15 [25/25] | 1.3e-14 / 1.3e-13 / 1.2e-14 / 3.9e-14 |
| defaults-pmos | 2.2e9 [0/70] | 2.2e9 [1/25] | 8.4e-15 [70/70] | 4.0e-5 [25/25] | 6.0e-15 / 8.8e-15 / 8.2e-15 / 9.0e-15 |
| defaults-nmos-no-wl | 1.1e8 [0/70] | 1.1e8 [1/25] | 3.1e-14 [70/70] | 9.2e-15 [25/25] | 9.3e-14 / 5.2e-14 / 1.8e-14 / 5.1e-14 |
| bsim330-nmos | 1.4e6 [0/70] | 2.6 [1/25] | 1.3e-14 [70/70] | 1.8e-7 [25/25] | 1.5e-14 / 9.8e-15 / 1.3e-14 / 2.9e-14 |
| bsim330-pmos | 1.8e6 [0/70] | 7.5 [1/25] | 4.6e-15 [70/70] | 7.2e-5 [25/25] | 2.6e-15 / 3.2e-15 / 2.4e-15 / 9.9e-14 |
| mc-ring-nmos | 1.0 [0/70] | 0.89 [1/25] | 6.5e-15 [70/70] | 1.6e-7 [25/25] | 5.6e-15 / 5.2e-15 / 5.8e-15 / 1.2e-14 |
| mc-ring-pmos | 1.0 [1/70] | 0.31 [1/25] | 4.8e-14 [70/70] | 1.3e-5 [25/25] | 5.0e-14 / 3.2e-14 / 3.3e-14 / 3.4e-14 |
| stress-nmos | 20 [0/70] | 24 [1/25] | 6.7e-15 [70/70] | 1.1e-7 [25/25] | 3.8e-15 / 3.4e-15 / 3.2e-15 / 3.5e-15 |
| stress-pmos | 5.4e6 [0/70] | 5.5 [1/25] | 3.2e-14 [70/70] | 1.4e-4 [25/25] | 2.6e-14 / 1.7e-14 / 2.5e-14 / 1.6e-14 |
| gamma1-nmos | 2.3e7 [0/70] | 62 [1/25] | 1.3e-14 [70/70] | 6.8e-9 [25/25] | 1.4e-14 / 1.4e-14 / 1.6e-14 / 1.2e-14 |

The very large "before" ratios are subthreshold and off-state points, where the old model's current was orders of magnitude off a picoampere-scale reference. Operating points match to rounding because the sources fix every terminal voltage. Every sweep point is within 1%. The largest sweep residual (1.05e-4, issue-582-pmos at VD = -1.7 V) is on the ngspice side. ngspice's own `.op` at that bias gives 5.057206e-5 A, which is spice-ts's sweep value, while its `.dc` point is 5.056674e-5 A. The other PMOS worst cases are also at the first step of the sweep.

The issue deck (`.dc VD 0 1.8 0.6`, Vgs = 1.8 V):

| Vds | ngspice-47 i(VD) | spice-ts before | spice-ts after |
| --- | ---: | ---: | ---: |
| 0.6 | -1.4486796e-4 | -5.026967e-4 | -1.448680e-4 |
| 1.2 | -1.7564795e-4 | -6.124866e-4 | -1.756479e-4 |
| 1.8 | -1.9270106e-4 | -6.922299e-4 | -1.927011e-4 |

## #582 SRAM and orientation checks (`benchmarks/bsim3-reverse/compare.ts`)

Absolute max / RMS error against ngspice-47: volts for the SRAM nodes, amperes for currents.

| Fixture / signal | Before (main 3f26f107) | After |
| --- | ---: | ---: |
| SRAM q | 0.645187 / 0.099217 | 0.352937 / 0.027573 |
| SRAM qb | 0.986685 / 0.171906 | 0.673988 / 0.065307 |
| NMOS forward / reverse i(VD) | 4.03e-4 | 2.7e-20 |
| PMOS forward / reverse i(VD) | 3.41e-4 | 1.1e-19 |
| PMOS off i(VD) | 1.8e-12 | 4.0e-28 |
| PMOS Id-Vgs i(VSD) | 6.71e-3 / 2.65e-3 | 3.99e-9 / 2.97e-10 |
| NMOS Id-Vds i(VDS) | 9.54e-3 / 7.30e-3 | 3.5e-18 / 1.0e-18 |

SRAM end state at 10 ns: q = 4.5807703e-9 V and qb = 1.799999987991 V in spice-ts, against 4.58077046e-9 V and 1.79999998799103 V in ngspice. The write edge still differs: max |dv| is 0.35 V on q and 0.67 V on qb. **That residual is a published loss.** It comes from the capacitance model, which is still the Meyer approximation rather than ngspice capMod 3 charge.

## corpus-f BSIM3 decks

None of the 11 corpus-f BSIM3 fixtures changes outcome with this PR. Each child run (`outcomes.ts --corpus-f-fixture-child <id>`) on this branch stops before the BSIM3 device matters:

- eight fail at parse on `.options noinit` or `.control set/let/save` (#494, #488);
- `tcl-testbench4` uses VERSION=3.2.2, which ngspice routes to BSIM3v32 and spice-ts rejects (#503);
- `nmos_pmos_BSIM482.sp` is BSIM4 (LEVEL=54);
- `examples/snapshot/adder_mos_circ.cir` reaches simulation and exceeds the 120 s execution bound (adder timeouts: #611/#604).

The before run of that last deck was not repeated on this loaded host. `AGGREGATE_PARITY.md` and the corpus-f `outcomes.json` are not touched here.

## Published losses / remaining scope

- Capacitances: there is no capMod 0-3 charge model and no NQS. They remain the Meyer approximation (SRAM residual above).
- Extrinsic resistance: RSH with NRD/NRS (internal drain/source nodes) and the ACM models (`acm>0`) are not implemented. A card with RSH > 0 is still simulated without the series resistors.
- Temperature: TEMP != 27 C is still rejected for BSIM3 at compile time. TNOM != 27 C is supported.
- Transient self-consistency: a 3-stage inverter chain with **no** junction areas, now the ngspice default, deviates 44.8 mV at default tolerances from its RELTOL=1e-6 run, against 10.9 mV with junction areas. `nonlinear-charge-history.test.ts` now states the junction areas it previously got from spice-ts's non-ngspice implicit defaults.
