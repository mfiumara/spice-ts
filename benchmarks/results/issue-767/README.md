# Issue #767: MEXTRAM `LEVEL=504` cards read as Gummel-Poon, like ngspice-47

ngspice-47 maps `LEVEL=504` to level 1 (INPfindLev, #747), so it simulates these Xyce MEXTRAM cards as its Gummel-Poon BJT. INPgetMod (inpgmod.c `create_model`) then looks up each name in the BJT model table (bjt.c `BJTmPTable`) and then in the instance table (`BJTpTable`). Any name found in neither, such as `DTA`, `VEF` or `TAUB`, prints `unrecognized parameter (dta) - ignored`. Names that are in the table keep their Gummel-Poon meaning: `IK` (= IKF), `PE`/`PC`/`PS` (= VJE/VJC/VJS), `TREF` (= TNOM), `IS`, `BF`, `RE`, `CJE`, `CJC`, `MC`, `XCJC`, `ISS`, `CJS`, `KF`, `AF`. ngspice-47 has no `DTA` at all. The only temperature offset its BJT has is the instance `DTEMP`.

Running the two corpus-g decks on identical bytes turned up two more ngspice-47 behaviours, both fixed in the same PR:

1. **AC substrate conductance.** bjtacld.c and bjtpzld.c do not stamp the substrate diode conductance `gdsub`, not even its CKTgmin. Only the substrate capacitance is stamped. spice-ts used to reuse the DC load stamp for AC, noise and PZ. On the forward-biased lateral PNP in `MEXTRAM/acFreq_Gbb_noFlip_P.cir` this added about 0.44 S to `i(v_s_b)`/`i(v_b_b)`.
2. **Noise gain floor.** noisean.c computes `GainSqInv = 1 / MAX(|gain|^2, N_MINGAIN)` with `N_MINGAIN = 1e-20`. In `VANOISE/commonEmitterBjt_mextram.cir` the transistor is off, and at 0.01 Hz the gain from V1 to OUT is 1.86e-12. ngspice-47 refers the output noise through 1e-10, and spice-ts used the raw gain.

With the substrate diode gone from the noise matrix, `.noise` also accepts BJT `TNOM`/`TREF` and the substrate parameters (`ISS NS CJS VJS MJS SUBS`). bjtnoise.c has no substrate source, and TNOM only moves the bjttemp.c parameters that the DC and AC solves already use.

## Decks (ngspice-47 references in the tests)

| deck | test |
|---|---|
| `decks/mextram-card-op.cir`: NPN with a trimmed MEXTRAM card, `.op` | `packages/core/src/parser/bjt-unrecognized-model-parameter-767.test.ts` |
| `decks/lateral-pnp-substrate-ac.cir`: forward-biased ISS on a lateral PNP, `.ac` | `packages/core/src/devices/bjt-substrate-ac-767.test.ts` |
| `decks/noise-min-gain.cir`: 1e-11 divider, `.noise` | `packages/core/src/analysis/noise-min-gain-767.test.ts` |
| `decks/bjt-noise-tnom-substrate.cir`: NPN with TNOM=25 and a 16 uA substrate diode, `.noise` | `packages/core/src/analysis/noise-bjt-tnom-substrate-767.test.ts` |

Each reference value was printed by `ngspice -b <deck>` (ngspice-47, Homebrew) from the deck's own `.control` block with `set numdgt=12`. spice-ts reads the same bytes.

## Corpus-g fixtures

Command: `pnpm exec tsx benchmarks/corpus/corpus-g/parity.ts --corpus-g-fixture-child <id>`, same runner, metric and threshold as the committed report.

| fixture | main (committed outcomes.json) | DTA ignore only | this PR |
|---|---|---|---|
| `MEXTRAM/acFreq_Gbb_noFlip_P.cir` | spice-ts-loss: `Unsupported bounded BJT model parameter: 'DTA'` | mismatch, worst 220 (`ac i(v_s_b)`, gdsub in AC) | **matched**, 16 signals, worst 1.11e-8 (`ac i(v_e_b)`) |
| `VANOISE/commonEmitterBjt_mextram.cir` | spice-ts-loss: `Unsupported bounded BJT model parameter: 'DTA'` | spice-ts-loss: `.noise does not support BJT model parameter 'TREF'` | **mismatch**, 4 signals, worst 0.285 (`noise v(inoise_total)`) |

The remaining VANOISE mismatch is a scoring artefact, and it is published as a loss. spice-ts `v(inoise_total)` = 163.774978055573 and ngspice-47 = 163.7749495863544, a relative error of 1.74e-7. Every spectrum point also agrees to 1.74e-7 relative. The runner normalises the integrated totals by the first `noise` plot (the spectrum), which has no `v(inoise_total)`. The ngspice peak is therefore read as 0, and the 2.85e-5 absolute error is divided by the 1e-4 voltage floor. Tracked in #774. It is not tuned here.

Receipts: `receipts/*.dta-only.json` (DTA ignore alone) and `receipts/*.after.json` (this PR).
