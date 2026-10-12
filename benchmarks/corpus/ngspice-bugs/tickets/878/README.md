# ngspice bug #878: MESA (NMF/PMF, levels 2-4): drain current of an instance depends on netlist order; `inverse` flag in MESAload is never reset

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/878/ (status `open-accepted`, opened 2026-10-12)
- Category: device-model
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: inline in description; owner repro_l2_a.cir/repro_l2_b.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`repro_l2_a.cir`](repro_l2_a.cir) (219 B, sha256 `59af1b10662b47d97e79bea35a84507e992150420e59736ac55b4a770f4a4779`)
- [`repro_l2_a_cards.cir`](repro_l2_a_cards.cir) (210 B, sha256 `d9e5db44e7dfb24275d1bab27d113bba1beea74b52af4cbc280fcbb818b6e617`)
- [`repro_l2_b.cir`](repro_l2_b.cir) (219 B, sha256 `2149dfc998e19282f1f962704c089d6e3909fbd0713c18d1667be6f3c43812a2`)
- [`repro_l2_b_cards.cir`](repro_l2_b_cards.cir) (210 B, sha256 `c923a98d1346b840fbc101f20986ae38b18437f076428a05ca8258657e21e7bf`)

Edits relative to the ticket: Card variants remove .control and add .op/.print op i(vd1) i(vd2).

## Expected answer

Independent MESA devices satisfy the same local equations for each fixed set of terminal biases regardless of instance-list permutation. The named +1 V device must give the same current in both decks; negative-bias state of a different instance cannot alter its gate bias. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | Order A i(vd2)=-4.59625e-04; order B i(vd2)=-5.06804e-09. i(vd1)=2.551233e-02 both orders. |
| ngspice master | wrong | Identical to 47: repro_l2_a i(vd2)=-4.59625e-04 vs repro_l2_b i(vd2)=-5.06804e-09. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | right | Both orders i(vd2)=-0.00045962474160730904 and i(vd1)=0.025512330406461114, exactly unchanged. |

Reproduces on ngspice-47: yes. Check: Compare i(vd2) in repro_l2_a.cir versus repro_l2_b.cir; they must be identical.

Candidate upstream fix: Patch already attached to the ticket by the reporter (reset the inverse flag per instance in MESAload).

Notes: Only supplied level-2 pair run; levels 3/4 are described in the ticket but not changed into new decks. Supplied patch not applied.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
