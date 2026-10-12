# ngspice bug #682: strange branch contribution since ngspice-43

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/682/ (status `open`, opened 2024-07-22)
- Category: device-model
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment ngspice_circuit.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 682`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/682/` and verifies the hashes):

- `ngspice_circuit.cir` (2262 B, sha256 `38dcfb0892de3bfc045ed6a036a8a6e60ece74b335826c72018b1002c2d7cecd`)
- `ngspice_circuit_cards.cir` (2139 B, sha256 `967ea1e595d2206c05d7cc78a44c5c9a2398392c6bb265f5c0b45318292b2319`)

Ticket attachments:

- [ngspice_circuit.cir](https://sourceforge.net/p/ngspice/bugs/682/attachment/ngspice_circuit.cir) (2262 B, sha256 `38dcfb0892de3bfc045ed6a036a8a6e60ece74b335826c72018b1002c2d7cecd`)
- [test_dc.ngspice](https://sourceforge.net/p/ngspice/bugs/682/attachment/test_dc.ngspice) (746 B, sha256 `7f6591fb87b1d644ffea68e7219890eb5e3aaf6d7664fdf4a36c5aec56f945b3`)

Edits relative to the ticket: Card variant replaces .control op/wrdata with .op/.print op all.

## Expected answer

With all four imposed terminal voltages zero, junction voltage differences and net power are zero, so terminal currents and temperature rise must vanish (within solver tolerances). A reported device terminal current must also agree with the negative bias-source current by KCL; arbitrary internal NQS unknowns need not be terminal currents. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Zero-bias OP completes; raw terminal currents ~1e-144 A; q#xf1/q#xf2 retained but unexpected q#branch absent. One initialization NaN thermal-limiter warning before gmin completion. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | Error Cannot parse number: '1 dtemp=0 Ny=1 le=0.96e-6 we=0.12e-6 El=le*1e6 selft=1' (multi-parameter .param unsupported). |

Reproduces on ngspice-47: no. Check: At supplied zero biases, check terminal currents ≈0 and absence of unexpected q.x1.qnpn13g2#branch vector.

Notes: Attachment has VB=VC=0, unlike nonzero-bias developer discussion. Did not alter those biases; cannot exercise the historically wrong ic reporting at 0.7/1V. Fix commits explicitly discussed. Model is IHP-derived third-party text, fetch-only.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
