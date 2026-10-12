# ngspice bug #785: NGSpice fails in non-compatible mode due to an undefined parameter [temp], but ignores it in LTPS mode, resulting in inconsistent simulation behavior. Singular matrix diagnostic information is also insufficient.

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/785/ (status `open`, opened 2025-05-07)
- Category: parser
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment TEMP.7z.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 785`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/785/` and verifies the hashes):

- `base_183.local.cir` (1151 B, sha256 `3e79bf9b2d5c2814073ce7fc94e5038ae47b59886ba0df7adc3739797a2cfa4d`)
- `variant_183.local.cir` (1360 B, sha256 `e291a486496a95983aed5b84193cbc68081d2dcb1ba64a86ade18dcd41bc330c`)

Ticket attachments:

- [TEMP.7z](https://sourceforge.net/p/ngspice/bugs/785/attachment/TEMP.7z) (47659 B, sha256 `5942012ca5812b357307d936f5ecbdf5b41128315808cecd2d9cabb90df8b018`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

Documented semantics: PSpice `temp` in expressions is only defined in ps/ltps compatibility mode, so native mode rejecting it is expected; both base and variant should run in LTPS. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Default: "Error in netlist line no. 1009" (undefined temp, documented). LTPS: base and variant both complete (1 row each). |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | UnsupportedModelTypeError: .model 'Rideal' has unsupported type 'RES' (vendor PSpice library) |

Reproduces on ngspice-47: no. Check: n/a

Notes: Second half of the ticket (singular-matrix diagnostics too terse) is a usability request.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
