# ngspice bug #761: Simulation Inconsistency  in Switch-Controlled Circuit when Pull-down Resistor

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/761/ (status `open`, opened 2025-03-21)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachments original.cir, NetlistAddResistor.cir + diode.lib (MicroCap library).

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 761`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/761/` and verifies the hashes):

- `original.local.cir` (1141 B, sha256 `1a46f7faecd00bf86499b873f713960f8d0b5b8645989d7e81a3d177ce7b7634`)
- `NetlistAddResistor.local.cir` (1161 B, sha256 `41e6e03687260961d7cbbefddaea6471f5ea4d43e532da4013cda363aaa5476b`)

Ticket attachments:

- [NetlistAddResistor.cir](https://sourceforge.net/p/ngspice/bugs/761/attachment/NetlistAddResistor.cir) (1308 B, sha256 `89aed9d728d449db62dc67a04d18a0749829574ce258e761ba92f7de68fccb51`)
- [SnapLED150.mod](https://sourceforge.net/p/ngspice/bugs/761/attachment/SnapLED150.mod) (187 B, sha256 `8994db53b11beabf4ab7ba676366c708d9ca0fe09303e63195e3c710d75967f4`)
- [diode.lib](https://sourceforge.net/p/ngspice/bugs/761/attachment/diode.lib) (52757 B, sha256 `4f07396942f9fa67d623899d6904636fa4a5be596d413ed863bc6e2b63a2e01d`)
- [diode1.lib](https://sourceforge.net/p/ngspice/bugs/761/attachment/diode1.lib) (52757 B, sha256 `4f07396942f9fa67d623899d6904636fa4a5be596d413ed863bc6e2b63a2e01d`)
- [original.cir](https://sourceforge.net/p/ngspice/bugs/761/attachment/original.cir) (1289 B, sha256 `ef21819d671c1ea64d68b767d3de946e25c14f91ce64d3917281c931df743004`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

Adding a resistor from an open switch terminal to a defined node does not change any other node voltage while the switch is open, so both netlists must simulate; the original aborting at t=1e-20 s is a solver failure (the open node is only held by the switch ROFF). (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | original: "Timestep too small; time = 1e-20 ... trouble with node net-_r9-pad2_", aborted after 2 rows; NetlistAddResistor: completes, 108 rows. Same in LTPS mode. |
| ngspice master | error | original: "Timestep too small; time = 2.00001e-11 ... node net-_d5-k_", aborted after 4 rows; NetlistAddResistor completes (108 rows). Same in LTPS. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | unsupported | Error: Unsupported bounded diode breakdown-temperature model parameter: 'TRS1' (the SnapLED150.mod diode has RS with TRS1/TRS2 and TNOM=25; https://github.com/mfiumara/spice-ts/issues/829). .options rshunt is accepted since #824. [spice-ts with .options rshunt (#824), simulate() on the same *.local.cir bytes with a filesystem include resolver] |

Reproduces on ngspice-47: yes. Check: original aborts at t=1e-20 s; NetlistAddResistor completes.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
