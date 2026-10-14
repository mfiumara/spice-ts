# Rejected lazy analysis-entry experiment, #978

## Decision

Refs #978. Reject this candidate and leave the issue open. No production, parser,
numparam, MOS2, tolerance, fixture-generator or shared harness changes remain.

The experiment deferred the async simulation/stream entry points through a dynamic
import of `simulate.ts`. Its synchronous backend factory moved to the facade;
`Circuit`, parsing and `createTransientSim` remained eager. This is a general entry
split, not a circuit-specific dispatch. `candidate.patch` retains the complete
production experiment and its regression tests. `PLAN.md` records the alternatives.

The #981 profile identified bundled V8 compilation as the largest bucket (sampled
median 26.917 ms), not tokenizer initialization (0.818 ms). Tokenizer is owned by
another lane and was not edited. This experiment targets compilation by deferring
analysis-engine code. Much code stays eager because synchronous public parser,
Circuit and transient-driver APIs are retained. Candidate ESM has a 1,607,332-byte
shared chunk plus a 188,178-byte analysis chunk. There is no new source-level CPU
profile and no claim that source initialization dominates compilation.

## Measured results

Baseline `a521e9e221f4445639d899265589e5893a07e165`, Node v22.23.1, macOS
27.0.1 arm64, Homebrew ngspice-47 KLU. Normal tsup build for both variants, no
minification changes. Cold processes, not flushed filesystem caches. No compile
cache or NODE_OPTIONS. 15 alternating import rounds; 15 rotating RC1k
control/candidate/ngspice rounds; 15 alternating Mesh10k and CMOS1k rounds each.
No warm-up exclusion, retries, discarded samples, or clock corrections.

| Boundary, n=15 each | Control median / IQR ms | Candidate median / IQR ms |
| --- | ---: | ---: |
| Built ESM import | 32.303 / 4.080 | 31.464 / 1.971 |
| RC1k cold process wall | 280.687 / 120.538 | 335.381 / 179.497 |
| Mesh10k cold process wall | 699.156 / 125.457 | 655.912 / 241.058 |
| CMOS1k cold process wall | 758.483 / 87.218 | 746.173 / 140.197 |

Import median difference is 2.596%, below the >=25% gate. Import Q1/Q3 intervals
are [30.445,34.526] and [30.015,31.986] ms, which overlap. All cold-wall intervals
also overlap. No statistically supported import or end-to-end win is claimed.
The apparently worse RC1k candidate median is retained, not explained away.

Host load was high and variable, 11.397–15.975 (290 before/after observations).
Candidate targeted checks/build/lint ran concurrently with part of this series.
This is a noisy shared-host rejection receipt, not a precise speedup estimate;
there was no rerun to select a more favorable distribution. `host.json`, every
receipt's before/after host observation and `run.log.gz` retain that context.

Native RC1k cold wall median/IQR is 94.154 / 35.671 ms. Remaining loss versus
native is 2.98x control and 3.56x candidate. Native wall includes startup, parse,
simulation, raw emission and exit; it excludes the Node controller and external
raw parsing/hashing. spice-ts process wall includes Node startup, import, parse,
simulation, hashing and exit. Mesh/CMOS wall uses the retained #1034 parity worker
and also includes runtime API inventory; do not compare their absolute times with
the RC1k worker as an engine-only benchmark. No new ngspice Mesh/CMOS comparison is
claimed, only before/after for the same spice-ts workloads.

## Correctness and API evidence

All 96 measured numerical spice-ts outputs match their before/after full-vector
hashes, including all timed rounds. Same generated MIT netlists for each variant,
with deck and build hashes in `provenance.json`. Existing provenance is in
`benchmarks/SOURCES.md`; there is no new third-party material.

| Deck | Vectors / doubles | Before and after SHA256 |
| --- | ---: | --- |
| RC1k | 1002 / 120240 | `6a650522805562c8018777ab78a344668d2fb12038fd6e4fcfd7cc3302c4e8a7` |
| Mesh10k | 10001 / 10001 | `7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f` |
| CMOS1k | 1003 / 214642 | `8301f2834fc8157f9c23bc1eb9044e09fdd90e180a32271104a1d1ad600d1f11` |

All 15 native raw outputs are retained and independently rehashed by the offline
check. Cross-engine hashes are not bit-identical; this is not a new all-node
ngspice numerical-parity claim. ESM export keys/runtime names and ESM/CJS exported
error constructor names are unchanged. CJS `simulate`, `simulateStream`, and
`simulateStepStream` function names acquire `2` suffixes, another compatibility
limitation. No claim of full API compatibility. `summary.json` retains the full
before/after inventories and convergence evidence.

## Commands and reproduction

```sh
pnpm install --frozen-lockfile
pnpm -C packages/core build
# Original run copied this dist to control/ before applying candidate.patch.
git apply benchmarks/performance/results/lazy-entry-978/candidate.patch
pnpm -C packages/core build
# Original run copied this dist to candidate/ before preparation.
node benchmarks/performance/results/lazy-entry-978/worker.mjs prepare benchmarks/performance/results/lazy-entry-978
spice-heavy python3 benchmarks/performance/results/lazy-entry-978/run.py benchmarks/performance/results/lazy-entry-978
```

Do not run those original commands over the retained receipt. To reproduce from
retained artifacts without changing source, use a fresh directory inside this
workspace, then:

```sh
mkdir -p "$OUT/control" "$OUT/candidate"
tar -xzf benchmarks/performance/results/lazy-entry-978/control-dist.tar.gz -C "$OUT/control"
tar -xzf benchmarks/performance/results/lazy-entry-978/candidate-dist.tar.gz -C "$OUT/candidate"
node benchmarks/performance/results/lazy-entry-978/worker.mjs prepare "$OUT"
spice-heavy python3 benchmarks/performance/results/lazy-entry-978/run.py "$OUT"
```

Set OUT to an absolute fresh directory. Live runner refuses an existing
receipts.jsonl and retains failed receipts. Output uses #960 little-endian
canonical vector hashing and the same worker as #1034. `run.py`/`worker.mjs` are
adapted from PR1034 head `4343d32166c16f162205f4c19cb8c82ae31020dd`, extended only
with the two additional cold workload series. It uses the committed #951
mach_continuous_time parent controller and the repository's existing RC1k worker.
`source-provenance.json` pins shared dependencies; retained dist archives include
JS, CJS, declarations, sourcemaps and legal comments. No old harness archive was
extracted or shared harness file changed in this run.

Offline verification (no heavy workload):

```sh
node --test benchmarks/performance/results/lazy-entry-978/verify.test.mjs
node benchmarks/performance/results/lazy-entry-978/worker.mjs summarize benchmarks/performance/results/lazy-entry-978
(cd benchmarks/performance/results/lazy-entry-978 && shasum -a 256 -c SHA256SUMS)
```

The five checks verify all 145 top-level receipts plus 15 native grandchildren,
round order, clock certification, all distributions, all 96 numerical hashes,
all 15 binary native raw hashes, ESM/CJS export/error names and rejection. No
unrecorded output synthesis. stdout/stderr and logs are gzip-compressed unchanged.

## Tests, restoration and limitations

- RED test confirms eager engine evaluation before the facade. Initial test also
  expected ParseError for an invalid resistor model, but both baseline and
  candidate actually return InvalidCircuitError. Fixed the test expectation,
  not simulator behavior. The first candidate check had that same test failure;
  both failure logs are retained.
- Candidate full build/lint pass. Candidate focused suite passes 96 tests,
  including deferred evaluation, both stream APIs, protocol adapter/validation,
  backend factory, real ngspice WASM and headless Chrome production workers.
- Production candidate and its lazy-load-specific test reverted before final PR.
  Restored full build/lint pass. Restored focused suite passes 94 tests.
- Rebuilt restored JS/CJS hashes match every retained control artifact exactly.
- Offline evidence suite passes 5 tests, before and after receipt compression.
- Local full suite not run under this card's targeted-only rule. Required GitHub
  build/accuracy/test (20)/test (22) checks on the exact PR head are the full gate.
- No merge, release, npm publication or version change.
