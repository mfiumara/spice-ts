# ngspice bug #691: Simulation aborted when using klu solver

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/691/ (status `open`, opened 2024-09-14)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`klu.cir`](klu.cir) (589 B, sha256 `9f3bbee9e802470f6b2fb1b2aaa1c39635153948273f6aa4a361e21c7d7b93fd`)
- [`sparse.cir`](sparse.cir) (592 B, sha256 `6e25001bcdaea5d1e3c9f7737b3f8352c83c33258388fbb42424e9a5d80e9f7c`)
- [`original.cir`](original.cir) (576 B, sha256 `af5dfebe6046650f765094dbc8e7065d914ec22cbcb2d011cd4ff43b3856164b`)

Edits relative to the ticket: Transcribed original unchanged; required solver-only variants add .options klu/sparse.

## Expected answer

The biased VBIC network must admit a consistent DC operating point before computing AC/PZ; direct solver choice cannot alter the model equations. Given an operating point, poles/zeros solve the corresponding determinant problem det(G+sC), but precise VBIC roots here are undetermined without independent full model evaluation. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | KLU explicitly rejects PZ as not yet supported; Sparse/original complete501 AC rows and PZ roots (including pole -1.86198e4). |
| ngspice master | wrong | KLU .pz on master aborts with "The input signal is shorted on the way to the output"; Sparse run succeeds (47 refused KLU pole-zero). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | The defect is specific to ngspice option KLU; spice-ts rejects .options klu/sparse as unsupported options. On the original deck (no solver option) spice-ts runs the VBIC AC/PZ (v4 \|H\|=685.149 at 100 kHz), as does ngspice with Sparse; those roots were not validated independently. |

Reproduces on ngspice-47: partially. Check: KLU PZ currently reports unsupported rather than historic failed DC convergence; default/Sparse completes.

Candidate upstream fix: NEW on master: KLU pole-zero aborts with "The input signal is shorted on the way to the output" where Sparse succeeds (same symptom as #690). Not yet reported upstream.

Notes: Right spice-ts verdict applies only to absence of the alleged solver/convergence failure, not independent validation of all VBIC roots or AC numbers. No numeric issue inferred from simulator disagreement. Coordinator: spice-ts verdict set to unsupported because the comparison is solver-option specific.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
