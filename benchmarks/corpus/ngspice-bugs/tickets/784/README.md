# ngspice bug #784: Simulation Inconsistency in NGspice LTPS Mode: Adding a Parallel Branch on Static Pins Causes Singular Matrix Error and Simulation Failure

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/784/ (status `open`, opened 2025-05-06)
- Category: parser
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment question.7z.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 784`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/784/` and verifies the hashes):

- `base_159.local.cir` (1441 B, sha256 `013069a69193d22e0fb785b130f12647b6d56f0e7fa89c60ba2219a9889e07f8`)
- `variant_159.local.cir` (1635 B, sha256 `ac47da38b01a4183eed0b0fa0e6559fceacd1c99c9c50a9469bfe642f49a8b64`)

Ticket attachments:

- [question.7z](https://sourceforge.net/p/ngspice/bugs/784/attachment/question.7z) (22009 B, sha256 `08bc98ee42e423a77fd8260505e0f04ee81f427643cc5e63fb1a9d1d73a99e37`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The two netlists are electrically equivalent (series split of an element / extra element on an open or already-defined node), so a correct simulator must produce the same waveforms for both; converging on one and failing on the other is a numerical failure of the solver, not a property of the circuit. (variant adds a parallel branch on static pins). (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | LTPS mode: base and variant both complete, 141 rows each. Default mode: both fail "no such function 'if'" (PSpice function, documented to need compat mode). |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | UnsupportedModelTypeError: .model 'BB_SW' has unsupported type 'VSWITCH' (vendor PSpice library) |

Reproduces on ngspice-47: no. Check: n/a

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
