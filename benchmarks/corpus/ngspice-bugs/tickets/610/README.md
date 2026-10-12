# ngspice bug #610: vsource_arith calculation error

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/610/ (status `open`, opened 2022-11-11)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: post by p-fath 2022-11-11.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (503 B, sha256 `2002acbd0bd633ca76f346a24644bb7349ce42207b1aba0de8e1ea34a77cdddb`)
- [`original_cards.cir`](original_cards.cir) (485 B, sha256 `11423f32dc4ed8f8f549acc2c8f5fa9bf59ec8088564b5190cf79ebba3975bb3`)

Ticket attachments:

- [multiply_error_ngspice.png](https://sourceforge.net/p/ngspice/bugs/610/attachment/multiply_error_ngspice.png) (97261 B, sha256 `aa9289365f2e144778c2871274ac70b67e1f406d8f88e5c829596f5324c19eec`)

Edits relative to the ticket: Card variant replaces .control with equivalent .tran 2p 20n and .print tran outputs.

## Expected answer

For theta=2*3.1415*175Meg*time, an integer cube sin(theta)^3 equals three explicit factors and retains the sign of sin(theta), unlike sin(theta)^2. At t=4.00056ns, sin(theta)^2=0.9047939808 and both cubes=-0.8606459990 in this ngspice-47 run. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Both decks complete 10008 rows; at t=4.000560000000151e-9, V(v2)=0.9047939808265216, V(v3)=V(v3_1)=-0.8606459990412838. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | ParseError Undefined parameter 'time' on valid behavioral E VOL expression. |

Reproduces on ngspice-47: no. Check: Verify v3 and v3_1 agree including their negative half-cycles, while v2 stays nonnegative.

Notes: Ticket ngspice-38 discussion describes historical absolute-value power semantics; ngspice-47 native observed integer power now agrees with ordinary signed multiplication. Expectation here is mathematical integer power, not a comparison between simulators.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
