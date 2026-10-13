# ngspice bug #685: Simulation Issue with DI_DMG6968UDM

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/685/ (status `open`, opened 2024-08-01)
- Category: device-model
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: attachment TestVT.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 685`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/685/` and verifies the hashes):

- `TestVT/TestDI_DMG6968UDM.cir` (732 B, sha256 `c553a7cc3d59a4de1d61c823466f2d9856d746c7764884805931a854a8ab271b`)

Ticket attachments:

- [TestVT.zip](https://sourceforge.net/p/ngspice/bugs/685/attachment/TestVT.zip) (45266 B, sha256 `f0cb4602c71de5574f50782e599cb85e2fac8bb57f735e9dfbe0e0930c0a0372`)

Edits relative to the ticket: none; preserved Windows include cards and mirrored supplied libraries at matching D:/ relative paths.

## Expected answer

The only source is V1 (DC 18 V) and the deck has no initial conditions, so the transient starts at the DC operating point, which is an equilibrium: a correct simulator must complete the 100 ns run and hold that operating point (ngspice-47 operating point: i(V1) = -1.35033248753e-8 A, v(Net-_V1-E1_) = 13.50332487533 V; .options rshunt=1G ties the floating source to ground). This mirrors #740. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Timestep too small at 2.25e-12s, timestep=1.25e-22, node net-_v1-e1_; 4 rows; native and ps. |
| ngspice master | error | Same failure as 47: "Timestep too small" at t=2e-12 s (47: 2.25e-12 s). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | `:NewMosfets` in DiodesInc_MOSFET.LIB is dropped since #843 with ngspice-47's warning ("Unusual leading characters like ':' ... check line ':NewMosfets' (line 3539 of DiodesInc_MOSFET.LIB)", the line ngspice-47 reports); the deck then runs: 1008 rows to 100 ns. The t=0 operating point agrees with ngspice-47's to 2.1e-6 relative (i(V1) = -1.3503353e-8 vs -1.3503325e-8 A, v(Net-_V1-E1_) = 13.503353 vs 13.503325 V: a 28 uV difference, inside the 1e-3 reltol Newton tolerance, looser than the 3e-8 of #740), v(Net-_D2-K_) = 1.795332e-4 V as in ngspice's initial transient solution, and i(V1) holds it: within 0.034% over the run (largest at 16 ps, while the steps are ps-sized) and 0.026% after 1 ns; both V1 terminals stay within 9e-9 V of t=0. [spice-ts at the #843 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #843: PSpice `VSWITCH` accepted since #825 (ngspice-47 inpcompat.c: VON/VOFF -> XSPICE pswitch, VT/VH -> SW); the deck now stops at the next vendor-library construct: ParseError Unsupported device card ':' (`:NewMosfets`, a MicroCap label line in the supplied DiodesInc_MOSFET.LIB that ngspice-47 drops with an "Unusual leading characters" warning; https://github.com/mfiumara/spice-ts/issues/843). [spice-ts at the #825 branch, simulate() with a filesystem include resolver mapping the D:/spice_lib paths to the attached libraries] Before #825: PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1a' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it in PSpice compatibility mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: With filesystem resolver: UnsupportedModelTypeError .model 'Rdmod' has unsupported type 'RES'. |

Reproduces on ngspice-47: yes. Check: Transient aborts after only 4 rows, far short of the requested 100ns.

Notes: Native and PSpice modes both fail in ngspice-47. Model libraries are third-party and fetch-only; no parameter or topology changes. Ticket says upgrade to 43 worked, but failure reappears in the tested 47/native and ps setup. Re-based from undetermined to first-principles at #843, when spice-ts first ran the deck: with only a DC source and no initial conditions the waveform is the operating point, whatever the vendor models are.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
