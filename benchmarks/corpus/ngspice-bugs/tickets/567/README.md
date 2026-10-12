# ngspice bug #567: Raising zero to a power

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/567/ (status `open`, opened 2021-12-12)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment pwr.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`pwr.cir`](pwr.cir) (80 B, sha256 `120cbb8f7091eefd8ad54af5069af095216c82e1b4743bdab52e3bf5a06ba5af`)

Ticket attachments:

- [pwr.cir](https://sourceforge.net/p/ngspice/bugs/567/attachment/pwr.cir) (80 B, sha256 `120cbb8f7091eefd8ad54af5069af095216c82e1b4743bdab52e3bf5a06ba5af`)

Edits relative to the ticket: none

## Expected answer

The ideal source fixes V(2)=4V at every simulated positive time, so pwr(V(2),0.5)=sqrt(4)=2V. The derivative is singular at zero, but zero is not the final operating bias and must not prevent evaluation at the enforced 4V. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Transient completes: 111 rows, exit=0; all positive-time raw V(1) samples equal 2 within 2.23e-16V. See analytic_check.txt. |
| ngspice master | right | Output identical to 47. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | 107 points through 10us; V(1) last=2, min=0 (initial sample), max=2. |

Reproduces on ngspice-47: no. Check: All positive-time V(1) samples should equal 2V and no pow-domain error should occur.

Notes: spice-ts reports a zero-time initialization sample V(1)=0, then final/max V(1)=2; ngspice no longer emits the historical pow error.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
