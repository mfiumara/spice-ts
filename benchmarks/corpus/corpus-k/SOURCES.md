# corpus-k provenance and selection (#980)

Accepted source: Xyce Regression Suite, https://github.com/Xyce/Xyce_Regression at `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`, SPDX `GPL-3.0-or-later`.

Redistribution basis: the repository README Copyright and license section grants GPL version 3 or later with the NTESS copyright notice. Retained byte-identically in `licenses/xyce/README.md`. The upstream README links a COPYING file that is absent at this revision; the unmodified GPLv3 text is retained in `licenses/xyce/GPL-3.0.txt`, copied from the already-vendored corpus-j eSim GPL text. These fixtures retain the suite grant, not the spice-ts package licence. No licence is inferred from availability alone. The selected decks have no separate copyright/licence notice, no third-party include library and no dependencies. MCNC process parameters are inline original suite data, not newly fetched vendor models.

Selection was fixed before either engine ran. All 18 novel, statically eligible standalone decks in `Netlists/CircuitSim90/MOS2/`, plus the two novel open-loop op-amp and Hartley oscillator decks, are retained. Related variants are original upstream files, not generated padding. Every exact-byte and terminal-newline-stripped hash is compared with all existing public fixture directories, including corpus-h and corpus-j. No tolerance tuning, fixture edits, analysis removal, engine-success filtering or ngspice probe. One both-engine convergence failure is deliberately retained. 20 accepted original decks, 19 successful ngspice-47 references. This is a CMOS/textbook/oscillator expansion, not a new ISCAS/PLL/SMPS claim.

## Fresh source surveys

`survey-current.json` records all 509 candidates under ngspice's examples at SourceForge revision `36fb6f51ff125f19ea8b36bda6ebe47dcc87a263` (https://sourceforge.net/p/ngspice/ngspice/ci/36fb6f51ff125f19ea8b36bda6ebe47dcc87a263/tree/). Current COPYING lines 14-15 grant Modified BSD for test/example files outside its exceptions, but individual vendor notices are not overridden. Retained licence in `licenses/ngspice/COPYING` (the licence document itself is CC-BY-SA-4.0). None selected: 274 already in the corpus, 176 external-input-dependent, 29 host-command, 27 no-analysis, 3 separate-licence notices. No deck bytes from rejected sources are vendored.

Concrete rejected app-note/model cases: `examples/TransImpedanceAmp/output.net` says Copyright 1993 Analog Devices; `examples/tclspice/tcl-testbench3/FB14.cir` says Copyright Symmetry Design Systems; `examples/vdmos/IXTH80N20L-IXTH48P20P-quasisat.sp` has a David Zan notice. Repository-wide BSD is not presumed to cover them. ISCAS-85 KLU examples and IHP ring oscillator decks need cell/PDK libraries, so are excluded under the unchanged self-contained rule. No flattened/retargeted MOS1 variants are invented to fill this batch.

`survey-xyce.json` records all 4,133 candidate decks at the pinned Xyce revision. 20 accepted; 4,113 not selected: 157 duplicate corpus bytes, 25 separate-licence notices, 610 external-input-dependent, 306 no-analysis, and 3,015 statically eligible but deferred by the explicit batch scope. Deferred is not a licence rejection or an engine failure. Full path/hash/verdict receipts are retained in the surveys and manifest exclusions. Licence-cleared candidate does not mean ngspice-compatible.

## Previously surveyed sources, not claimed as fresh checks

KiCad QA and demo licensing and netlist availability were reviewed in [corpus-h/SOURCES.md](../corpus-h/SOURCES.md); QA is GPL-3.0-or-later, demo exceptions CC-BY-SA-4.0. Generating schematic exports would change the input boundary and is not used here. eSim PLL/CMOS/PWM examples and their vendor/PDK includes were reviewed in [corpus-j/SOURCES.md](../corpus-j/SOURCES.md). That prior survey yielded no novel standalone eSim candidate. Vendor PDFs/textbook pages with no redistribution grant are not copied. These are prior-source exclusions rather than fresh downloaded sources or part of the numerical candidate counts above.

## Reproduce

From repository root:

1. `git clone https://git.code.sf.net/p/ngspice/ngspice benchmarks/corpus/corpus-k/.upstream-current`, then checkout `36fb6f51ff125f19ea8b36bda6ebe47dcc87a263`.
2. `git clone https://github.com/Xyce/Xyce_Regression benchmarks/corpus/corpus-k/.upstream-xyce`, then checkout `7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2`.
3. `pnpm exec tsx benchmarks/corpus/corpus-k/survey.ts current` and `pnpm exec tsx benchmarks/corpus/corpus-k/survey.ts xyce`. Reingestion intentionally checks novelty against the then-current fixture inventory, so later batches can change eligibility.
4. `pnpm exec tsx benchmarks/corpus/corpus-k/ingest.ts`.
5. `pnpm build && spice-heavy pnpm exec tsx benchmarks/corpus/corpus-k/parity.ts`.
6. `pnpm exec tsx --test benchmarks/corpus/corpus-k/corpus-k.test.ts` for offline evidence/hash/metric verification.

The engine adapters and metric are corpus-f's, imported unchanged; reduction is corpus-j's; tables and totals are corpus-h's `parityReport`. The only new runner logic is corpus-k process ownership, serial orchestration, local persistence and error-line issue bucketing. Fixture SHA-256 is verified in each engine child. Both adapters receive identical original bytes; ngspice's output-only setup is the shared adapter's. Per-fixture cold wall receipts and matched-point max/RMS absolute/relative errors are in outcomes.json. Uniform deadline 119 seconds per engine group. No timeout occurred. The CLI records engine failure rather than discarding the fixture. No fine-TMAX adapted deck is used.

## Per-file provenance

Every fixture's source URL, SHA-256, original byte length, licence and empty include closure are in [manifest.json](manifest.json). A per-deck licence/source table is added to [benchmarks/SOURCES.md](../../SOURCES.md). All observed losses, including e1480's ngspice initial-timestep failure, are in README.md and outcomes.json. Gaps after all-state duplicate search: MOS2 series resistance #982 (14 fixtures, 13 reference successes) and MAXORD=1 #983 (1 reference-backed loss).
