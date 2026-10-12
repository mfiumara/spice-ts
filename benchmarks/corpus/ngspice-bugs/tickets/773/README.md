# ngspice bug #773:  Compatibility Issue with temp Parameter Parsing in NGspice LT Mode

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/773/ (status `open`, opened 2025-04-11)
- Category: parser
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment TEST.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 773`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/773/` and verifies the hashes):

- `TEST.local.cir` (775 B, sha256 `7fcf1894544236e385037f4bdc6f82beff2c908f5461b0097bca9e005f51ed17`)

Ticket attachments:

- [TEST.zip](https://sourceforge.net/p/ngspice/bugs/773/attachment/TEST.zip) (58198 B, sha256 `41116180c0ccdcf3227f914216b8ee81d0b1045f28617d8bcec5f9742df59c92`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

Documented semantics: PSpice-syntax models (TEMP in expressions) need ps/ltps compatibility mode; LT mode alone is not expected to parse them. Whether the LTPS transient should converge is undetermined (vendor macromodels). (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Default mode: "Error in netlist line no. 408" (PSpice syntax, documented). LTPS mode: singular-matrix warnings on node net-_c121-pad2_ (floating capacitor node), no defect beyond the documented mode requirement. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | UnsupportedModelTypeError: .model 'R_NOISELESS' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: no. Check: n/a

Notes: #773 and #779 carry the same attachment.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
