# corpus-j source survey (#940)

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
