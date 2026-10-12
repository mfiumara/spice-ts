# ngspice bug #818: pwr(V(X,Y),z) out of range error being resolved by adding superfluous computations.

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/818/ (status `open`, opened 2025-10-09)
- Category: simulator-numerics
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (327 B, sha256 `8e867808a9d7f874ebe435932155041b9d3835c7c75816bb8ca27b4a45bcf170`)
- [`original_cards.cir`](original_cards.cir) (220 B, sha256 `cd7262c5b88a1f0f55861eebcb7542cb92f058f69cbcc125df5a5d863134c825`)

Edits relative to the ticket: Card variant removes .control, adds identical .dc sweep and .print dc i(VIN).

## Expected answer

For every sweep value c>0, R=c^0.685841 is finite and I(VIN)=-1/R=-c^(-0.685841) A. The 0.1V endpoint is finite; singular derivative at zero initial guess does not change this circuit solution. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Both sweeps complete 10 points. I(VIN) goes from -4.851108632089914A at 0.1V to -1.0000000000000002A at 1V; max error versus -c^(-0.685841) is 8.89e-16A. See analytic_check.txt. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | unsupported | Original: UnsupportedControlCommandError 'pre_set'; dot-card variant: Error Unknown function 'V' (voltage-dependent resistor not accepted). |

Reproduces on ngspice-47: no. Check: At VCONTROL=0.1 current should be -0.1^(-0.685841), reaching -1A at 1V, with no pow error.

Notes: Constant-exponent derivative issue no longer aborts ngspice-47.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
