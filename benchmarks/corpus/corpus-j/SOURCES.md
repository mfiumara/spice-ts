# corpus-j source survey (#940)

Current catalogue: 20 original fixtures. The historical 11-fixture survey below is preserved; the appended nine-fixture delivery is documented in the Part 2 section and PART2.md. Historical generation commands below reproduce only the original batch and must not overwrite the appended manifest or receipts.

Partial artifact: 11 novel original-input hashes, not the requested 20. No engine-success filter, byte adaptation, tolerance tuning or derived padding. None has an ngspice-47 reference in the recorded run: all 11 are both-failed. This is not measured correctness-parity expansion. The two independently authored upstream mc() AC-filter variants are retained verbatim, not constructed variants or deterministic waveform evidence.

## Sources and redistribution

- SpiceSharpParser: https://github.com/SpiceSharp/SpiceSharpParser at 8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7. MIT repository-wide grant; original copyright notice retained verbatim in licenses/spicesharpparser/LICENSE. Nine LTspice A-device examples (PLL, phase detector, clock divider, DFF, latch, OTA, varistor, modulator, sample/hold), and two AC-filter examples. No vendor libraries or nested third-party notices are redistributed.
- FOSSEE eSim: https://github.com/FOSSEE/eSim at 1a25a46ce15e0ccc35296dd513f40249c089a5a7. GPL-3.0-only per README and LICENSE (retained in licenses/esim/LICENSE). Survey only; no eSim deck is committed. fetch-esim.py names 24 .cir/.cir.out pairs plus 17 PLL/mixed-signal/adder decks. All 65 candidates were duplicate, no-analysis, or not self-contained. PLLs require absolute IHP PDK paths; other classics need diode/BJT/vendor companions. Uncertain redistribution closures are excluded, never bundled.
- The earlier ngspice survey was inspected, but heterogeneous COPYING explicitly warns against assuming one repository licence; no uncertain-licence fallback deck was admitted. No KiCad schematic export or derived adaptation was used to fill the batch. Existing KiCad text decks at the historical pin were already surveyed by corpus-h/i; this artifact does not claim a fresh KiCad survey.

## Reproduce from repository root

Set TMPDIR to the profile scratch directory, then:

    python3 benchmarks/corpus/corpus-j/fetch-esim.py
    git clone https://github.com/SpiceSharp/SpiceSharpParser "$TMPDIR/940-spicesharpparser"
    git -C "$TMPDIR/940-spicesharpparser" checkout 8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7
    pnpm exec tsx benchmarks/corpus/corpus-j/select.ts "$TMPDIR"
    pnpm build && pnpm lint
    spice-heavy pnpm exec tsx benchmarks/corpus/corpus-j/parity.ts
    pnpm exec tsx --test benchmarks/corpus/corpus-j/corpus-j.test.ts

Selection scans pinned git paths/blobs and the explicitly fetched eSim paths, comparing exact and terminal-newline-stripped hashes against every other benchmarks/corpus/*/fixtures directory. No engine is run during selection. It uses corpus-h static rules unchanged plus a scoped PWL-file exclusion: Example12.cir needs unbundled Resources companion data, missed by the inherited classifier. Full exclusion hashes and reasons are in manifest.json. No excluded deck/model contents are committed.

## Selected original inputs

| Original path / pinned revision URL | SPDX | SHA-256 | Include closure |
|---|---|---|---|
| [circuits/a-devices/clock-divider.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/clock-divider.cir) | MIT | 46785a9acadef21a91c8f14c99f9999e6774b36a58263b6bf2518c809ba17cef | empty; standalone |
| [circuits/a-devices/controlled-clamp-varistor.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/controlled-clamp-varistor.cir) | MIT | 2fd0325400b0fcbf641cb592a262b2db790435cb023066ae69402f31eb2db35b | empty; standalone |
| [circuits/a-devices/edge-capture-dff.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/edge-capture-dff.cir) | MIT | 73be54f60495068e0b578c5fffd36f4a3e6bc14194e377646b641b4934a5f33d | empty; standalone |
| [circuits/a-devices/fm-modulator.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/fm-modulator.cir) | MIT | 3b92619ee8c5d496162d74a3a1992a57558148f436385b63b8d0560d665c1872 | empty; standalone |
| [circuits/a-devices/non-ground-common-latch.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/non-ground-common-latch.cir) | MIT | 9d1c9e9bdf4b35118ae86adfbf66a0dd16923aadc9bddc82f18d634a987c0f30 | empty; standalone |
| [circuits/a-devices/ota-current-limiter.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/ota-current-limiter.cir) | MIT | be70720fd2ca337d4ab660cacf1822c563d932aab66d8be0ba81fc38c6fc3bbd | empty; standalone |
| [circuits/a-devices/phase-detector.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/phase-detector.cir) | MIT | 6c779b3f2fe7971bd2749c6912fa60bd9a4a621333b656bf26820ccd0f5302d9 | empty; standalone |
| [circuits/a-devices/sample-and-hold-sensor.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/a-devices/sample-and-hold-sensor.cir) | MIT | aae914c122cdec4119a231d7be889177488acc31669282db9dc355299f6caf05 | empty; standalone |
| [circuits/cookbook/custom-components/simple-pll/simple-pll.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/circuits/cookbook/custom-components/simple-pll/simple-pll.cir) | MIT | ae639d3543054e4513a6e38d08ffb2c853e3fc35e2886dd200eb1be078afed0e | empty; standalone |
| [src/SpiceSharpParser.IntegrationTests/Examples/Circuits/band-pass_1.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/src/SpiceSharpParser.IntegrationTests/Examples/Circuits/band-pass_1.cir) | MIT | 8a0a1412fc81e9bbd9dd275f9c940dd3b4511a7019453160d606dd4deb8f07a8 | empty; standalone |
| [src/SpiceSharpParser.IntegrationTests/Examples/Circuits/band-pass_2.cir](https://github.com/SpiceSharp/SpiceSharpParser/blob/8fc01560fe303eeebaeb5cbf5edfe77bf635e1c7/src/SpiceSharpParser.IntegrationTests/Examples/Circuits/band-pass_2.cir) | MIT | f3aa8d1724051cbc95f06133948e6c96cc46ee37e81eff591d4e882beabfeeaf | empty; standalone |

## Inspected exclusions

- already-in-corpus-or-batch: 34
- no-analysis: 29
- not-self-contained: 34

97 total; exact source/path/hash/detail for each is in manifest.json. Retained fixture and licence bytes are checked against pinned git blobs; URLs alone do not establish identity.

## Loss observations for supervisor deduplication

- j-1..j-9: inline LTspice A-device syntax is not ngspice XSPICE .model syntax. spice-ts reports unknown model names (last inline numeric value), ngspice rejects A-cards; simple-pll also reports unsupported if(). Cross-dialect rejection is not proof of a simulator regression on runnable ngspice input.
- j-10/j-11: mc() unsupported in the original decks by both engines; j-11 also carries .step. No random-realization or expression rewrite is used to force comparison.
- Outcomes: matched=0, mismatch=0, not-compared=0, spice-ts-loss=0, ngspice-failed=0, both-failed=11. ngspice=8 failed/3 unsupported/0 success; spice-ts=11 unsupported/0 success.

No new issues filed. No paired samples means empty metrics/null worst error, not measured zero error. Detailed matched-point max/RMS absolute/relative receipts use the unchanged shared comparison metric whenever available. The wrapper reuses unchanged corpus-f packed engine runners/reducers and corpus-h summarization/rendering, with serial owned groups and persisted wall reservations. No daytime aggregate refresh; incorporation is deferred to nightly #855.

## Part 2: nine further original inputs

Four ngspice-native examples and five original spicelib example/test decks. Every exact and terminal-newline-stripped hash is absent from all other corpus fixture directories. Earlier excluded candidates are eligible here, but already admitted fixtures are not. No golden expected outputs, generated deck variants or vendor libraries are included. Five new decks produce ngspice-47 raw output; the four ngspice failures remain published rather than replaced. This is input-hash novelty, not a claim of nine new circuit topology families.

- ngspice at `a80f6e3e95d51534905b1f23410a951802666656`: `COPYING` explicitly adopts Modified BSD for all source, test and example files except the listed exception paths (lines 14-15). All four paths below are outside those exceptions. SPDX BSD-3-Clause. Complete byte-identical `COPYING` retained at `licenses/ngspice-current/COPYING` (the licence document itself is CC-BY-SA-4.0). Generic inline example models only, no vendor libraries. This explicit current licence grant supersedes the earlier survey's uncertainty for these selected paths, not for arbitrary third-party content.
- spicelib at `d8f8ecceeb361741f1f660f03b03ac49697f8700`: repository LICENSE, README and pyproject state GPLv3; no or-later grant. SPDX GPL-3.0-only; complete byte-identical `licenses/spicelib/LICENSE`. Only original `examples/testfiles/` decks; no machine-edited `unittests/golden/` variants. The KiCad-named example is an already committed original netlist, not a schematic export performed by this lane.
- Excluded survey alternatives: bradleybeatz1313/ngspice-analog-simulations at `0d010f8ee42c559a5dfe5d6f8c236e8f7362efe5` has only a README MIT claim, no full copyright/licence notice; excluded conservatively. ahkab and PySpice at their existing corpus-h pins are dominated by dialect-dependent or duplicate inputs and vendor include closures. Circuit Codex at `ebddc3fd2cf887dca010bbe60487d7391ea6c052` has clean CC-BY-SA/CC0 notices but its amplifier fragments require adding analyses and bundling models; excluded from this standalone unadapted delivery. None of these excluded contents is redistributed.

| ID | Original path / pinned URL | SPDX | SHA-256 | Include closure |
|---|---|---|---|---|
| j-12 | [examples/measure/rc-meas-ac-control.sp](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/examples/measure/rc-meas-ac-control.sp) | BSD-3-Clause | 94e9eb54ea9d56d8a81cf50dde33b49e77917b9d260a3064cc11fa082e601b4b | empty |
| j-13 | [examples/p-to-n-examples/aswitch-pswitch.cir](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/examples/p-to-n-examples/aswitch-pswitch.cir) | BSD-3-Clause | 08e1740f1b0b12bd6cdbf27c4d5df63bbc25a392a9725db0eb6ca467c60b012f | empty |
| j-14 | [examples/mos/nmos_pmos_BSIM330.sp](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/examples/mos/nmos_pmos_BSIM330.sp) | BSD-3-Clause | 64980e734428b4a24605d1fff5004cd393a1108be56e36618c1c280847fc0952 | empty |
| j-15 | [examples/xspice/original-examples/xspice.deck](https://sourceforge.net/p/ngspice/ngspice/ci/a80f6e3e95d51534905b1f23410a951802666656/tree/examples/xspice/original-examples/xspice.deck) | BSD-3-Clause | b62c51739831020f5580a7b0c22892910cdcde92b63a11737f84674bff8b6f96 | empty |
| j-16 | [examples/testfiles/test_kicad_nets.cir](https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/examples/testfiles/test_kicad_nets.cir) | GPL-3.0-only | 5a124dc0286910a59a8782d0094a9bf8a57507a9c864090b6745ef4230b88f7f | empty |
| j-17 | [examples/testfiles/ac_rawtest.net](https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/examples/testfiles/ac_rawtest.net) | GPL-3.0-only | e6e98a5a3f5536846f743974350c5ac38fb348bc2d393857279078ba62342dc2 | empty |
| j-18 | [examples/testfiles/ngsteps.net](https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/examples/testfiles/ngsteps.net) | GPL-3.0-only | 68b0ca2e2eba7d8e59942ce491b91b44c003d6c8f87c3abbd28cbd04bdfde8ea | empty |
| j-19 | [examples/testfiles/sens_ngspice_rawtest.net](https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/examples/testfiles/sens_ngspice_rawtest.net) | GPL-3.0-only | 561115941ce8997a21386c15fec66def353eef9aea22460f89b9eb75afe28918 | empty |
| j-20 | [examples/testfiles/tran_rawtest.net](https://github.com/nunobrum/spicelib/blob/d8f8ecceeb361741f1f660f03b03ac49697f8700/examples/testfiles/tran_rawtest.net) | GPL-3.0-only | fd9800b396c7d5a9a628ddb991a9337ee657ce4acaafd26ac5bb92716f572241 | empty |

Reproduce part 2 without touching historical outcomes:

    git clone https://git.code.sf.net/p/ngspice/ngspice "$TMPDIR/ngspice-src"
    git -C "$TMPDIR/ngspice-src" checkout a80f6e3e95d51534905b1f23410a951802666656
    git clone https://github.com/nunobrum/spicelib "$TMPDIR/940-spicelib"
    git -C "$TMPDIR/940-spicelib" checkout d8f8ecceeb361741f1f660f03b03ac49697f8700
    # append-part2.ts "$TMPDIR" is ingestion-only, requiring the original 11-row manifest.
    pnpm build && pnpm lint
    spice-heavy pnpm exec tsx benchmarks/corpus/corpus-j/part2.ts
    pnpm exec tsx --test benchmarks/corpus/corpus-j/corpus-j.test.ts benchmarks/corpus/corpus-j/part2.test.ts

The engines receive identical original bytes. Control decks use the unchanged corpus-f source/write export wrapper, deferring quit/exit, exporting the first plot per declared analysis type. This changes output collection only; subsequent control plots are not compared. No fixture rewrite or tolerance tuning. Bounds and wall budget include historical runs. All statuses, detailed matched-point max/RMS absolute/relative metrics and engine-group runtimes are in `part2-outcomes.json`; empty/null metrics mean unavailable, not zero. New spice-ts-only losses: [#956 nested DC TEMP](https://github.com/mfiumara/spice-ts/issues/956), [#957 .title](https://github.com/mfiumara/spice-ts/issues/957), both M1/bug after searching open and closed issues. No issues for the four both-failed decks. Aggregate incorporation remains nightly #855.
