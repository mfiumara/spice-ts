# ngspice bug #685: Simulation Issue with DI_DMG6968UDM

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/685/ (status `open`, opened 2024-08-01)
- Category: device-model
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachment TestVT.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 685`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/685/` and verifies the hashes):

- `TestVT/TestDI_DMG6968UDM.cir` (732 B, sha256 `c553a7cc3d59a4de1d61c823466f2d9856d746c7764884805931a854a8ab271b`)

Ticket attachments:

- [TestVT.zip](https://sourceforge.net/p/ngspice/bugs/685/attachment/TestVT.zip) (45266 B, sha256 `f0cb4602c71de5574f50782e599cb85e2fac8bb57f735e9dfbe0e0930c0a0372`)

Edits relative to the ticket: none; preserved Windows include cards and mirrored supplied libraries at matching D:/ relative paths.

## Expected answer

undetermined: supplied interconnected nonlinear vendor model library does not admit a simple independently derived waveform; reproducing timestep failure proves run failure, not its physical root cause. (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Timestep too small at 2.25e-12s, timestep=1.25e-22, node net-_v1-e1_; 4 rows; native and ps. |
| ngspice master | error | Same failure as 47: "Timestep too small" at t=2e-12 s (47: 2.25e-12 s). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | PSpice `RES` model type accepted since #823; every deck now stops at the next vendor-library construct: UnsupportedModelTypeError .model 'SMOD1a' has unsupported type 'VSWITCH' (PSpice switch model, ngspice translates it to an XSPICE aswitch in LTPS mode; tracked in https://github.com/mfiumara/spice-ts/issues/825). Before #823: With filesystem resolver: UnsupportedModelTypeError .model 'Rdmod' has unsupported type 'RES'. |

Reproduces on ngspice-47: yes. Check: Transient aborts after only 4 rows, far short of the requested 100ns.

Notes: Native and PSpice modes both fail in ngspice-47. Model libraries are third-party and fetch-only; no parameter or topology changes. Ticket says upgrade to 43 worked, but failure reappears in the tested 47/native and ps setup.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
