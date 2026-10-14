# Rejected bundle-minification candidate for #978

Refs #978. The source/build change was reverted. This PR publishes one compile-bucket experiment, not a startup fix.

## Decision

The candidate adds `minify: true` and `keepNames: true` to the existing tsup configuration, for both ESM and CJS. It changes no entry graph, device, parser, numerical option or tolerance. The expectation was that a smaller bundle would reduce V8 compilation enough to clear the card's 25% import gate. `candidate.patch` retains the entire rejected change.

Measured import reduction is **19.15%**, below 25%, despite non-overlapping IQR intervals. Full RC1k, Mesh10k and CMOS1k vector hashes are unchanged. The exported `SingularMatrixError.name` nevertheless changes from `_SingularMatrixError` to `SingularMatrixError` in both ESM and CJS, even with `keepNames`. No API-compatibility claim is made. This candidate is rejected for the timing gate independently of that name difference.

No changes remain in `packages/core`, the shared harness, `benchmarks/SOURCES.md`, fixtures or aggregate results. #978 remains open. A different experiment belongs to a new supervisor-scoped card.

## Measurements

Baseline simulator commit `a521e9e221f4445639d899265589e5893a07e165`. Node v22.23.1, macOS 27.0.1 arm64, Homebrew ngspice-47 with KLU. `host.json` records versions, kernel, start clocks and absent Node compile-cache/options overrides. These are cold Node processes, not flushed filesystem-cache measurements.

15 alternating control/candidate import-only rounds, then 15 rotating control/candidate/ngspice RC1k rounds. All sampling runs use `spice-heavy`. No sample is discarded, retried, corrected or treated as warmup. Every workload has load averages, process count, suspend-inclusive parent timestamps, argv, PID, exit status and stdout/stderr. Load observations range 7.222–7.524 (1-minute average). These contemporaneous numbers must not be compared as a speedup against PR981's earlier 31.2 ms baseline.

| Boundary | Variant | Median ms | Q1 ms | Q3 ms | IQR ms | n |
|---|---|---:|---:|---:|---:|---:|
| Built ESM import only | control | 19.807 | 19.488 | 20.767 | 1.279 | 15 |
| Built ESM import only | candidate | 16.014 | 15.723 | 16.824 | 1.102 | 15 |
| RC1k cold process wall | control | 141.856 | 140.421 | 143.585 | 3.163 | 15 |
| RC1k cold process wall | candidate | 139.363 | 137.985 | 141.097 | 3.112 | 15 |
| RC1k native cold wall | ngspice-47 | 36.743 | 35.830 | 38.274 | 2.444 | 15 |

The cold-wall loss remains **3.86x** ngspice for control and **3.79x** for the rejected candidate. Spice-ts cold wall includes process startup, imports, reading/parsing, simulation, full-output hashing and exit. Native wall includes startup, parsing, simulation, binary raw emission and exit, but excludes the Node wrapper and subsequent raw parsing/hashing. Native wrapper timings remain in every receipt; they are not relabelled engine time. Cold-wall IQR intervals overlap, so this is not a reliable end-to-end speedup claim.

Total built ESM JS size falls from 1,842,788 to 867,618 bytes. This is not a measured decomposition of compilation versus evaluation. The prior PR981 profile motivated the experiment; this receipt measures total import latency rather than claiming a new CPU-profile attribution.

## Outputs and provenance

The decks are unchanged, original project-authored MIT generators from `benchmarks/performance/scaling-m2-fixture.mjs`. Source and licence are already recorded in `benchmarks/SOURCES.md` under the M2 scaling suite. No new third-party deck or licence assumption is introduced. RC1k is the identical #960/#981 deck, SHA256 `0944ed6b76f64f56c8e04b48919f1e12b9de19df4e5a08708c4be314fa7a91b7`, handed unchanged to both engines. Mesh10k has 10,000 nodes; CMOS1k has 1,000 nodes and 998 MOS1 inverter stages. They are output-equality guards, not native timing/parity claims.

| Deck | Baseline and candidate full-output SHA256 | Vectors | Doubles |
|---|---|---:|---:|
| RC1k | `6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7` | 1002 | 120240 |
| Mesh10k | `7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f` | 10001 | 10001 |
| CMOS1k | `8301f2834fc8157f9c23bc1eb9044e09fdd90e180a32271104a1d1ad600d1f11` | 1003 | 214642 |

All 30 timed spice-ts RC1k hashes match the #960 hash. Three additional before/after output guards hash every DC voltage/current and transient time/voltage/current vector using the existing #960 name-plus-little-endian-double serialization. All 15 complete native raw files are retained and independently rehashed by the offline checker. Native and spice-ts output hashes are **not** cross-engine bit-identical. No all-node native accuracy claim is added.

`provenance.json` records uncompressed byte counts and hashes for all decks and both built JS/CJS snapshots. These snapshots preserve bundled legal comments, including BSIM4 ECL-2.0 notices already documented in SOURCES.md. Normal rebuilt dist hashes match every retained control artifact after reverting the configuration. `SHA256SUMS` covers every published receipt file except itself. The source simulator/harness is the pinned baseline commit above, not the old archived harness in PR981.

## Reproduce

Offline checks from repo root, without executing simulations:

```sh
node --test benchmarks/performance/results/compile-978/verify.test.mjs
node benchmarks/performance/results/compile-978/worker.mjs summarize benchmarks/performance/results/compile-978
(cd benchmarks/performance/results/compile-978 && shasum -a 256 -c SHA256SUMS)
```

For fresh timing from the retained built artifacts, create a fresh directory under this receipt (ignored by git), decompress the built artifacts without changing their bytes, and regenerate identical decks. Never overwrite the published measurements:

```sh
python3 -c 'from pathlib import Path; import gzip; p=Path("benchmarks/performance/results/compile-978"); [( (p/"fresh"/v).mkdir(parents=True,exist_ok=True), [(p/"fresh"/v/f.stem).write_bytes(gzip.decompress(f.read_bytes())) for f in (p/v).glob("*.gz")] ) for v in ["control","candidate"]]'
node benchmarks/performance/results/compile-978/worker.mjs prepare benchmarks/performance/results/compile-978/fresh
spice-heavy python3 benchmarks/performance/results/compile-978/run.py benchmarks/performance/results/compile-978/fresh
```

To regenerate the builds instead, use an isolated worktree at the pinned simulator commit. Build normally and copy dist to control; `git apply candidate.patch`, rebuild and copy dist to candidate; reverse the patch; run `worker.mjs prepare` and the guarded controller. Only the two config flags differ. The retained scripts use the repository's existing `rc1k-attribution-worker.mjs`, vector hashing, generators and suspend-inclusive clock helper. The controller runs 85 top-level workloads plus 15 native children. Sampling is unchanged by the later offline-summary schema refinement that separates output equality from API-name equality and adds compressed-file reading.

## Verification and limitations

- Frozen install succeeded. It warned about the not-yet-built MCP binary and ignored esbuild install scripts; core and full builds subsequently succeeded.
- Candidate and restored normal `pnpm build` and `pnpm lint` succeeded.
- Candidate and restored normal targeted parser/protocol/step/browser tests each passed 121 tests, including the Vite production build in headless Chrome. No desktop focus was changed.
- Offline archive verification passed 4 tests, including all 85 workload receipts, rotated sampling, rederived medians/IQR, output/API decisions, built bytes and 15 native raw files.
- The first archive lookup extracted PR981's old harness over tracked files. This was detected and immediately restored before any measurement. No old-harness changes remain and no workload used them.
- The guarded run queued while both machine-wide slots were busy, then completed successfully. No queue delay is included in the timed boundaries.
- Local full suite was not launched, per the card's targeted-test rule. Required GitHub CI on the exact PR head is the authoritative full gate. See the PR and Kanban handoff for exact SHA-bound CI receipts.
- No release PR, package version, tag, npm publication or merge was touched.
