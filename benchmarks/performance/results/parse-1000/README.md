# Parser attribution, issue #1000

Refs #991. Refs #1000. Attribution only; both issues remain open.
No production code changed and no accepted speedup is claimed.

## Decision

The general hotspot is `braceBareParameters` in `parser/numparam.ts`. The detailed
profile spends about 23 ms scanning tokens even with no parameter names in any
scope. A two-line general empty-scope early return was tried, with no per-deck
branches, tuning or content cache. Its exact rejected patch is retained in
`rejected-candidate.patch`.

A sequential screen appeared to clear 25%, but was not sufficient evidence.
The decisive ten-round interleaved unchanged-before/candidate/native matrix at
1k/10k/50k reduced 10k parse medians by only 20.799% RC and 21.567% mesh. Both IQR
pairs are non-overlapping, but BOTH fail the >=25% requirement. The candidate
was reverted under the card's attribution-only fallback. Do not interpret the
screen or 50k wins as a successful #1000 fix.

Reserved `preprocessor.ts` (PR976), `parser/index.ts` (#917) and `circuit.ts`
(PR998) were not edited. Remaining preparation/dispatch work crosses those
ownership boundaries; no second optimisation was attempted.

## Detailed attribution

All timings are ms, median / IQR, ten samples, interpolated quartiles, no trimming.
Full phase tables are in `baseline/table.md` and `detailed/table.md`. The detailed
numparam breakdown identifies `braceBareParameters` at 22.562 ms RC / 23.415 ms
mesh, followed by `substituteStatement` at 7.375 / 8.116 ms. Initial coarse phase
medians were:

| Exclusive phase | RC10k | Mesh10k |
|---|---:|---:|
| preprocess | 19.730 / 0.487 | 19.580 / 0.787 |
| numparam | 30.377 / 0.821 | 33.066 / 0.927 |
| tokenize | 8.619 / 0.514 | 6.626 / 0.050 |
| cardParse | 21.902 / 1.110 | 24.970 / 0.579 |
| assembly | 4.757 / 0.658 | 5.359 / 0.400 |
| parseResidual | 4.342 / 0.134 | 4.320 / 0.264 |

Definitions, pinned once per target in each `prepared.json`:

- preprocess: `preprocessDeck` exclusive of measured numparam descendants.
  Includes collecting cards, conditionals, statement allocation and joins.
- numparam: function expansion, auto braces, scopes, temperature discovery,
  measure-name discovery and expression substitution. These decks have no user
  parameters/expressions, so this measures generic preparation overhead, not
  complex expression evaluation. No generators are wrapped across yields.
- tokenize: `tokenizeNetlist`, including its line-token scanning.
- cardParse: `parseNetlist` exclusive of tokenizer and measured Circuit methods.
  Includes ground alias/control extraction, validation, device dispatch and card
  parsing. It does not time only `parseDevice`.
- assembly: Circuit R/C/L/V/I additions, analyses and parameters. These cover the
  methods used by these decks, not every possible device's assembly method.
- parseResidual: outside measured functions, including initial title/control
  extraction and instrumentation entry/exit overhead. Every row sums to parse.

Numparam detail rows break down the aggregate; do not add them to it again.
Instrumentation only changes copies of built ESM. Unchanged control and
instrumented parse clocks are both published, including instrumentation overhead.
Parser counters freeze before simulation, which can call the same helpers again.

## Decisive before/after, including small/large cases

Both sides below are UNINSTRUMENTED. Candidate means the REJECTED experiment,
not production after this PR. The original control is copied and hash-checked
from the detailed archive by `--before`.

| Deck | Before parse median / IQR ms | Candidate parse median / IQR ms | Reduction | Candidate wall/native |
|---|---:|---:|---:|---:|
| RC1k | 16.538 / 2.151 | 13.399 / 1.484 | 18.981% | 5.607x |
| Mesh1k | 16.450 / 2.051 | 13.091 / 0.829 | 20.417% | 7.111x |
| RC10k | 84.591 / 6.930 | 66.997 / 8.474 | 20.799% | 2.499x |
| Mesh10k | 86.193 / 12.690 | 67.604 / 10.848 | 21.567% | 3.796x |
| RC50k | 297.695 / 38.522 | 219.354 / 12.167 | 26.316% | 1.235x |
| Mesh50k | 305.297 / 21.811 | 217.558 / 33.460 | 28.739% | 1.599x |

No 1k/50k parse regression beyond IQR was observed. All six parse outcomes, full
wall medians/IQRs, before wall/native losses and native timings are retained in
`comparison/table.md` and `verification.json`. The engine remains slower
end-to-end than ngspice in every case. The candidate slightly worsens RC1k cold
wall/native (5.596x to 5.607x) and Mesh10k (3.734x to 3.796x), despite improving
parse. These wall losses are retained, not dismissed or trimmed. Wall includes
parent spawn/reap, Node cold
startup/import, parsing, simulation and benchmark equality/output hashing. Native
denominator is direct ngspice spawn/close including binary output, excluding its
Node controller. Native wrapper wall is also reported. Equality hashing adds
roughly 10 ms at 10k and is separately timed, NOT charged to parse or simulation.
This overhead makes wall numbers different from #997, which did not hash parse
state. There is no accepted after-change ratio because the change was reverted.

Shared-host results are not isolated-machine rankings. `host.json` records Node
v22.23.1, ngspice-47/KLU, macOS uname and continuous-clock limits; receipts retain
per-child load/process count. Cold startup/exit variability is visible. Native
acct parse is not an identically instrumented internal phase, so it is diagnostic.

## Every attempt retained

- `baseline`: initial coarse numparam profile, 60/60 cells, 23.983331 s.
- `detailed`: separates numparam functions without extra wrappers, 60/60 cells,
  24.791882 s.
- `rejected-candidate`: sequential candidate screen, NOT decisive evidence,
  60/60 cells, 23.399490 s.
- `comparison`: rotating before/candidate/ngspice, three sizes each round,
  180/180 cells, 119.998398 s.

No matrix had retries, trimming, censored cells, failures or clock disagreement.
Per-child deadline is 30 s; each matrix has a 300 s continuous budget. All started
process groups were reaped. Immutable journals retain original absolute commands.
The initial unprepared `pnpm build` failed with exit 1 because dependencies were
absent; frozen install then succeeded. Favorable sequential baseline selection
would change the conclusion; the interleaved comparison is the decision gate.

## Decks and semantic identity

Original MIT repo generators from `scaling-m2-fixture.mjs` are reused unchanged,
already covered by `benchmarks/SOURCES.md`. No new external source/license.
Every 1k/10k/50k deck is SHA256-checked against #961 before workers run; both
engines receive identical bytes. Nominal mesh 1k/50k have 1,024/50,176 actual nodes.

| Deck | Deck SHA256 | TS complete output SHA256 |
|---|---|---|
| RC10k | eb21933fd99fcbc32276816a4f389ba216dcdddc29683551a67f606f352dfca7 | cfed768fddaa3d8f6f44396c0b98d1e1101231083774afcf4f993b888a787ede |
| Mesh10k | c88e6076daf2523437e3da014d7a3c329f679a7405f789530c5c805f447ed0dc | 7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f |

All available DC/transient voltage/current vectors and transient time are hashed,
not just probes. TS full-output hashes match #997. Native numeric payload hashes
are stable within each deck; layouts/time grids differ between engines, so this
is not a cross-engine accuracy comparison.

Before simulation, enumerable Circuit state is JSON-serialized, preserving Map
and Set entries, and SHA256-hashed. This includes descriptors, models, subcircuits,
analyses, options, warnings and parameter/control fields; it is not just a netlist
round-trip. Parse hashes match across control/instrumented/candidate and across
attempts on byte-identical decks. Parser suites provide coverage beyond linear
decks. Ultimately production source is byte-unchanged.

Archives use deterministic gzip. Native raws are losslessly split at `Binary:\n`.
Each original header is retained; identical numeric payloads are stored once per
attempt by SHA256. `native-raw-sha256.json` checks the FULL reconstructed raw,
including the original changing date header. The verifier recomputes every bundle,
deck, raw reconstruction, payload hash, phase sum, round count and clock envelope.
`SHA256SUMS` pins archive bytes. No synthetic or probe-only data is substituted.

## Reproduce

From the repo root in a disposable clean checkout:

```
pnpm install --frozen-lockfile
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/linear-10k.py /path/to/fresh-before --parse
git apply benchmarks/performance/results/parse-1000/rejected-candidate.patch
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/linear-10k.py /path/to/fresh-comparison --parse --before /path/to/fresh-before
node benchmarks/performance/linear-10k-verify.mjs /path/to/fresh-before
node benchmarks/performance/linear-10k-verify.mjs /path/to/fresh-comparison
git apply -R benchmarks/performance/results/parse-1000/rejected-candidate.patch
```

Runner refuses existing attempted journals. Every worker is cold and serial,
rotating modes, no warmup. `--before` accepts archived gzip control bundles too.
Candidate provenance is main `8f36aef3b819d3f09e1ef1ee2f126d1d81265c3c` plus exactly
the archived patch; prepared baseSha alone does not encode dirty candidate source.
The candidate is NOT in the PR production source.

Offline checks, all exit 0:

```
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/parse-1000/baseline
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/parse-1000/detailed
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/parse-1000/rejected-candidate
node benchmarks/performance/linear-10k-verify.mjs benchmarks/performance/results/parse-1000/comparison
node --test benchmarks/performance/linear-10k.test.mjs benchmarks/performance/parse-1000.test.mjs
python3 benchmarks/performance/linear-10k-test.py
```

17 Node tests and six Python plan/deadline tests pass. Parser-receipt verification
was first RED (one failing positive case), then GREEN after parser-aware handling.
Corruption tests reject missing phases, altered parse results, overlapping sums,
changed decks/output and clock corruption.

Final production-source gates:

- `pnpm build`: exit 0, existing bundler warnings only.
- `pnpm lint`: exit 0.
- `pnpm -C packages/core exec vitest run src/parser`: exit 0,
  57 files / 1,360 tests passed.
- `spice-heavy pnpm test`: enclosing command hit local 240 s timeout (exit 124)
  after workspace suites passed, including core 3,667 passes / two existing skips.
  Root benchmark tests were still running when terminated. No complete local
  full-suite pass is claimed; exact-head required GitHub CI is authoritative.

New benchmark tests remain explicit manual checks, as with #997. Shared CI was
not edited. PR URL, exact head SHA and four required CI receipts are recorded in
Kanban/PR handoff. No publication, release PR change or merge.
