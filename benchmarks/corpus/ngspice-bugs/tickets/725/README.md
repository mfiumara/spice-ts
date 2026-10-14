# ngspice bug #725: Different solvers are used for the same circuit design file, and different results are produced

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/725/ (status `open`, opened 2024-12-17)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts cannot run the deck (feature unsupported)

## Decks

Origin: post by h_vogt 2024-12-17 minimal open-switch reproducer.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Committed:

- [`switch_original.cir`](switch_original.cir) (158 B, sha256 `fbb92d52ed098fcadcf9199c0c6e75a0b1bd72042587b33ee29579e9d414b5cb`)
- [`klu.cir`](klu.cir) (144 B, sha256 `2541df150cd5e68fb3520be2c1f2f88ab27dc4ea5c1ffa2d29811c6550f47e54`)
- [`sparse.cir`](sparse.cir) (147 B, sha256 `00a6e14b8441657fffb619b29a0690229c245dbea12f1ebc61df6aca0dee8252`)

Ticket attachments:

- [20241114182415.log](https://sourceforge.net/p/ngspice/bugs/725/attachment/20241114182415.log) (2205 B, sha256 `04222eadf797543fe313672e070e214c4f690463eedfe20e621c6e85836a84a2`)
- [20241114182415-klu.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/4a83cdaa97/2fa4/attachment/20241114182415-klu.cir) (11887 B, sha256 `a0ee938e9fc147d5b42ab3624e288f7287591d3981c64026dca59fdfdc1c4815`)
- [20241114182415-klu.log](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/4a83cdaa97/2fa4/attachment/20241114182415-klu.log) (2205 B, sha256 `04222eadf797543fe313672e070e214c4f690463eedfe20e621c6e85836a84a2`)
- [20241114182415-klu.raw](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/4a83cdaa97/2fa4/attachment/20241114182415-klu.raw) (0 B, sha256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)
- [20241114182415.cir](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/4a83cdaa97/2fa4/attachment/20241114182415.cir) (11873 B, sha256 `28ccff30b62d7c96434b3db0fc191275a809a590b0de69e194439a367276a298`)
- [20241114182415.log](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/4a83cdaa97/2fa4/attachment/20241114182415.log) (2205 B, sha256 `04222eadf797543fe313672e070e214c4f690463eedfe20e621c6e85836a84a2`)

Edits relative to the ticket: Preserved malformed large attachments without running them; transcribed developer minimal deck, converted control op into .op, and added required solver-only variants.

## Expected answer

The switch connects ground to ground, so its branch voltage/current are zero irrespective of state; V(1)=1 V. Both floating control-node voltages are unconstrained. A solver may diagnose singular controls or assign a gauge, but must never crash. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Control original KLU op exits0; equivalent dot .op KLU reports internal error -- bus error (exit1). Sparse dot .op exits0 with controls0 and V(1)=1. |
| ngspice master | right | Fixed on master: the KLU switch_original deck exits 0 with an OP result; ngspice-47 segfaults (exit 139) on the same command. [ngspice pre-master-48 HEAD 3ef069fb (2026-10-09), built in scratch] |
| spice-ts | unsupported | #812 refresh d8ab9d33: both pinned solver variants first fail at ParseError line 2, Unsupported .options field klu/sparse. Native ngspice-47 completes both OP variants. Execution loss; no spice-ts metrics. Existing #812 solver-selection bucket. |

Reproduces on ngspice-47: partially. Check: The dot-card klu.cir reports internal error -- bus error; command-based switch_original.cir does not on this build.

Candidate upstream fix: Safely handle absent/floating switch-control matrix entries in KLU setup/loading; do not dereference missing bindings.

Notes: Primary supplied netlist has malformed/missing models and floating internal subcircuits; developer provided this valid minimal crash-focused case. No physical output exists for floating control potentials.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
