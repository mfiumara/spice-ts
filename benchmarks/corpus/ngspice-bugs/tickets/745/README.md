# ngspice bug #745: After adding nodes, the simulation runs successfully

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/745/ (status `open`, opened 2025-02-24)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts correct
- spice-ts issue: https://github.com/mfiumara/spice-ts/issues/854

## Decks

Origin: attachments mycircuit.cir, mycircuitSplit.cir + vendor libraries (DiodesInc_FET.lib, IGBT.LIB).

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 745`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/745/` and verifies the hashes):

- `mycircuit.local.cir` (532 B, sha256 `a95c97c699268f546694aa59a241a035969c8362d75d69daff0bf0ad0ce8fa7a`)
- `mycircuitSplit.local.cir` (558 B, sha256 `1fd5c199939df673ebf195e7f78b5af02daaaaab10849a5214724acfef879316`)

Ticket attachments:

- [DiodesInc_FET.lib](https://sourceforge.net/p/ngspice/bugs/745/attachment/DiodesInc_FET.lib) (157834 B, sha256 `956632bc5a1ed7ee02659e697171e34e8db51019468b28123788f7f5a8669cb0`)
- [IGBT.LIB](https://sourceforge.net/p/ngspice/bugs/745/attachment/IGBT.LIB) (98494 B, sha256 `8636692f62226b9fb23bdc6b157617b748c19bb698547987b04f1bcd70d3c336`)
- [SnapLED150.mod](https://sourceforge.net/p/ngspice/bugs/745/attachment/SnapLED150.mod) (187 B, sha256 `8994db53b11beabf4ab7ba676366c708d9ca0fe09303e63195e3c710d75967f4`)
- [mycircuit.cir](https://sourceforge.net/p/ngspice/bugs/745/attachment/mycircuit.cir) (706 B, sha256 `7096d53f45922f5c8c7eb94865280a4b3bfba75369c7b1d72af75da235670e8d`)
- [mycircuitSplit.cir](https://sourceforge.net/p/ngspice/bugs/745/attachment/mycircuitSplit.cir) (731 B, sha256 `7239ab254903b5bb9fa3e8e6560feab66a24293f7d2875dba9033092e04014b1`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The two netlists are electrically equivalent (series split of an element / extra element on an open or already-defined node), so a correct simulator must produce the same waveforms for both; converging on one and failing on the other is a numerical failure of the solver, not a property of the circuit. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | mycircuit: "Timestep too small; time = 1.1957e-10 ... trouble with node net-_q2-e_", aborted after 114 rows; mycircuitSplit (R2 split in two): completes, 1008 rows. Same in LTPS mode. |
| ngspice master | error | mycircuit: "Timestep too small; time = 3.58009e-11 ... node net-_c1-pad2_", aborted after 51 rows; mycircuitSplit completes (1008 rows). Same in LTPS. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | right | #812 refresh d8ab9d33: both pinned variants complete 1008 points; only native ngspice split reference is complete. On split i(V1), 1007 matched points, absolute max/RMS 1.9638769077823657e-10/1.1047659210213413e-11 A, relative max/RMS 0.0018884589466843108/0.00010625792555519479. One endpoint excluded. Original reference aborts; no metric for that waveform. No claimed win inferred from aborted data. Historical evidence: Both decks complete to 100 ns (1008 points each), unlike ngspice-47's mycircuit abort, and since https://github.com/mfiumara/spice-ts/issues/854 (a .model inside a .subckt is scoped to the subcircuit instance, like ngspice-47 subckt.c modtranslate) spice-ts uses the subcircuit-local DSUB, DCGD, SW and PMOS models that IGBT.LIB (APT100G2) and DiodesInc_FET.lib (DMG4435SSS) both define. Against ngspice-47's complete mycircuitSplit run (1008 rows) the spice-ts i(V1) differs by a median 3.22e-12 A and at most 1.83e-10 A (0.18% of max \|i(V1)\| = 1.04e-7 A); t=0 i(V1): mycircuitSplit -1.039088e-7 A vs ngspice-47 -1.039089e-7 A, mycircuit -8.354497e-8 A vs ngspice-47's -8.354474e-8 A before its abort. The two variants are not identical with .options rshunt=1G: the extra node NewPin79 (-26 V) gets its own 1 GOhm shunt, so i(V1) differs by about 20.4 nA between them in both simulators. [spice-ts #854 branch on main 03a9e4eb, simulate() on the same *.local.cir bytes with a filesystem include resolver, i(V1) interpolated onto ngspice-47's time points] Before #854 (global last-wins .model): median 1.75e-9 A, max 2.16e-9 A (2.1%), t=0 mycircuitSplit -1.056456e-7 A, mycircuit -8.456459e-8 A. Before #829: both decks stopped at Error: Unsupported bounded diode breakdown-temperature model parameter: 'TRS1' (SnapLED150.mod). Before #825: UnsupportedModelTypeError .model 'SMOD1' has unsupported type 'VSWITCH' (https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rmod11' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: yes. Check: mycircuit aborts (Timestep too small) while the equivalent mycircuitSplit completes.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
