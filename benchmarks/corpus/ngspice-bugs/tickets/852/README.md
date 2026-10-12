# ngspice bug #852: # KLU: crash in klu_z_refactor() when analyses follow each other in one deck

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/852/ (status `open`, opened 2026-07-28)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`klu.cir`](klu.cir) (143 B, sha256 `aaae282d5a1147c530ea76de17a3e7862fa1f5aff657ba055345dc081dbd78d3`)
- [`sparse.cir`](sparse.cir) (146 B, sha256 `186f5ba24b2ff100fd973ed7e5c68ead90d1579b7bfca1be66bdfb38b00dd234`)

Edits relative to the ticket: Transcribed ten circuit lines only; solver-only variants explicitly select klu/sparse. No analyses or devices changed. An initial transcription mistakenly included the following shell invocation, which was removed before the decisive rerun; failed initial logs retained.

## Expected answer

A passive RC lowpass has H(jw)=1/(1+jw*159 us); both identical AC sweeps must give the same result and zero-input transient remains0. Real/complex matrix-storage transitions must preserve valid factorization or refactor/reorder safely, never crash. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Corrected KLU deck SIGSEGV exit139; Sparse emits identical13-row AC sweeps (1Hz .999999-j.000999025, 1kHz .500487-j.5) but warns no transient data saved with the posted AC-only print. |
| ngspice master | error | Identical to 47: KLU deck aborts with SIGTRAP (exit 133); Sparse deck runs. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | Unsupported .options field: 'klu' and 'sparse'. |

Reproduces on ngspice-47: yes. Check: Corrected klu.cir crashes exit139; both Sparse AC sweeps match H(s)=1/(1+159us*s).

Candidate upstream fix: Re-arm real/complex reorder flags whenever KLU matrix binding changes and avoid refactoring with a numeric factorization for the other scalar type.

Notes: Ticket proposes direction but no applied fix. Exact deck intentionally preserves .print ac-only, so Sparse does not save transient data; KLU safety defect still reproduces.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
