# ngspice bug #737: The simulation results are inconsistent under different compatibility modes.

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/737/ (status `open`, opened 2025-02-15)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachment Test.zip (KiCad netlist + vendor PSpice libraries).

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 737`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/737/` and verifies the hashes):

- `OPA890Test.local.cir` (864 B, sha256 `b58eda0bc033ac63358e66f275efeff0af13534ffe7cb3efbe391f13b1c15965`)

Ticket attachments:

- [Test.zip](https://sourceforge.net/p/ngspice/bugs/737/attachment/Test.zip) (5678370 B, sha256 `bebda546a64ba84973694f8cfaf7aa8086bfaf657f741323aead5f68254b273b`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

undetermined: a KiCad op-amp test bench built from vendor PSpice macromodels; no independent waveform. The developers state PSpice models require compatibility mode LTPS. (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Default mode: "Error on line 120 ... circuit not parsed" (PSpice syntax). LTPS mode: "TRAN: Timestep too small; time = 2.89999e-10 ... trouble with node a$poly$e.xu68.e_u1_e5#branch_1_0", aborted. |
| ngspice master | error | LTPS: "TRAN: Timestep too small; time = 2.47251e-10 ... node a$poly$e.xu68.e_u1_e5#branch_1_0", aborted; default mode still fails to parse. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | unsupported | PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it to an XSPICE aswitch in LTPS mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: UnsupportedModelTypeError: .model 'Rmod11' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: yes. Check: LTPS run aborts with Timestep too small at t=2.9e-10 s.

Notes: Reporter compares with KiCad, which embeds ngspice with its own options. Default-mode parse failure is documented (PSpice libraries need ps/ltps).

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
