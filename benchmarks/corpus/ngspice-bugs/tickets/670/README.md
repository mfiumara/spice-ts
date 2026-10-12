# ngspice bug #670: Issue with TABLE's interpolation in non-linear current sources

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/670/ (status `open`, opened 2024-04-19)
- Category: docs
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (265 B, sha256 `a61ca61fc79f11a4ac5a02cf1c37f504dab19bf93cccffe51390312e03bc7fa5`)

Ticket attachments:

- [u.png](https://sourceforge.net/p/ngspice/bugs/670/attachment/u.png) (8771 B, sha256 `2efa10c57502c0f202abc167e2d3f11ef258601dc23a61b308c1c54661f37039`)
- [u1u2.png](https://sourceforge.net/p/ngspice/bugs/670/attachment/u1u2.png) (8555 B, sha256 `9766aaf0ba9563db9a58d7c47ee2890207c8f51a2ab9919953a16f747d072add`)
- [alternate](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/3410922a53/1f0c/1882/attachment/alternate) (14416 B, sha256 `79840f51e25150c027a76ca25518cd50b594bf8c911a0c422b6d73e0e4b91d84`)

Edits relative to the ticket: none

## Expected answer

Native TABLE lowering uses a smoothed PWL characteristic with radius 0.1*(5-0)=0.5 around the endpoint. The quadratic transition from slope 0 to slope 1 gives y(0)=radius/4=0.125, so KCL across the 1-ohm shunt gives U1=-0.125V while LIMIT(0,0,5) gives U2=0V. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Initial t=0: T=0, U1=-0.125, U2=0; transient completes 20008 rows. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | ParseError Unknown function 'V' on G TABLE {V(T)}. |

Reproduces on ngspice-47: no. Check: Initial transient U1=-0.125V versus U2=0V is the documented smoothing, not a linear-interpolation defect.

Notes: Maintainer explicitly explains intentional input_domain=0.1 fraction=TRUE and plans manual correction. Native TABLE semantics, not an ideal unsmoothed alternative, are used.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
