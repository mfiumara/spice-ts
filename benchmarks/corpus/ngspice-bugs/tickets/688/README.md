# ngspice bug #688: Issue when plotting current output

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/688/ (status `open`, opened 2024-08-16)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`ticket688.cir`](ticket688.cir) (79 B, sha256 `15a08eae94b6c6fe7f5a949f3c359491e3731e3fb3ec676a819a7b7ba876781a`)
- [`print.cir`](print.cir) (89 B, sha256 `9551ac3f9be44b3e37383fd85dee200b2e97681df18e0f079d07fbb2d09f729a`)

Ticket attachments:

- [ltspice.png](https://sourceforge.net/p/ngspice/bugs/688/attachment/ltspice.png) (12181 B, sha256 `f7e07ce08b885e43ae53753c09f53c90502413c71a9dc66881eba94c1d0d3858`)
- [ngspice.png](https://sourceforge.net/p/ngspice/bugs/688/attachment/ngspice.png) (25936 B, sha256 `2e4a9be6962ab23797ee1025bfb1d185a78728d3afde1cc24979338ae8c730ed`)
- [qspice.png](https://sourceforge.net/p/ngspice/bugs/688/attachment/qspice.png) (17772 B, sha256 `de3e319909b8daec69d0e117043ffd0e1bea9fee2144aa3d0abf5d5eb93b094a`)

Edits relative to the ticket: print.cir replaces `.plot I(L1)` with `.print dc I(L1) I(V1)` so batch mode prints values.

## Expected answer

L1 is a DC short across V1, so for any V1 != 0 KVL around V1-L1 has no solution (voltage-source/inductor loop). A correct simulator must diagnose the singular topology, not return a current. (Only V1=0 has a solution.) (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | Prints "Warning: singular matrix: check node l1#branch" and gmin/source-stepping failures, then exits 0 and reports I(L1) = -1e13 A at V1=+10 V (point 200), 9.9e12 A at V1=-9.9 V. |
| ngspice master | wrong | Identical to ngspice-47: I(L1) = -1.00000e+13 A at V1=10 V, exit 0. |
| spice-ts | right | SingularMatrixError: "Singular matrix: zero pivot at matrix column 2 (nodes: ; branches: L1)" - no numeric result is returned. |

Reproduces on ngspice-47: yes. Check: print.cir: ngspice prints I(L1) = +-1e13 A rows instead of failing.

Candidate upstream fix: Fail the DC sweep point (or the run) when the matrix is singular after gmin/source stepping, instead of emitting the gmin-regularised 1e13 A solution.

Notes: ngspice developers answered "no bug: user error" (an inductor is a DC short). The circuit is ill-posed; the defect is that ngspice emits TA-scale numbers with exit status 0 instead of an error.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
