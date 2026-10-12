# ngspice bug #808: undefined parameter e table expression error

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/808/ (status `open`, opened 2025-09-16)
- Category: parser
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (192 B, sha256 `f0b91d8f18b35d2ef917b31b6be623647ed73a52fbe3946fab6275498c82bfdc`)

Ticket attachments:

- [alternate](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f8398f9a47/0a3f/attachment/alternate) (7629 B, sha256 `bc29daedd3fe4b34a81e3e5eaa1be55d16131bda2f74b78eae2ec710ee7c70bf`)
- [alternate](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f8398f9a47/e414/9326/attachment/alternate) (7629 B, sha256 `bc29daedd3fe4b34a81e3e5eaa1be55d16131bda2f74b78eae2ec710ee7c70bf`)
- [alternate](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f8398f9a47/db58/a817/attachment/alternate) (7629 B, sha256 `bc29daedd3fe4b34a81e3e5eaa1be55d16131bda2f74b78eae2ec710ee7c70bf`)
- [alternate](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f8398f9a47/9a4e/8d6b/attachment/alternate) (7629 B, sha256 `bc29daedd3fe4b34a81e3e5eaa1be55d16131bda2f74b78eae2ec710ee7c70bf`)

Edits relative to the ticket: none

## Expected answer

The supplied E card combines four terminal nodes with the two-output-node TABLE {expression} grammar. This mixed syntax is invalid; proper rejection is expected, not the claimed waveform. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | MIF-ERROR - model: xfer_e1 - Bad real value; exit=1. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | right | ParseError Unknown function 'V' on the malformed E1 card; rejection is appropriate though diagnostic is indirect. |

Reproduces on ngspice-47: no. Check: Original E1 /20 0 /10 0 TABLE {V(/10,0)} should be rejected as mixed TABLE syntax.

Notes: Maintainer explains supported PSpice syntax has only output nodes; LT four-node TABLE uses no expression and no braces. ngspice-47 error differs from historical error, but input is still malformed; no deck fixes made.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
