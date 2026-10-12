# ngspice bug #651: VDMOS ksubthres parameter limitation

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/651/ (status `open`, opened 2023-12-22)
- Category: device-model
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: attachment ksubthres_nch.sp.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`ksubthres_nch.sp`](ksubthres_nch.sp) (466 B, sha256 `0e6d631b245574373c433d5c0ff9c9d2bcfd70f8dbab72f8f56231efb31066a0`)
- [`ksubthres_nch_cards.sp`](ksubthres_nch_cards.sp) (256 B, sha256 `8ba9d22993357b85e2aa2124acf6dbed48a83fb711ff779c782c6eee66c8e674`)

Ticket attachments:

- [ksubthres_nch.sp](https://sourceforge.net/p/ngspice/bugs/651/attachment/ksubthres_nch.sp) (466 B, sha256 `0e6d631b245574373c433d5c0ff9c9d2bcfd70f8dbab72f8f56231efb31066a0`)

Edits relative to the ticket: Dot-card variant replaces .control foreach with .dc VG 0 4 0.01 at original card ksubthres=1.07m; this is ONE of the requested small-slope cases, not an equivalent five-sweep replacement.

## Expected answer

For s>0, u=s*log(1+exp((Vgs-Vto)/s)) has a finite strong-inversion limit u≈Vgs-Vto even when the exponential overflows an implementation. At external VG=4V, ID satisfies ID=(7.1/2)*(4-2.2-0.1ID)^2*(1+0.03*(10-1.1ID)); its physical saturation root is 5.827026843146154A, so the small-slope sweep should remain finite. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | First .control DC aborted: timestep too small vg=3.13. Original-model dot-card sweep aborted at vg=3.21, exit=1. |
| ngspice master | error | Identical to 47: "Timestep too small; vg = 3.13: trouble with mrf101-instance m1", dc aborted. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | Dot-card sweep: 401 points, all finite; I(VD) at 4V=-5.827026843138996A, expected -5.827026843146154A. |

Reproduces on ngspice-47: yes. Check: Original first altered ksubthres=0.001 sweep aborts near VG=3.13V; dot-card original 1.07m aborts near 3.21V.

Candidate upstream fix: Evaluate slope*log1p(exp(x)) and its derivative with overflow-safe softplus/logistic branches.

Notes: spice-ts dot-card sweep independently meets analytically solved endpoint to about 1e-11A and has 401 finite monotonic points. Original control final sweep has ksubthres=0.1, yielding 5.827029165A. Early auxiliary summary TypeError was a probe formatting bug after successful simulation; corrected probe appended.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
