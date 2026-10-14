# ngspice bug #795: NGspice LTPS Mode Simulation Fails with Added Open Branches in Circuit Variant

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/795/ (status `open`, opened 2025-06-17)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)
- spice-ts issue: https://github.com/mfiumara/spice-ts/issues/917

## Decks

Origin: attachment project.7z.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 795`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/795/` and verifies the hashes):

- `base_37.local.cir` (1898 B, sha256 `d9310705e01c9ead00f033a7418e3c9cc5e5badc4699081fa0841f89031373a5`)
- `variant_37.local.cir` (2093 B, sha256 `fb1a6f8645a33268ab5a614a10b42d358b99f500d6d38b9add4c3cfd11d71562`)

Ticket attachments:

- [project.7z](https://sourceforge.net/p/ngspice/bugs/795/attachment/project.7z) (76325 B, sha256 `4f553ecaa57d330c9db7ad9c581988252858451aad0c59a589b3953693fae924`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The two netlists are electrically equivalent (series split of an element / extra element on an open or already-defined node), so a correct simulator must produce the same waveforms for both; converging on one and failing on the other is a numerical failure of the solver, not a property of the circuit. (variant adds open branches). (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | base_37: OP completes; variant_37: "Transient op failed, timestep too small ... trouble with xq190:dmos-instance m.xq190.m1" with nan node voltages, aborted. Same in LTPS mode. |
| ngspice master | error | base_37 completes; variant_37 "Transient op failed, timestep too small ... trouble with xq191:dlim-instance d.xq191.d1" with nan node voltages, aborted. Same in LTPS. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | error | #812 refresh d8ab9d33: both pinned variants now first fail with SingularMatrixError: zero pivot at matrix column 10 (nodes: Net-_D183-K_). Native ngspice base AC completes; variant fails. This is an execution loss on base, not numerical parity; metrics unavailable. Routed as additional vendor singular-matrix fixtures to existing https://github.com/mfiumara/spice-ts/issues/917 without claiming its root cause. Historical evidence: `:NewMosfets` in DiodesInc_MOSFET.LIB is dropped since #843 with ngspice-47's warning ("Unusual leading characters like ':' ... check line ':NewMosfets' (line 3539 of DiodesInc_MOSFET.LIB)", the line ngspice-47 reports); both decks now stop at the next construct: Error CCCS 'XU95.F1' references unknown or branchless source 'XU95.V4' (the AD620.mod subcircuit names V4 on F1 before the V4 card; spice-ts rejects a linear F/H naming a voltage source defined later, ngspice-47 does not: https://github.com/mfiumara/spice-ts/issues/860). [spice-ts at the #843 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #843: PSpice `VSWITCH` accepted since #825 (ngspice-47 inpcompat.c: VON/VOFF -> XSPICE pswitch, VT/VH -> SW); both decks now stop at the next vendor-library construct: ParseError Unsupported device card ':' (`:NewMosfets`, a MicroCap label line in the supplied DiodesInc_MOSFET.LIB that ngspice-47 drops with an "Unusual leading characters" warning; https://github.com/mfiumara/spice-ts/issues/843). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rmod11' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: yes. Check: variant_37 OP aborts while base_37 completes.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
