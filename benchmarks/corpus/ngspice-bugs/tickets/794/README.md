# ngspice bug #794: Simulation Failure with Netlist Exported from KiCad

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/794/ (status `open`, opened 2025-06-10)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachment 06101.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 794`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/794/` and verifies the hashes):

- `NGspice/06101.local.cir` (1371 B, sha256 `5fcebb2af191add8dae40125f927d24e2d05fbbd36a0a54a08c39e9a87fc210a`)
- `KiCad/06101/06101.local.cir` (1441 B, sha256 `688b77c210b7cb33aa5bad84bb8ecd4f8f8013cb08e5b83f1221feb034243357`)

Ticket attachments:

- [06101.zip](https://sourceforge.net/p/ngspice/bugs/794/attachment/06101.zip) (410449 B, sha256 `a58daf8f6e885a8574c292f18382fde0d0949bb9de88f69e123fad80ecd380ff`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

undetermined: vendor macromodels; reported to work in KiCad (embedded ngspice with its own options). (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | "Transient op failed, timestep too small"; "AC: Timestep too small; frequency = 0: trouble with xq1:dmos-instance m.xq1.m1", aborted; same in LTPS mode. |
| ngspice master | error | "Transient op failed, timestep too small"; "AC: Timestep too small; frequency = 0: trouble with xq1:dmos-instance m.xq1.m1", aborted. Same in LTPS. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | unsupported | PSpice `VSWITCH` accepted since #825 (ngspice-47 inpcompat.c: VON/VOFF -> XSPICE pswitch, VT/VH -> SW); both decks now stop at the next vendor-library construct: ParseError Unsupported device card ':' (`:NewMosfets`, a MicroCap label line in the supplied DiodesInc_MOSFET.LIB that ngspice-47 drops with an "Unusual leading characters" warning; https://github.com/mfiumara/spice-ts/issues/843). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1a' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rdmod' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: yes. Check: AC operating point aborts with Timestep too small.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
