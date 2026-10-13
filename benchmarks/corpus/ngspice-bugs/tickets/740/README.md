# ngspice bug #740: Simulation Failure After Splitting a Resistor

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/740/ (status `open`, opened 2025-02-23)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: attachments circuit.cir, split.cir, zener.lib (248 KB vendor library).

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 740`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/740/` and verifies the hashes):

- `circuit.local.cir` (492 B, sha256 `a18b6128cea261021ee3559e3c2b8e89606e6d3d25ee3170e51f0b544eab98d7`)
- `split.local.cir` (519 B, sha256 `a3469bd544200122a6c14bbc4151e83fc6a959b7f84ca82a1a72fc63fb5d315c`)

Ticket attachments:

- [circuit.cir](https://sourceforge.net/p/ngspice/bugs/740/attachment/circuit.cir) (565 B, sha256 `6ff59222570b56a4c0be2e88443517681610886d8c29268c6e65c9872db4290f`)
- [split.cir](https://sourceforge.net/p/ngspice/bugs/740/attachment/split.cir) (591 B, sha256 `fdd7343855c107feeae30e8f01900f631adb6ec970c888fc184d625df1a3e502`)
- [zener.lib](https://sourceforge.net/p/ngspice/bugs/_discuss/thread/74172ae127/fe8f/f7d1/attachment/zener.lib) (248261 B, sha256 `3d2df1d6cf28a21f84965a37718a2b6531092b0686919fa189ccacda5d7fc194`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The two netlists are electrically equivalent (series split of an element / extra element on an open or already-defined node), so a correct simulator must produce the same waveforms for both; converging on one and failing on the other is a numerical failure of the solver, not a property of the circuit. Here the netlist also has no ground node; every node is tied to ground only through .options rshunt=1G, so the split's extra node NewPin14 adds one more 1 GOhm shunt and the DC current shifts slightly (ngspice-47 operating point i(V1) = -1.959222e-8 A for circuit, -1.973652e-8 A for split). The source is DC, so each deck must complete and hold its operating point. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | Both variants now fail: circuit: "Timestep too small; time = 1.90129e-12 ... node net-_l1-pad1_"; split: same at 3.04931e-13 s. Identical in LTPS mode. |
| ngspice master | hang | circuit: "Timestep too small; time = 2.48364e-12 ... node net-_l1-pad1_", aborted; split: exceeds the 120 s bound (exit 142) in both modes. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | right | Both decks complete: circuit 120 rows to 10 ns, split 1011 rows to 100 ns. The t=0 i(V1) matches ngspice-47's operating point to 3e-8 relative on both (-1.959222e-8 and -1.973652e-8 A), and i(V1) holds it: within 0.04% (circuit) and 0.02% (split) after 1 ns. In the first 10 ps (ps-sized steps across the 211 nF/696 nF capacitors) round-off in C dV/dt moves the 20 nA current by up to 2.7% (circuit) and 0.2% (split). [spice-ts with .options rshunt (#824), simulate() on the same *.local.cir bytes with a filesystem include resolver] |

Reproduces on ngspice-47: partially. Check: Both circuit.local.cir and split.local.cir abort with Timestep too small (ticket: only split failed on ngspice-43).

Notes: The ticket claim (original OK, split fails) does not hold on ngspice-47: both fail. Developer suggests .options rseries for the inductors.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
