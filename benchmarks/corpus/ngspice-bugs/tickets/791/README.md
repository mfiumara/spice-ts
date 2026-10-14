# ngspice bug #791: AC simulation fails in standalone Ngspice but works in KiCad's internal simulator

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/791/ (status `open`, opened 2025-05-24)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachment variant_62.7z.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 791`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/791/` and verifies the hashes):

- `variant_62.local.cir` (1549 B, sha256 `c973882f1606dd1c3f4c1d837d30b16de11863713e729a58ded40232dd70d464`)

Ticket attachments:

- [variant_62.7z](https://sourceforge.net/p/ngspice/bugs/791/attachment/variant_62.7z) (101540 B, sha256 `d507b5a34fefe305351ec13e26642863c57113ca9363008cd4f20cb8de16c899`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

undetermined: vendor macromodels; the AC operating point may genuinely be hard. Reported to work in KiCad (which embeds ngspice with its own option set). (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | "Transient op failed, timestep too small"; "AC: Timestep too small; frequency = 0: trouble with xu188:dx-instance d.xu188.d7", aborted; same in LTPS mode. |
| ngspice master | error | "Transient op failed, timestep too small"; "AC: Timestep too small; frequency = 0: trouble with xu188:dx-instance d.xu188.d7", aborted. Same in LTPS. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | unsupported | #812 refresh d8ab9d33: provenance gap. Documented unquoted relative-path reconstruction has 1549 bytes but SHA256 62bbfadcd9be8eeb489ca26dda48594b6bd1168c13fd3244195e16374439af1e != pinned c973882f1606dd1c3f4c1d837d30b16de11863713e729a58ded40232dd70d464. Neither engine received a substitute. Cannot assert that historical forward F/H reference remains the first error. Historical evidence: `:NewMosfets` in DiodesInc_MOSFET.LIB is dropped since #843 with ngspice-47's warning ("Unusual leading characters like ':' ... check line ':NewMosfets' (line 3539 of DiodesInc_MOSFET.LIB)", the line ngspice-47 reports); the deck now stops at the next construct: Error CCCS 'XU188.F1' references unknown or branchless source 'XU188.V4' (the AD620.mod subcircuit names V4 on F1 before the V4 card; spice-ts rejects a linear F/H naming a voltage source defined later, ngspice-47 does not: https://github.com/mfiumara/spice-ts/issues/860). [spice-ts at the #843 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #843: PSpice `VSWITCH` accepted since #825 (ngspice-47 inpcompat.c: VON/VOFF -> XSPICE pswitch, VT/VH -> SW); the deck now stops at the next vendor-library construct: ParseError Unsupported device card ':' (`:NewMosfets`, a MicroCap label line in the supplied DiodesInc_MOSFET.LIB that ngspice-47 drops with an "Unusual leading characters" warning; https://github.com/mfiumara/spice-ts/issues/843). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1a' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rdmod' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: yes. Check: AC operating point aborts with Timestep too small.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
