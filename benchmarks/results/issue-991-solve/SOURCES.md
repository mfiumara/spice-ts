# #991 solve-path sources and pins

Baseline is `d39157cd467ddd63ce501334b330609e7ee0a644`, current origin/main fetched at the start of this experiment. Candidate build follows test-only commit `f41572cb`; its only simulator change is `candidate.patch`. The source change is NOT applied in the final PR.

Original MIT generators: `benchmarks/performance/scaling-m2-fixture.mjs`, repository https://github.com/mfiumara/spice-ts. Existing attribution and licence entry in `benchmarks/SOURCES.md` applies. No third-party circuit was added. All six decks are byte-identical to the historical scaling-matrix deck pins, checked by `linear-10k-prepare.mjs`; mesh requested 1k/50k round to 1024/50176 nodes.

Native oracle: installed ngspice-47, KLU selected by per-directory `.spiceinit`, not a deck edit. Native source https://ngspice.sourceforge.io/, BSD-family SPICE licence. `matrix/host.json` retains version output, Node version, OS, clocks and limits. Native executable is not redistributed.

`profile/prepared.json` pins the pre-candidate control and instrumented built copies and all decks. CPU profiles use the UNINSTRUMENTED control, not the timed instrumented copy. `matrix/prepared.json` pins uninstrumented before/candidate bundles and identical decks. `matrix/receipts.jsonl` pins every deck, TS full-output hash, native full-raw and numeric-payload hash. Native date-bearing headers and deduplicated full payloads reconstruct every raw file losslessly. `verify.mjs` verifies reconstruction and bundle/deck pins. `SHA256SUMS` pins all published files except itself.

Derived CPU profiles, measurement journals, scripts and reports are original repository work under MIT. `.gz` is lossless gzip with mtime=0, not selective output reduction. Shared-host noise, every round, and every win/loss are retained.
