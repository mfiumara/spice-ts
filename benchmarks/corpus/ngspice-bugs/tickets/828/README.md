# ngspice bug #828: sqrt of negative numbers

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/828/ (status `open`, opened 2026-02-12)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: attachments foo.cir and sqrt_neg.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`foo.cir`](foo.cir) (54 B, sha256 `cccfbcb5043759a4bc96b978c7126b8d0a753d2f33dd1a74518f8830393b4a16`)
- [`sqrt_neg.cir`](sqrt_neg.cir) (700 B, sha256 `d765a8543e113d736169c389456bc3bd1177cea708d98e8e32ac3635aa64dab6`)
- [`sqrt_neg_cards.cir`](sqrt_neg_cards.cir) (690 B, sha256 `80e64fb4779dcec3af382b12a8b98a83809eff6d84e679d7dd80d670433e0378`)

Ticket attachments:

- [foo.cir](https://sourceforge.net/p/ngspice/bugs/828/attachment/foo.cir) (54 B, sha256 `cccfbcb5043759a4bc96b978c7126b8d0a753d2f33dd1a74518f8830393b4a16`)
- [sqrt_neg.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/67469a0b16/8415/attachment/sqrt_neg.cir) (700 B, sha256 `d765a8543e113d736169c389456bc3bd1177cea708d98e8e32ac3635aa64dab6`)

Edits relative to the ticket: sqrt_neg_cards.cir replaces .control with .op/.print op all. Deck text otherwise unchanged; native, ps and lt configured externally via local .spiceinit.

## Expected answer

Ordinary real sqrt(-4) has no value, so native mathematical-domain rejection is valid. Documented compatibility extensions instead prescribe PSpice sqrt(abs(-4))=2 (thus y=5), and LT negative sqrt=0 (thus y=3); these are extensions, not real square roots. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | Native -2/-4 out of range for sqrt; confirmed ps and lt modes both -4 out of range, no y result. |
| ngspice master | wrong | Identical to 47: "Error: -4 out of range for sqrt" under the compatibility-mode .spiceinit. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | spice-ts has no PSpice/LTspice compatibility mode, so the documented ps/lt sqrt extensions the ticket is about cannot be exercised. In native mode spice-ts rejects sqrt(-4) (InvalidCircuitError: Behavioral expression ... out of range for sqrt), the same as native ngspice; that is mathematically valid but not the case under test. |

Reproduces on ngspice-47: yes. Check: In confirmed ps/lt modes, sqrt_neg.cir errors -4 out of range instead of returning y=5/y=3 respectively.

Notes: Native ngspice and spice-ts both reject negative sqrt, mathematically correct; spice-ts compatibility modes were not exercised, so no spice-ts wrong-result issue. Manual native abs wording conflicts with code/ticket patch; this verdict concerns documented vendor compatibility only. Suggested patch already present. CLI --ngbehavior=ps is unrecognized; actual modes tested via local .spiceinit, and output confirms selected ps/lt. Coordinator: spice-ts verdict set to unsupported (not right) because the defect is compat-mode specific and spice-ts has no compat modes.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
