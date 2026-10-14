# ngspice bug #398: Incorrect processing of end-line comments

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/398/ (status `open`, opened 2019-04-12)
- Category: parser
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (277 B, sha256 `55ff9242f460e0b2967fc9a45c4a9057fdfe1988227d1e6d17746e2858065000`)
- [`original_cards.cir`](original_cards.cir) (262 B, sha256 `90ece1a650bf263896f8ea0307bd674c8038d08877b0f00912b737419e10089f`)

Edits relative to the ticket: Card variant replaces .control tran with .tran/.print tran all.

## Expected answer

A backslash inside an end-of-line comment is comment text, not continuation syntax; a full-line asterisk comment must remain ignored. Otherwise .model becomes part of the instance card rather than a model declaration. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | MIF-ERROR - unable to find definition of model *****; output shows comment line merged into a_pd card. |
| ngspice master | wrong | Identical to 47: "MIF-ERROR - unable to find definition of model *****". [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | #812 refresh d8ab9d33, pinned original_cards.cir: UnsupportedCodeModelError line 6: XSPICE code model d_pulldown (.model PD) is not supported. Native ngspice-47 completes this dot-card variant; original comment-continuation defect is historical. No spice-ts waveform/metrics. Existing feature bucket #812. |

Reproduces on ngspice-47: yes. Check: Look for a_pd zero pd .model ... ***** and MIF-ERROR unable to find definition of model *****.

Candidate upstream fix: Strip inline comments before detecting continuation, and do not prepend continuation to full-line comments.

Notes: Maintainer calls shell backslash continuation a feature; interaction with comments is still the exact observed issue. No analog expected waveform is asserted.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
