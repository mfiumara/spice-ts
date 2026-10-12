# ngspice bug #690: pole-zero analysis simulation aborted when using klu solver

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/690/ (status `open`, opened 2024-09-05)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`klu.cir`](klu.cir) (125 B, sha256 `f32f723fc3c43de75675302263ed73f2ab3b8463b331ea94788973f2167c247c`)
- [`sparse.cir`](sparse.cir) (128 B, sha256 `a89a9d9400109bad2f2305c7204ffcae3f55d1bd7c96bda89a63e3feec433537`)

Ticket attachments:

- [1.raw](https://sourceforge.net/p/ngspice/bugs/690/attachment/1.raw) (230 B, sha256 `7b5809d7efe086411e1ee7b4c2344cbf456b888c487470fc4d55c34d57439924`)

Edits relative to the ticket: Transcribed original; solver-only variants explicitly select klu or sparse, no electrical changes.

## Expected answer

KCL gives H(s)=1/[1+s(R1+R2)C1]=1/(1+1.5e-8 s); one pole at -6.6666666667e7 rad/s and no finite zero. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | KLU explicitly rejects PZ: Pole/zero analysis is not (yet) supported; Sparse returns pole -6.66667e+07 + j0, no zeros (correct). |
| ngspice master | wrong | KLU .pz now runs on master but aborts with "The input signal is shorted on the way to the output" for a plain RC low-pass (Sparse gives the single pole). 47 refused KLU pole-zero outright. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | ParseError Unsupported .options field: 'klu'; sparse likewise unsupported. |

Reproduces on ngspice-47: partially. Check: Check KLU PZ support/rejection; if supported, expect sole pole -6.6666667e7 and no zeros.

Candidate upstream fix: NEW on master: KLU pole-zero now runs but reports "The input signal is shorted on the way to the output" for a plain RC low-pass that Sparse solves (single pole). Not yet reported upstream.

Notes: 47 prevents historic incorrect KLU answer by explicit unsupported-analysis guard; this is not a spice-ts numeric defect.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
