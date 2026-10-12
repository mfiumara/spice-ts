# ngspice bug #782: Timeout in LTPS Mode with Test Netlist, Works Fine in Non-Compatible Mode

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/782/ (status `open`, opened 2025-04-24)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment Test.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 782`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/782/` and verifies the hashes):

- `Test.local.cir` (968 B, sha256 `3db2c4d9193f96e436f540682f5bab148a9f3d083140cfe30fce7cdb422a55ae`)

Ticket attachments:

- [Test.zip](https://sourceforge.net/p/ngspice/bugs/782/attachment/Test.zip) (37847 B, sha256 `f0f1751d02809ef90f7749652ec5986b5f5f3aeef05316f3e47f4f186caad65f`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The run should complete in either mode (reported LTPS-only timeout). (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Completes in default and LTPS mode, 51 rows each, well under the 120 s bound. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | UnsupportedModelTypeError: .model 'Rdmod' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: no. Check: n/a

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
