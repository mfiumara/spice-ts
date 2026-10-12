# ngspice bug #160: .tf do not works at all times

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/160/ (status `open`, opened 2011-08-20)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachments tfv.cir, tfi.cir, S2-CM-WF.CIR (post mhx_at_sf 2017-10-29).

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`dot_tfv.cir`](dot_tfv.cir) (137 B, sha256 `9000567b2c6e90f6e0f5087c62f82cf5142517f895aa536940bdc05c92f6e245`)
- [`dot_tfi.cir`](dot_tfi.cir) (137 B, sha256 `bfd8e134b2844baa6637f535299fdc96f311fba305d57cd25d1f2e91532889ac`)
- [`pair.cir`](pair.cir) (731 B, sha256 `fe3281bc8cb25dd386364b69c44cd3eb55c1e707878a917314b276304ae6384b`)

Ticket attachments:

- [S2-CM-WF.CIR](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f583f5e8/8d17/attachment/S2-CM-WF.CIR) (780 B, sha256 `b7ff2c7690997d12955a3f1ba0f13bc63bb786914480b4500d5c239354825bd5`)
- [tfi.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f583f5e8/5737/attachment/tfi.cir) (235 B, sha256 `519e3a1eb626e5c4f9552d18773df12bd79b272e7a9918a16fbe869c337607e6`)
- [tfv.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f583f5e8/5737/attachment/tfv.cir) (235 B, sha256 `4b3780c0af0a6b17954dca27bf54b828ded4814d1fc9f23ea5a48a3b4f7b523c`)
- [tvf.txt](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f583f5e8/5737/attachment/tvf.txt) (113 B, sha256 `2bf790b69b6b196441ba9804e635e409f895d8cbba62a48d5b14eb73677f23ea`)
- [tvi.txt](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/f583f5e8/5737/attachment/tvi.txt) (113 B, sha256 `f7ba79ff576d06ec36fa9cef12f008b8c1953005b3b43c45fd27126aebe5c31c`)

Edits relative to the ticket: Kept originals. Removed control listing/run/print-to-file/rusage/quit from tfv/tfi (dot .tf unchanged); removed only absent boilerplate .inc ngspice.inc from CMOS pair, retaining .PROBE.

## Expected answer

Voltage-input divider H=50/(4950+50)=0.01, Rin=5000 ohm, Rout=50+(4950||50)=99.5 ohm. Current-input case H=50 V/A, Rin=5000 ohm, Rout=100 ohm. CMOS pair: pMOS saturated current=33.75 uA; nMOS triode balance 80u*(1.75*v-v^2/2)=33.75u gives v=0.260453089 V, gain=-(80u*v+45u)/[80u*(1.75-v)]=-0.552485513 and Rout=8391.81358 ohm. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | tfv: gain .01, Rin5000, Rout99.5; tfi: gain50, Rin5000, Rout100; CMOS gain -0.552486, Rout8391.814, Rin1e20. |
| ngspice master | right | Output identical to 47. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | tfv .009999999999999998/5000/99.49999999999999; tfi50/5000/100; CMOS gain -0.5524855283, Rout8391.813485. |

Reproduces on ngspice-47: no. Check: CMOS .tf must still print with .PROBE retained; verify gains .01,50,-.5524855 on corresponding decks.

Notes: Original 2011 amp3-dependent PZ failure overlaps #158; this test covers the explicit later standalone repro and sanity decks.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
