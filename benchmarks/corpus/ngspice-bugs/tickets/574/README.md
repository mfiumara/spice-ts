# ngspice bug #574: .measure dc when fails on first step

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/574/ (status `open`, opened 2022-01-15)
- Category: frontend-ui
- Outcome: ngspice defective, spice-ts also wrong
- spice-ts issue: https://github.com/mfiumara/spice-ts/issues/811

## Decks

Origin: attachment test.sp, including commented failing .dc command.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`test.sp`](test.sp) (126 B, sha256 `1749738271d0f07f04b7c0e43d4a42ffdf40c80859272920ef4e7f79dab7100d`)
- [`firststep.cir`](firststep.cir) (116 B, sha256 `e4588ff995e3cf85281424df7f276d42de4ce940b5c9733582b7a9b38d0e4822`)

Ticket attachments:

- [test.sp](https://sourceforge.net/p/ngspice/bugs/574/attachment/test.sp) (126 B, sha256 `1749738271d0f07f04b7c0e43d4a42ffdf40c80859272920ef4e7f79dab7100d`)

Edits relative to the ticket: Original test.sp unchanged. firststep.cir activates the explicitly posted failing .dc v1 0 1 0.05 and comments the posted workaround .dc ... 0.025; no circuit or tolerances changed.

## Expected answer

Ohm law gives I(V1)=-V(1)/1000. The sweep contains V(1)=0.05 exactly at its first increment; FIND WHEN must return -5e-5 A, independent of whether step is 0.05 or 0.025. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | 0.025-step test=-5.00000e-05, but 0.05-step: measure test find(AT): out of interval despite matching sweep point. |
| ngspice master | wrong | Identical to 47: "measure test find(AT) : out of interval ... failed!". [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | wrong | firststep measurement status=failed, error=measure test find(AT): out of interval; dcSweep has index1 V=0.05 and I=-0.00005. |

Reproduces on ngspice-47: yes. Check: firststep.cir must produce measurement test=-5e-5 A; current output fails out of interval.

Candidate upstream fix: Include the first adjacent sweep-point interval and exact endpoint equality in FIND/WHEN crossing detection.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
