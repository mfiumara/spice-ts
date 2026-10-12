# ngspice bug #92: Noise simulation produces nan

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/92/ (status `open-accepted`, opened 2010-02-12)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment 4geda_noise_test_case.tar.gz.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 92`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/92/` and verifies the hashes):

- `testA0.net` (2309 B, sha256 `dc7e7ea21e760170ddf1692f1b0da3c5055333f54f47ada70ac289d39adb62a6`)
- `dot.cir` (2183 B, sha256 `a90f80c047a73e0d9cdc2a6c9bc33e0d4e981ad0376023a8f693ab4c2e1f2417`)

Ticket attachments:

- [4geda_noise_test_case.tar.gz](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/39343252/230b/attachment/4geda_noise_test_case.tar.gz) (2188 B, sha256 `756c9dcbc3020e8fbcf4243052850e085521f2323d2ca6930ad1eb108a2c3154`)
- [Screenshot_nan.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/39343252/3d14/attachment/Screenshot_nan.png) (188162 B, sha256 `a4ad83fb44b38149e50b7feecf4c2c1ce3d816085bd453b1efa16471d99cbff7`)

Edits relative to the ticket: Original and provided model cards extracted unchanged. Dot variant replaces control AC/op/noise by matching dot cards and prints spectral data; no device/model edits.

## Expected answer

On the finite [1,1e9] Hz band, a finite nonnegative PSD has a finite nonnegative integral: variance=sum S0*f0*expm1((a+1)*ln(f1/f0))/(a+1), where a=ln(S1/S0)/ln(f1/f0), with logarithmic limit at a=-1. Independent integration of the 188 saved (decimated) output/input PSD samples gives RMS .00080358765/.00022004743 V; decimation and missing high-end interval limit numerical precision, but NaN cannot be justified. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Unmodified control deck: inoise_total=2.253967e-04, onoise_total=8.049792e-04; no NaNs. Dot deck prints188 saved spectral samples; AC/save warnings do not affect original result. |
| ngspice master | right | Identical to 47: inoise_total=2.253967e-04, onoise_total=8.049792e-04 (finite). [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | Both original/dot: Undefined parameter 'modelcard' at .inc 'modelcard.pmos'. Include resolver was supplied; parser only recognizes .INCLUDE, not .INC alias. |

Reproduces on ngspice-47: no. Check: Original testA0.net must print finite onoise_total and inoise_total; observed8.049792e-4 and2.253967e-4.

Notes: Models are third-party process cards: fetch-only. #668 thread mentions pre-master-43 workaround/fix. Independent quadrature checks integration consistency, not independent full BSIM3 PSD coefficients. Cannot remove/rename necessary .inc under edit restrictions.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
