# ngspice bug #764: Simulation Timeout in Ngspice After Splitting Inductor into Two Series Components

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/764/ (status `open`, opened 2025-03-21)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachments Originalnetlist.cir, InductorSplit.cir + vendor libraries.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 764`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/764/` and verifies the hashes):

- `Originalnetlist.local.cir` (1239 B, sha256 `9ffac81021772f9049551269bae3f57fed3f594fed26569a77fbc7343f8275b8`)
- `InductorSplit.local.cir` (1267 B, sha256 `82dd70784683fcfeafe0ec661a85f6bc9b17658fe86d3d84a41069c8c1a4ee9e`)

Ticket attachments:

- [DiodesInc_FET.lib](https://sourceforge.net/p/ngspice/bugs/764/attachment/DiodesInc_FET.lib) (157834 B, sha256 `956632bc5a1ed7ee02659e697171e34e8db51019468b28123788f7f5a8669cb0`)
- [InductorSplit.cir](https://sourceforge.net/p/ngspice/bugs/764/attachment/InductorSplit.cir) (1459 B, sha256 `c716605964d14590a9994b9c1883e2d5585c2d5fa1f14fd9dce5887bf9be5b83`)
- [Originalnetlist.cir](https://sourceforge.net/p/ngspice/bugs/764/attachment/Originalnetlist.cir) (1432 B, sha256 `2ebe57b867f41fd71d84a0759ee29f1d378524532304984ce681139ba512511c`)
- [PN2222.mod](https://sourceforge.net/p/ngspice/bugs/764/attachment/PN2222.mod) (403 B, sha256 `fade93cf84dcd8ef9e539bc6a5f9ffcf40e6e1cf3383a32811aa8080a711af05`)
- [diode.lib](https://sourceforge.net/p/ngspice/bugs/764/attachment/diode.lib) (52757 B, sha256 `4f07396942f9fa67d623899d6904636fa4a5be596d413ed863bc6e2b63a2e01d`)
- [diode1.lib](https://sourceforge.net/p/ngspice/bugs/764/attachment/diode1.lib) (52757 B, sha256 `4f07396942f9fa67d623899d6904636fa4a5be596d413ed863bc6e2b63a2e01d`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The two netlists are electrically equivalent (series split of an element / extra element on an open or already-defined node), so a correct simulator must produce the same waveforms for both; converging on one and failing on the other is a numerical failure of the solver, not a property of the circuit. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | hang | Both variants exceed the 120 s bound (exit 142) in default and LTPS mode; the ticket reports only the split variant timing out on ngspice-43. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | PSpice `VSWITCH` accepted since #825 (ngspice-47 inpcompat.c: VON/VOFF -> XSPICE pswitch, VT/VH -> SW); both decks now stop at the supplied PN2222.mod: Error: Invalid bounded BJT model parameter value: expected VAR, IKR, NC, NKF > 0 and ISC >= 0 (`Ikr=0`, which ngspice-47 bjttemp.c treats as infinite; https://github.com/mfiumara/spice-ts/issues/844). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rmod11' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: partially. Check: Both decks run past 120 s.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
