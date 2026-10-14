# ngspice bug #738: Simulation Inconsistencies Between NGspice and KiCad for the Same Circuit Diagram

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/738/ (status `open`, opened 2025-02-15)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachment Test.zip (KiCad netlist + vendor PSpice libraries).

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 738`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/738/` and verifies the hashes):

- `OP1177ARM_OPA818.local.cir` (1122 B, sha256 `ade3ace7fd9c3649d7f1f4fa2590748bc33fed2b7526679472af831a9d89d02d`)

Ticket attachments:

- [Test.zip](https://sourceforge.net/p/ngspice/bugs/738/attachment/Test.zip) (5713431 B, sha256 `4120901d60279e455fae7ea0080769f04bc73a0bc7453f25bfac4bdccbc41cd8`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

undetermined: vendor op-amp macromodels; developers point to LTPS compatibility mode as a requirement. (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Default mode: "Error in netlist line no. 3894" fatal. LTPS mode: "TRAN: Timestep too small; time = 1.30176e-05 ... trouble with xu12:dz-instance d.xu12.d1", aborted after 814 rows. |
| ngspice master | error | LTPS: "TRAN: Timestep too small; time = 7.54317e-05 ... node e.xu12.en#branch", aborted after 3325 rows; default mode fatal parse error. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | unsupported | #812 refresh d8ab9d33: provenance gap. Reconstructed unquoted relative-path variant has 1122 bytes but SHA256 cbe95d092897db7b081ba2b96d37114040a1f236b40b5153be240efe8f73cdfe != pinned ade3ace7fd9c3649d7f1f4fa2590748bc33fed2b7526679472af831a9d89d02d. Neither engine received a substitute; cannot assert a current T_ABS blocker. Historical evidence: `:NewMosfets` in DiodesInc_MOSFET.LIB is dropped since #843 with ngspice-47's warning ("Unusual leading characters like ':' ... check line ':NewMosfets' (line 3539 of DiodesInc_MOSFET.LIB)", the line ngspice-47 reports); the deck now stops at the next vendor-library construct: UnsupportedResistorParameterError Unsupported resistor parameters: 'T_ABS' (`.MODEL R_NOISE RES (T_ABS=0)` in the supplied opa818.lib; PSpice T_ABS, which ngspice-47 inpcompat.c translates: https://github.com/mfiumara/spice-ts/issues/846). [spice-ts at the #843 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #843: PSpice `VSWITCH` accepted since #825 (ngspice-47 inpcompat.c: VON/VOFF -> XSPICE pswitch, VT/VH -> SW); the deck now stops at the next vendor-library construct: ParseError Unsupported device card ':' (`:NewMosfets`, a MicroCap label line in the supplied DiodesInc_MOSFET.LIB that ngspice-47 drops with an "Unusual leading characters" warning; https://github.com/mfiumara/spice-ts/issues/843). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1a' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rdmod' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: yes. Check: LTPS run aborts with Timestep too small at t=1.3e-5 s.

Notes: Developer reply: "For OpAmps with PSPICE models the compatibility mode LTPS is a must".

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
