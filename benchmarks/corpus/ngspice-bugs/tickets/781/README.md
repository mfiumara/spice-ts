# ngspice bug #781: VDMOS clamps/saturates output to 770V

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/781/ (status `open`, opened 2025-04-16)
- Category: docs
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (396 B, sha256 `6c9ecbed81c441ca05570c70d7f14a13e2cd32480ebefc1e3aad2f0e7ca23b96`)

Ticket attachments:

- [Screenshot 2025-04-16 225417.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/d1bd/9352/attachment/Screenshot%202025-04-16%20225417.png) (89212 B, sha256 `fc710c4a864b95867267fc149caa6502c40998a975770a2ac2d5d3dddc691d6a`)
- [Screenshot 2025-04-17 174508.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/7c7a/attachment/Screenshot%202025-04-17%20174508.png) (68344 B, sha256 `c118317d18e8cb635b145023c50da28b7def2b458ecc0c0fc6d153181a395eb3`)
- [Screenshot 2025-04-17 201353.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/b743/attachment/Screenshot%202025-04-17%20201353.png) (50495 B, sha256 `d4f5d705b3162ec75b96ff17274bb00e925dd71258d0dfcf19effdd1f4cb55d0`)
- [Screenshot 2025-04-17 205954.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/b743/8a1e/attachment/Screenshot%202025-04-17%20205954.png) (78881 B, sha256 `307db623d89d6857c24d362294ff7b53657d343212deff40ad07cc8ac63d5512`)
- [boost_test.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/b743/8a1e/attachment/boost_test.cir) (351 B, sha256 `beae3f888a6d2a8a09d1f450cb86518158d20a3f9d99ab99301a4b0a4e1329d4`)
- [ltspice_default_Cs.PNG](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/b743/2642/attachment/ltspice_default_Cs.PNG) (27586 B, sha256 `a816956320ff98af61e24c8bd8eb49cfac2751bb97afd4d606f7cdba87d8271c`)
- [ngspice_default_Cs.PNG](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/468731ab0a/b743/2642/attachment/ngspice_default_Cs.PNG) (82558 B, sha256 `58fd207c3e85ca166f25165974669002acee7a51cb9e86df92480d8a6f797d77`)

Edits relative to the ticket: none

## Expected answer

undetermined: 1950V does not follow from an ideal CCM boost formula for this resonant/discontinuous circuit with default Cjo/Cgd/Cgs. Charge and energy conservation include MOSFET capacitance and body-diode recovery; changing to zero-capacitance MOS1 changes the circuit, so different output is not proof of a defect. (basis: undetermined)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | hang | 120s alarm terminates ngspice (exit=142); last reference time about 0.014801s, no completed output waveform. |
| ngspice master | not-run | not re-run on master: see ngspice47 column |
| spice-ts | unsupported | ParseError Unsupported .options field: 'savecurrents'. |

Reproduces on ngspice-47: n/a. Check: Full 15ms run must finish before any claimed final Vout can be compared; this bounded run stops at approximately 14.8ms.

Notes: Exact original 1ns max-step/15ms deck exceeds 120s helper limit; no shortening or device parameter changes allowed. Ticket explains capacitor defaults and CCM/resonant mismatch, not a proven numerical clamp.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
