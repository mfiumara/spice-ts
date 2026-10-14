# #1000 second parser hotspot experiment: rejected

Refs #1000. Refs #991. Neither issue is closed. Production source is unchanged.

## Decision

On main `a521e9e221f4445639d899265589e5893a07e165`, the largest newly split
linear-parser leaf was `numparam.braceTokens`, 12.456 / 0.793 ms RC10k and
13.548 / 0.897 ms Mesh10k (median / IQR, exclusive instrumented time).
`collectParamFrames`, number parsing and line tokenization were each about 4–5 ms.
CMOS10k instead spent 17.760 / 5.537 ms in line tokenization versus
6.086 / 1.457 ms in braceTokens. See all nine deck profiles in `table.md`.

ONE general allocation optimisation was tried. `candidate.patch` makes
`braceTokens` copy-on-write: retain unchanged spans, build a new string only
when a parameter identifier is actually braced. It still scans every token and
checks visibility. It does NOT add PR1005's empty-scope bypass, content caching,
per-circuit branches, numeric changes or tolerances. No second candidate was tried.

The decisive UNINSTRUMENTED ten-round interleaved comparison failed both gates:

| Required deck | Before parse median / IQR ms | Candidate parse median / IQR ms | Reduction | Non-overlapping IQRs |
|---|---:|---:|---:|---|
| RC10k | 84.310 / 8.251 | 80.170 / 5.446 | 4.911% | no |
| Mesh10k | 82.799 / 10.295 | 77.006 / 11.290 | 6.997% | no |

Both are far below 25%. The patch was reverted. There is no accepted speedup.
The remaining parse cost spans generic preprocessing, auto-bracing and card
parsing; these measurements do not justify a tokenizer-only rewrite as a 25%
solution. This is an attribution/rejection slice, not closure of #1000 or #991.

## Evidence and limitations

`table.md` publishes before/candidate parse median/IQR, full cold wall and
ngspice-47/KLU native wall at 1k/10k/50k, including losses. All six linear decks
remain slower than ngspice. Candidate wall gets worse for RC10k, RC50k and Mesh1k.
CMOS1k also loses; CMOS10k's single full-wall sample is faster than native but
worsens with the candidate. One CMOS wall sample is NOT a speed ranking.

- Linear baseline: 180/180 cells, 112.429384 s continuous-clock run budget.
- Linear comparison: 180/180 cells, 113.093784 s. Fixed ten rounds per deck/mode;
  serial cold processes, rotating control/candidate/native order. No warmup,
  trimming, retries or censored linear cells. Native and TS receive identical bytes.
- CMOS: 90 successful cold parse-only cells, ten rounds × three sizes ×
  control/instrumented/candidate, rotating mode order. They measure parse only,
  not simulate or output. Eight full-wall/output cells separately succeeded:
  control/candidate at all three sizes, native at 1k/10k. These have ONE sample.
- Native CMOS50k exceeded the fixed 30 s child deadline. No complete native
  receipt, median, ratio or output identity is claimed. `censored-native.json`
  records the limitation. The controller's immediate process-group probe saw a
  short-lived surviving group after SIGKILL; a later `ps` check found the owned
  native PID absent. The runner now allows up to two seconds for reparented
  descendants to disappear, without rerunning the censored cell.
- Earlier `aborted-nine-deck` tried the full nine-deck plan, completing 26 cells
  before native CMOS50k hit the same deadline. Its controller failed with EPERM
  during the post-kill process-group probe. The exact owned parent/native PIDs
  were subsequently verified absent. All partial receipts, logs and partial raw
  bytes remain archived. This attempt is NOT part of the decisive matrix and
  has no certified completed budget. It was not silently replaced or trimmed.

The adaptation extends the published `linear-10k` harness only inside this
results directory. `run.py` isolates the six linear gate decks so CMOS50k cannot
prevent their ten-round certification. `cmos-run.py` provides bounded supplemental
profiles and walls. `adapt.py` records the initial mechanical adaptation; do not
rerun it over the final scripts (subsequent bounded-CMOS edits are authoritative).

No generators are instrumented across yields. Five extra synchronous leaves are
instrumented in COPY-ONLY ESM builds. Prefix phases are aggregated into numparam,
tokenize or cardParse; parents exclude descendants. Per-cell phase sums are
verified. Instrumentation overhead, especially per-number/per-token calls, is
visible and excluded from the before/candidate gate. Leaf medians are not
additive. Initial card splitting/subcircuit preparation stays in preprocessing;
Circuit assembly/node interning stays in assembly. These decks have no user
subcircuits, so no subckt-expansion improvement is claimed.

## Host, source and identity

Node v22.23.1; ngspice-47 with KLU; Darwin arm64 27.0.0 on `mac.home`.
`baseline/host.json` pins versions, clock, deadlines and machine metadata.
Every linear receipt records load/process count; CMOS receipts retain load too.
Combined pre-child one-minute load: min 6.136, median 8.635, IQR 2.274,
max 10.560. Shared-host measurements are not isolated-machine rankings.

Original MIT repo scaling generators are reused unchanged from
`scaling-m2-fixture.mjs`, already covered by `benchmarks/SOURCES.md`. No new
external source or licence. All nine deck SHA256s are checked against #961.
Nominal mesh 1k/50k has 1,024/50,176 actual nodes.

`verification.json` in each linear matrix pins complete serialized Circuit
state, deck bytes and ALL available DC/transient voltages/currents/time hashes.
All before/instrumented/candidate parse and full-output hashes match. CMOS
parse-only hashes match across all 90 profiles; full before/candidate output
hashes match at each size. Native numeric payload identity is within-engine,
not cross-engine accuracy (different layouts/time grids).

Wall includes parent spawn/reap, cold Node import, parse, simulation, serialized
parse-state equality hashing and output hashing. Those hashing costs are
separately timed, not charged to parse. Native denominator is direct ngspice
spawn/close with binary output, excluding the Node wrapper. Native acct parse
is diagnostic, not an identically instrumented phase.

Bundles/logs/decks use deterministic gzip. Each raw is losslessly split into its
original header and numeric payload; payloads deduplicate by SHA256 per matrix.
`native-raw-sha256.json` retains original full-raw hashes, including changing dates.
Partial CMOS50k raw bytes are preserved but NOT labelled complete numeric results.
`SHA256SUMS` pins all committed evidence bytes except itself and the PR description.

## Reproduce

From the repository root, with dependencies installed and this base checked out:

```
pnpm install --frozen-lockfile
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/results/parse-1000-hotspot-2/run.py /fresh/before --parse
git apply benchmarks/performance/results/parse-1000-hotspot-2/candidate.patch
pnpm -C packages/core build
spice-heavy python3 benchmarks/performance/results/parse-1000-hotspot-2/run.py /fresh/comparison --parse --before /fresh/before
node benchmarks/performance/results/parse-1000-hotspot-2/verify.mjs /fresh/before
node benchmarks/performance/results/parse-1000-hotspot-2/verify.mjs /fresh/comparison
git apply -R benchmarks/performance/results/parse-1000-hotspot-2/candidate.patch
```

The CMOS supplement uses local `baseline`/`comparison` paths with freshly prepared
uncompressed bundles. For a fresh reproduction, rename/archive the existing
journals first, prepare those paths as above, then run `spice-heavy python3
benchmarks/performance/results/parse-1000-hotspot-2/cmos-run.py`. Journals refuse
reuse. Do not rerun an attempted matrix in place. Decompress bundle `.js.gz`
and deck `.cir.gz` files for replay of the exact archived builds.

Offline verification (no cold matrix needed):

```
node benchmarks/performance/results/parse-1000-hotspot-2/verify.mjs benchmarks/performance/results/parse-1000-hotspot-2/baseline
node benchmarks/performance/results/parse-1000-hotspot-2/verify.mjs benchmarks/performance/results/parse-1000-hotspot-2/comparison
node benchmarks/performance/results/parse-1000-hotspot-2/report.mjs
node --test benchmarks/performance/results/parse-1000-hotspot-2/evidence.test.mjs
```

All exit 0. Seven new corruption/positive receipt tests pass; original parser
harness tests pass 17/17. Candidate parser suite passed 62 files / 1,418 tests.
After reverting production source, `pnpm build`, `pnpm lint` and
`spice-heavy pnpm test` all exit 0. Core has 4,097 passes / two existing skips;
root benchmark tests have 177 passes / four existing skips. Logs are retained.
GitHub required test (20), test (22), build and accuracy receipts on the published
exact head are recorded in the Kanban handoff. No merge or release action.
