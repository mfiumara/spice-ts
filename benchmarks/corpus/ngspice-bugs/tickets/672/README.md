# ngspice bug #672: Undefined Parameter Cannot compute substitute

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/672/ (status `open`, opened 2024-04-24)
- Category: frontend-ui
- Outcome: defect not reproduced on ngspice-47

## Decks

Origin: attachment netlist.cir.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`netlist.cir`](netlist.cir) (1173 B, sha256 `f5f1b22591b434c862b2a607c70080e25134e4f0856f9229156aaac9f506d215`)
- [`no_missing_include.cir`](no_missing_include.cir) (1077 B, sha256 `1901112a83697cf41ac37c19b10504d61f0c5409b1a8c3744043d60cca7b20cc`)

Ticket attachments:

- [Screenshot 2024-04-24 202902.png](https://sourceforge.net/p/ngspice/bugs/672/attachment/Screenshot%202024-04-24%20202902.png) (13973 B, sha256 `c5d53d6e240c8e19c2015b47a09a9267bffc21a9f2475c9ddc1a0bd7f0dc831c`)
- [netlist.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/fbf3baf6da/7c18/attachment/netlist.cir) (1173 B, sha256 `f5f1b22591b434c862b2a607c70080e25134e4f0856f9229156aaac9f506d215`)
- [log.txt](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/fbf3baf6da/ad58/attachment/log.txt) (270 B, sha256 `2c4546c26a78c08aaefd14d9754720cc3528b709c5e359928511083ad7e7f935`)
- [swp.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/fbf3baf6da/baaf/attachment/swp.png) (85278 B, sha256 `cccddfb2ba61755a56f0991df0a8dd06dab5fea78a66982072c648048140f303`)
- [tran.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/fbf3baf6da/baaf/attachment/tran.png) (95177 B, sha256 `9a3e9b8ebb9e15a660bdd6c5739828ea5af1b1bc57c7ec12beb5709368c8c887`)
- [Screenshot 2024-04-29 123350.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/fbf3baf6da/32aa/attachment/Screenshot%202024-04-29%20123350.png) (42768 B, sha256 `dee221c545288c27fe149b043a88344e42fc55f11f594994038b809317e1dba0`)
- [Bildschirmfoto vom 2024-04-29 14-37-15.png](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/fbf3baf6da/a614/attachment/Bildschirmfoto%20vom%202024-04-29%2014-37-15.png) (113053 B, sha256 `97b0f90e7c3a7a153a8fbcd8379da31a9f72ed4212cb8b185526f3f4c0fa1c18`)

Edits relative to the ticket: no_missing_include.cir removes only missing, irrelevant ngspice_mathfunc.inc include.

## Expected answer

The original deck references RL in the netlist but defines it only using control-language let after op. A later plot vector cannot define a netlist .param, so undefined RL is the correct diagnostic; 10 kOhm is also not the contiguous numeric token 10kOhm. (basis: documented-semantics)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | right | Original missing Windows include; permitted variant errors Undefined parameter [rl] / Cannot compute substitute. |
| ngspice master | not-run | not re-run on master: the defect does not reproduce on ngspice-47 |
| spice-ts | right | Permitted variant: ParseError Undefined parameter 'RL'; original needs include resolver. |

Reproduces on ngspice-47: no. Check: After dropping irrelevant missing include, Undefined parameter [rl] is expected before any analysis.

Notes: Qucs-S generated an incomplete/incorrect parameter declaration; no simulator correction justified.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
