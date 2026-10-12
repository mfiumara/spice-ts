# ngspice bug #850: CKTtopologyReduce spurious pruning

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/850/ (status `open`, opened 2026-07-13)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment topo_reduce_sensed_node.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`dot.cir`](dot.cir) (593 B, sha256 `996aed12b2074c769249823d5ae23fa0ec6750abcbc8c800397035c612ae45c2`)

Ticket attachments:

- [topo_reduce_sensed_node.cir](https://sourceforge.net/p/ngspice/bugs/850/attachment/topo_reduce_sensed_node.cir) (603 B, sha256 `b05e9fd1602a5e227fd6110b060a7ccafa4921ffa7c7a21b6ddd0eecc13743d2`)

Edits relative to the ticket: Preserved original; replaced control op/print by .op and .print op v(a) v(out), no device changes.

## Expected answer

The behavioral voltage input draws zero current, so R1 has zero voltage drop: a=in=1 V. Bx enforces out=a=1 V and drives 1 mA into rl. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | v(a)=1.000000e+00, v(out)=1.000000e+00; bx#branch=-1.00000e-03. |
| ngspice master | right | Output identical to 47. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | a=1, in=1, out=1, bx=-0.001 A. |

Reproduces on ngspice-47: no. Check: v(a) and v(out) must both equal 1 V, not 0 V.

Notes: Ticket provides an explicit topology-reduction patch. Homebrew 47 is correct; master absent at run.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
