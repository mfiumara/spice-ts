# ngspice bug #820: capacitor behavioral high current

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/820/ (status `open`, opened 2025-10-29)
- Category: device-model
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment mimcap.tar.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 820`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/820/` and verifies the hashes):

- `mimcap/test_mim.cir` (1703 B, sha256 `82b8a6941af9fa8ffabca1d232e4758314682358e1a2d7b8974414e8b40f210d`)
- `mimcap/test_mim_cards.cir` (1609 B, sha256 `d38942156edb27dbd10ba475d61812aa3249c242a8b3bb5b1a0ef44e8e900a04`)

Ticket attachments:

- [mimcap.tar](https://sourceforge.net/p/ngspice/bugs/820/attachment/mimcap.tar) (20480 B, sha256 `f27db7971c14d48d73755d461baf92164dea0e2b5d7fb67f26f2805a0f8ffe4e`)
- [GA.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/6eb93681ed/fb1f/attachment/GA.png) (18327 B, sha256 `0cb5e4e1e577321eb05422b6adbb6fc6f79fa57e37b744ffe855044ff963e972`)

Edits relative to the ticket: Card variant removes .control; preserves original .tran and adds .print tran v(2) i(v1).

## Expected answer

The internal unit capacitor uses I=C*dV/dt with C=1F, so about 1.4V/ns legitimately corresponds to about 1.4GA; its physical terminal current is scaled by the ~112fF behavioral coefficient. Capacitive division gives V2≈3*200/(200+112.2+112.2)=1.41376V, not a GA terminal source current. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Both decks complete 228 rows through 100ns. Max V(2)=1.4137891048V versus linearized analytic 1.4137606032V; max physical \|I(V1)\|=0.0003172585A, internal current coordinate=1414.0021A (not GA in this revised implementation). See analytic_check.txt. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | With resolver: ParseError Unsupported dot command '.param' on random multi-parameter declaration in mim_cap.l. |

Reproduces on ngspice-47: no. Check: Check V(2) plateau near 1.414V and ordinary I(V1), while recognizing any GA internal coordinate is a mathematical scaling variable.

Notes: ngspice-47 uses revised behavioral-capacitor internal current-measuring branch instead of old E-source name; completes small test. Full 68000-device failing design unavailable/NDA; cannot adjudicate convergence claim for it.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
