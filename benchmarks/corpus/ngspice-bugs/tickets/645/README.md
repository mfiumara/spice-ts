# ngspice bug #645: KLU: Small signal noise for bipolar is defect

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/645/ (status `open`, opened 2023-10-11)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`klu.cir`](klu.cir) (487 B, sha256 `2c79229c32cb9644550ac8a9c93750851910f51fe4db59456e6ae8dffb2750f9`)
- [`sparse.cir`](sparse.cir) (490 B, sha256 `55c799b9a2c4b44e4b2cddaa2a581b7f6d4f6cbf081a40c600dfefdb942699a3`)
- [`dot.cir`](dot.cir) (474 B, sha256 `6d6ad57d423fc440e94220ad870c69d2d14161cec5494bf43f11236c1baf1572`)

Ticket attachments:

- [bip-noi-out.png](https://sourceforge.net/p/ngspice/bugs/645/attachment/bip-noi-out.png) (35797 B, sha256 `5f874fa8e0a3f2095ff469beb64ce3bad1352c1b0dcc4a856d6edb98d7b352d7`)
- [mos-noi-out.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/d1ca6077d4/8568/attachment/mos-noi-out.png) (35263 B, sha256 `46db00630093897af36238cfcd7d87e50d45e4a07e69ddd47af8018501842cd1`)

Edits relative to the ticket: Original preserved. Converted control noise into same .noise and spectrum .print; plotting removed. Required solver-only variants add .options klu/sparse; no model parameters changed.

## Expected answer

Independent noise-source PSDs propagate as sum |H_k|^2 S_k, with resistor S_I=4kT/R and BJT shot noise S_I=2qI; their integral over a finite positive-frequency band is finite and nonnegative. Solver choice must not change this mathematics. Exact biased BJT transfer weights are undetermined without independently evaluating its full model. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | KLU explicitly rejects noise simulation as not yet supported. Sparse outputs84 finite spectral rows: f=.5Hz onoise1.664290e-6, inoise3.526263e-8; f99.76312MHz onoise3.192241e-9. |
| ngspice master | right | Fixed on master: KLU noise now runs and the 84 onoise/inoise rows equal the Sparse rows exactly (e.g. 0.5 Hz onoise 1.664290e-06); 47 refused noise with KLU. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | Unqualified dot deck: InvalidCircuitError .noise does not support BJT model parameter 'VAR' for q1; solver option variants also unsupported. |

Reproduces on ngspice-47: partially. Check: Check whether KLU still rejects noise; if enabled, results must be nonnegative and solver-independent, requiring an independent BJT model oracle for exact coefficients.

Notes: 47 guards the formerly incorrect KLU noise path. Numeric Sparse coefficient precision not independently validated; no unsupported-parameter removal permitted.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
