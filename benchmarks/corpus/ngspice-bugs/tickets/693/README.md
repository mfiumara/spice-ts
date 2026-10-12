# ngspice bug #693: Behavior of subcircuit multiplicity does not match documentation

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/693/ (status `open-accepted`, opened 2024-09-18)
- Category: parser
- Outcome: ngspice defective, spice-ts also wrong
- spice-ts issue: https://github.com/mfiumara/spice-ts/issues/810

## Decks

Origin: inline in description.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`original.cir`](original.cir) (374 B, sha256 `41a79679fb5ffdc233df0e168a8727e57d1d99043915d3c72c5e55090bf81b9e`)
- [`original_cards.cir`](original_cards.cir) (339 B, sha256 `4c852c178d73c800f9c3f571bb64c2b77de82ff3b42e670e83dd8c4464a741bb`)
- [`cases123_cards.cir`](cases123_cards.cir) (270 B, sha256 `cd276edad565e71f7618e9b806eed3715891cd23bdb07cd314c6760849472b2c`)

Edits relative to the ticket: original_cards.cir replaces .control with .op/.print op voltages. cases123_cards.cir keeps only cases 1-3 of the ticket deck (drops the two subcircuits that declare a parameter named m), so spice-ts can run it.

## Expected answer

m parallel 1-ohm resistors have equivalent resistance 1/m. The inherited m=5 must multiply the internal m=2, giving effective m=10 and V(3)=-1A*(1/10 ohm)=-0.1V; V(1) and V(2) also equal -0.1V. Explicit formal m is an ordinary parameter, giving V(4)=-0.1V and V(5)=-1V without automatic inheritance. (basis: analytic)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | wrong | V(1)=-0.1, V(2)=-0.1, V(3)=-0.2, V(4)=-0.1, V(5)=-1. cases123_cards.cir: v(1)=-0.1, v(2)=-0.1, v(3)=-0.2. cases123_cards.cir: v(1)=-0.1, v(2)=-0.1, v(3)=-0.2. |
| ngspice master | wrong | Identical to 47 on both decks: v(3)=-0.2 V (expected -0.1 V). [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | wrong | cases123_cards.cir: v(1)=-0.1, v(2)=-1 (expected -0.1: instance m=10 ignored), v(3)=-0.5 (expected -0.1: only the inner m=2 is applied). The full deck is rejected: "Error: Cannot parse number: 'm'" (subcircuit parameter named m). |

Reproduces on ngspice-47: yes. Check: V(3)=-0.2V rather than -0.1V shows inherited multiplicity overrides rather than multiplies internal m.

Candidate upstream fix: Multiply existing device m by inherited X-line m when m is not a formal subcircuit parameter; scope recursion needs repair.

Notes: Both engines are wrong on case 3 (ngspice uses only the instance m, spice-ts only the inner m); spice-ts also ignores the instance m on case 2.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
