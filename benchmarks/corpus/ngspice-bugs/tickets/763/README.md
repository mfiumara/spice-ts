# ngspice bug #763: Splitting a Resistor  Affects Simulation Convergence

Generated from `../../manifest.json` by `render.ts`; do not edit by hand.

- Ticket: https://sourceforge.net/p/ngspice/bugs/763/ (status `open`, opened 2025-03-21)
- Category: simulator-numerics
- Outcome: ngspice defective, spice-ts correct

## Decks

Origin: attachments netlistwithR5.cir, ResistorSplitR5.cir + vendor libraries.

Licence: the decks were posted publicly on the ngspice SourceForge bug tracker by the ticket author, without an explicit licence. Only small, user-authored decks are committed here, as quotations for the purpose of reproducing the bug report; vendor model libraries, PDK files and large attachments are not committed and are fetched from the tracker by `../../fetch.ts`.

Not committed (fetch with `pnpm exec tsx benchmarks/corpus/ngspice-bugs/fetch.ts 763`, which downloads the ticket attachments into the git-ignored `benchmarks/corpus/ngspice-bugs/fetched/763/` and verifies the hashes):

- `netlistwithR5.local.cir` (1170 B, sha256 `dd28ac887421cc96090aed6950496f794978ce3195141704b70a99cd7d9e2c3b`)
- `ResistorSplitR5.local.cir` (1198 B, sha256 `bd2a1a97e8550a7d606443b729555d8e30acbb906560b623994289f06e3fdff6`)

Ticket attachments:

- [IGBT.LIB](https://sourceforge.net/p/ngspice/bugs/763/attachment/IGBT.LIB) (98494 B, sha256 `8636692f62226b9fb23bdc6b157617b748c19bb698547987b04f1bcd70d3c336`)
- [ResistorSplitR5.cir](https://sourceforge.net/p/ngspice/bugs/763/attachment/ResistorSplitR5.cir) (1468 B, sha256 `46fa7a5f49fd676af1a361ad848c95b37972239814003c7266bd266b4ddcc61e`)
- [diode.lib](https://sourceforge.net/p/ngspice/bugs/763/attachment/diode.lib) (52757 B, sha256 `4f07396942f9fa67d623899d6904636fa4a5be596d413ed863bc6e2b63a2e01d`)
- [led.lib](https://sourceforge.net/p/ngspice/bugs/763/attachment/led.lib) (42 B, sha256 `d63ddf8cde6d2a97aa4f2ed5ac6c51a4bbaa302d55a6207027b5dfad5fdd633a`)
- [netlistwithR5.cir](https://sourceforge.net/p/ngspice/bugs/763/attachment/netlistwithR5.cir) (1441 B, sha256 `9dea46c26dd88a623c3fcaca43d05822b26fc0b22209fcaa3db9a14d6ec2027e`)
- [zener.lib](https://sourceforge.net/p/ngspice/bugs/763/attachment/zener.lib) (248261 B, sha256 `3d2df1d6cf28a21f84965a37718a2b6531092b0686919fa189ccacda5d7fc194`)

Edits relative to the ticket: Absolute Windows .include/.lib paths (D:/spice_lib/...) rewritten to the attached library file of the same basename (*.local.cir); deck otherwise unchanged. ngspice run as `ngspice -b -r out.raw deck` in default mode and with `set ngbehavior=ltps` in a local .spiceinit.

## Expected answer

The two netlists are electrically equivalent (series split of an element / extra element on an open or already-defined node), so a correct simulator must produce the same waveforms for both; converging on one and failing on the other is a numerical failure of the solver, not a property of the circuit. (basis: first-principles)

## Results

| Engine | Verdict | Evidence |
|---|---|---|
| ngspice-47 | error | netlistwithR5: completes, 108 rows; ResistorSplitR5 (R5 split in two): "Timestep too small; time = 2.00081e-11 ... trouble with node net-_d2-k_", aborted. Same in LTPS mode. |
| ngspice master | error | Now both fail: ResistorSplitR5 "Timestep too small; time = 2.00049e-11 ... xq1:mfin-instance m.xq1.m1"; netlistwithR5 "Timestep too small; time = 9.03394e-11 ... node net-_d2-k_" (it completed on 47). Same in LTPS. [ngspice pre-master-48 HEAD 3ef069fb, same command as 47, default and LTPS] |
| spice-ts | right | Both decks complete to 100 ns (105 and 104 rows) and agree: interpolated onto each other's timepoints, i(V1) differs by a median 9.7e-13 A (2e-6 relative) and at most 1.12e-9 A (0.2%, the netlistwithR5 point at 10.02 ps) (t=0: -5.649621e-7 A on both, equal to ngspice-47's operating point). Against ngspice-47's complete netlistwithR5 run (108 rows) the spice-ts netlistwithR5 i(V1) differs by a median 4.3e-13 A and at most 1.06e-9 A (0.19% of \|i(V1)\|, one step after the 10 ps first step). [spice-ts with .options rshunt (#824), simulate() on the same *.local.cir bytes with a filesystem include resolver] |

Reproduces on ngspice-47: yes. Check: ResistorSplitR5 aborts at t=2e-11 s while netlistwithR5 completes.

Candidate upstream fix: NEW on master: netlistwithR5 (the variant that completed on ngspice-47) now also aborts with Timestep too small, so master regressed on this deck. Not yet reported upstream.

Engines: ngspice-47 = ngspice-47 (Homebrew build, KLU), `ngspice -b [-r out.raw] <deck>`; master = ngspice pre-master-48 HEAD 3ef069fb1f04177a153f342a32d941fc20ff047e (2026-10-09, "Fixes bug 876"), configure --with-x=no --disable-debug --enable-xspice --enable-osdi --with-readline=no --disable-openmp; spice-ts = @spice-ts/core 0.3.0 at main 45d6ea73, simulate(<deck>) with a filesystem include resolver.
