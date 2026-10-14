# ngspice bug #695: B-device branch current conv-test not effective

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/695/ (status `open`, opened 2024-10-01)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`dot.cir`](dot.cir) (449 B, sha256 `51b4d83c0df6c64af8e313b395bcf6a17975577e37f302adb45e983dedbc5102`)

Ticket attachments:

- [nonconvergingASRC.png](https://sourceforge.net/p/ngspice/bugs/695/attachment/nonconvergingASRC.png) (184923 B, sha256 `1610560928d336209219b9ae894257ca15efba00cccfeb35c516e17996655d04`)
- [bug695.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/b47ff87b10/7f26/attachment/bug695.png) (71033 B, sha256 `2930cf8cf895dea65807c7c3b34817361b49c9edabc6dff7d3ee3d3d1b531d29`)
- [bugreport.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/b47ff87b10/ca53/attachment/bugreport.png) (113129 B, sha256 `5fba9615c3d3dd16761d4bcbaaed3b15f42d1a15d22b6dadeaa701c43dd17f67`)
- [workaround.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/b47ff87b10/ca53/attachment/workaround.png) (86902 B, sha256 `4a7f5563e12a623701f36a5093752d02a4593699c4e95fb633a8594c47c5af5b`)

Edits relative to the ticket: Original preserved; removed control run/plot block (already had .tran), kept ngbehavior=psa and all devices/options. ngspice batch requested raw output with -r, no circuit edits.

## Expected answer

For time>=0.5 s KCL is v/1000=0.001-( (v-1.1)/0.01 )^3+(v-1.1)/1000+0.0001, which reduces to (v-1.1)^3=0. Thus v=1.1 V and I(B2)=0.1 mA immediately; before switching v=1 V and I(B2)=0. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Timestep too small at time0.5, timestep1.25e-15, node y; raw stops before0.5 with v(y)=1 and B2current0. |
| ngspice master | error | Identical to 47: "Timestep too small; time = 0.5 ... trouble with node y". [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | #812 refresh d8ab9d33: pinned dot.cir first fails at ParseError line 2, Unsupported .options field ngbehavior, on .options ngbehavior=psa. Native ngspice-47 fails to converge. No metrics or correctness win. Existing #812 compatibility-option bucket. |

Reproduces on ngspice-47: partially. Check: After t=0.5, accepted points must have v(y)=1.1 and B2current0.1 mA; 47 instead aborts at the discontinuity.

Notes: Ticket mentions proposed patch #121. Historic silently unconverged accepted current could not be reproduced because 47 aborts before activation; cannot remove compatibility option to force spice-ts support.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
