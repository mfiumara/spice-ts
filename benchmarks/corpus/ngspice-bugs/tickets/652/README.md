# ngspice bug #652: The command line of Ngspice did not simulate correctly

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/652/ (status `open`, opened 2023-12-25)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachments 5.cir and reproduce materials.zip.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 652`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/652/` and verifies the hashes):

- `5.cir` (387 B, sha256 `d1f96864682ffb847f4f9fa1385116c29c00b1c5e8ae923d11b6e33b8e8d8cdb`)
- `reproduce materials/nelistAndResults/107.cir` (633 B, sha256 `fc0623946566034e596ac68aa9cfd388bc0017d15d8b3c4695f10aa205b50a24`)

Ticket attachments:

- [5.cir](https://sourceforge.net/p/ngspice/bugs/652/attachment/5.cir) (387 B, sha256 `d1f96864682ffb847f4f9fa1385116c29c00b1c5e8ae923d11b6e33b8e8d8cdb`)
- [5.kicad_sch](https://sourceforge.net/p/ngspice/bugs/652/attachment/5.kicad_sch) (26223 B, sha256 `0f5fed2f823fb37a97dba01e8ba4ed9cb3c9786009c02472af4c13975427adfc`)
- [kicad simulation results.png](https://sourceforge.net/p/ngspice/bugs/652/attachment/kicad%20simulation%20results.png) (13672 B, sha256 `f4c4d104aa2ed625b9035d02f5318db31eeba733a56555de4b24d1571faacb3d`)
- [ngspice simulation results.png](https://sourceforge.net/p/ngspice/bugs/652/attachment/ngspice%20simulation%20results.png) (36789 B, sha256 `b9e6ebf2003fc2327c75489c7cfc3e5089abcbd121e6cf24a8ed84093e093932`)
- [results.rar](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/bdf2edd9ca/fa80/84fa/attachment/results.rar) (2329 B, sha256 `6cbcda636c0d5ed1c74a66df39ca52a4026ccb4ab933d2dcdb1482892ac42a25`)
- [reproduce materials.zip](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/bdf2edd9ca/edcd/df45/attachment/reproduce%20materials.zip) (432828 B, sha256 `c6fcce8fc9ce00a506daa56928959205550e7b84e301be67dab5d85cc254708c`)

Edits relative to the ticket: none; original Windows include names preserved, included files mirrored into D:/ relative folders under the deck directory.

## Expected answer

The first deck has no node 0, so adding a common-mode offset to all voltages preserves every branch equation and the MNA matrix is singular: no unique absolute-node solution exists. The later 107.cir includes ground and rshunt and should have a defined solution, but its full vendor-model numerical waveform is undetermined analytically. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | 5.cir singular matrix/initial-timepoint failure. 107.cir completes 437 rows, exit=0. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | 5.cir _SingularMatrixError; 107.cir with resolver: UnsupportedModelTypeError .model 'Rmod11' unsupported type 'RES'. |

Reproduces on ngspice-47: no. Check: 5.cir correctly fails singular; grounded 107.cir completes 437 transient rows.

Notes: No proof of simulator defect from original invalid topology; later supplied standalone deck runs on ngspice-47. spice-ts correctly rejects first singular deck but cannot parse RES vendor models in later deck.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
