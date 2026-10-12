# ngspice bug #824: Adding 0V Source in Series with Behavioural Current Source Results in Timestep too Small

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/824/ (status `open`, opened 2026-01-13)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment Vsource_problem.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`Vsource_problem.cir`](Vsource_problem.cir) (476 B, sha256 `8d300ab152be4c788f5d7a4fcca829f944c85f520fecf6b2cdf570b891aa5f8f`)

Ticket attachments:

- [Vsource_problem.cir](https://sourceforge.net/p/ngspice/bugs/824/attachment/Vsource_problem.cir) (476 B, sha256 `8d300ab152be4c788f5d7a4fcca829f944c85f520fecf6b2cdf570b891aa5f8f`)
- [spinit](https://sourceforge.net/p/ngspice/bugs/824/attachment/spinit) (1345 B, sha256 `a44c783e1b8209b1234e8ae67d3482ab49ef8c1b3a41e07ec05aab97ffd92c4d`)

Edits relative to the ticket: none; ngspice batch requested raw file with -r.

## Expected answer

At t=0 CELL+=0 and Voc is positive over the clamped SOC range, so battery branch current is negative. If SOC<0 the B-source switches off, but DC KCL then requires SOC=0; if SOC>=0 it turns on and injects negative current, but KCL requires negative SOC. No exact DC solution exists; a discontinuous boundary failure is expected, not proof the series 0 V source corrupts a valid solution. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Gmin/source stepping fail; transient-op returns SOC=-5.5415e-27 with battery current -0.304199 A. Eventually TRAN timestep too small at12.3694 s, voff4#branch. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | Unsupported behavioral expression: branch current i(...) references in BIbatt1. |

Reproduces on ngspice-47: yes. Check: Expect inability to maintain a consistent discontinuous SOC boundary; observed abort12.3694 s does not establish a valid-circuit numeric bug.

Notes: Thread corrects original claim: failure may expose invalid operating point rather than cause it. Right means failing is justified; initial near-boundary operating point is only approximate, not an exact DC solution. Patch #121 mentioned.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
