# ngspice bug #877: HFET1 (level 5): drain current of an instance depends on netlist order; `inverse` flag in HFETAload is never reset

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/877/ (status `open-accepted`, opened 2026-10-12)
- Category: device-model
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: inline in description; owner repro_a.cir/repro_b.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`repro_a.cir`](repro_a.cir) (406 B, sha256 `c1a35cba16e42705fb0658ed546e597b4859ff16e2660651e04b62ec59c31165`)
- [`repro_a_cards.cir`](repro_a_cards.cir) (397 B, sha256 `e765daf0deb3539e97bf33b5fe4a6ef5e8327787e94b7e57347c131071d31edc`)
- [`repro_b.cir`](repro_b.cir) (406 B, sha256 `cbaa9cf2d5fd9ce329f6a7977f36a66b44a800f8626983782b66e2e66d345173`)
- [`repro_b_cards.cir`](repro_b_cards.cir) (397 B, sha256 `42a1b9e041b2b0dcd4acb580d312f832a1d03c35bbc5c9ea3363ba659521d7e1`)

Edits relative to the ticket: Card variants remove .control and add .op/.print op i(vd1) i(vd2).

## Expected answer

Independent device terminal equations depend only on that instance bias and parameters, not traversal order. Therefore each named current must be unchanged by swapping Z lines; the +1 V device must absorb positive drain power (i(vd2)<0 under source convention). (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | Order A i(vd2)=-4.38545e-04; order B i(vd2)=+2.463106e-04. i(vd1)=6.244326e-04 in both. |
| ngspice master | wrong | Identical to 47: repro_a i(vd2)=-4.38545e-04 vs repro_b i(vd2)=2.463106e-04 for the same biased instance. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | Both orders i(vd1)=0.0006244094692970138; i(vd2)=-0.00043854487475289416, exactly unchanged. |

Reproduces on ngspice-47: yes. Check: Compare i(vd2) in repro_a.cir and repro_b.cir; they must be identical.

Candidate upstream fix: Patch already attached to the ticket by the reporter (reset the inverse flag per instance in HFETAload).

Notes: Only level 5 tested. Supplied patch resets inverse per instance; not applied. Numerical absolute current is not established analytically.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
