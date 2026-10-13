# Issue 926: falsified growth-safe U alias experiment

## Decision

Do not ship the production candidate. Local `uRows`/`uValues` aliases, refreshed immediately after `growUFactors`, preserved the tested arithmetic but did not produce a reproducible general improvement. The production solver is byte-for-byte unchanged from baseline. `candidate.patch` preserves the rejected experiment; the dedicated five-test growth regression remains.

Fresh independently built and measured baseline: `d4b1ce04b70f98986d825d1daee64fabcfc7ae61`. Accepted PR913 establishes the supernode hotspot. PR922 was still OPEN, unmerged, at `edbcf033607120ea45c78656413e6ca5973e20ff` when inspected. Its work is pending, not accepted evidence or this baseline.

## One bounded experiment

Run command, exit 0:

    spice-heavy python3 benchmarks/performance/results/issue-926/run.py
    python3 benchmarks/performance/results/issue-926/summarize.py

108 planned cells, all started: 3 repeats × 3 published circuits × 1k/10k/50k × cold/warm × baseline/candidate. 106 completed and 2 timed out. No budget skips. Cumulative child wall 573.870848 seconds, below the fixed 900-second limit. Each direct Node child owns a new process group with a 45-second deadline; the driver kills only that group on timeout, reaps it, and verifies group disappearance. `budget.json` records no survivors. Cold means a fresh process and one simulate call. Warm means one full simulate warmup followed by one timed simulate in the same process, not retained factor state across simulations.

A/B pairs are consecutive. Repeat 0 and 2 use baseline/candidate order; repeat 1 reverses it. This is one matrix, no reruns or selected exclusions. `samples.jsonl` contains command, PID, exit, status, deck hash, actual nodes, import and warmup duration, internal simulate duration, complete output digest, vector counts and peak RSS for every successful cell. Timeout stderr/stdout are retained, and absent internal metrics are not imputed. Successful-only medians are explicitly incomplete for warm CMOS50k.

Sources are the existing MIT repository-generated `scaling-m2-fixture.mjs`, already documented in `benchmarks/SOURCES.md`. No netlist, tolerance, pivot, capacity policy, ordering or public API changes. Published decks are generated unchanged and retained as `decks/*.cir.gz` (gzip mtime 0); `run.py` regenerates the ignored uncompressed inputs. The mesh rounds requested 1k/10k/50k to 1024/10000/50176 actual nodes. Each pair's deck SHA256 is identical.

## Results

Internal simulate milliseconds, baseline → candidate, median (3 successes except warm CMOS50k, 2 each). All ranges, wall medians, and RSS medians/ranges are in `summary.txt` and machine-readable `summary.json`.

| Circuit | Size | Cold ms | Warm ms |
|---|---:|---:|---:|
| RC ladder | 1k | 81.91 → 80.62 | 58.81 → 63.86 |
| RC ladder | 10k | 410.99 → 411.14 | 315.36 → 326.96 |
| RC ladder | 50k | 1717.88 → 1641.95 | 1470.84 → 5875.56 |
| Resistor mesh | 1k | 56.26 → 55.55 | 25.39 → 26.33 |
| Resistor mesh | 10k | 272.81 → 301.17 | 223.00 → 225.20 |
| Resistor mesh | 50k | 1410.45 → 1683.88 | 1008.84 → 1094.81 |
| CMOS chain | 1k | 335.12 → 339.49 | 230.94 → 241.95 |
| CMOS chain | 10k | 3009.25 → 2842.38 | 2293.79 → 2431.42 |
| CMOS chain | 50k | 22620.22 → 26140.10 | 20738.59 → 21150.65 (partial) |

Losses and noise are not removed. Warm RC50k baseline range 1367.48–3854.45ms, candidate 1459.47–6838.14ms. Mesh50k cold baseline 1088.74–5068.80ms, candidate 974.29–3182.02ms. Candidate warm mesh50k RSS median 469.3MiB versus baseline 443.0MiB. These observations on a shared host cannot attribute causality to aliases; they do reject a defensible reproducible general speedup in this matrix. `host.json` records machine/runtime, load and built JS hashes. Other lanes and the separately guarded test suite were active; `spice-heavy` permits two heavy runs, not exclusive machine isolation.

The two 45-second timeouts are baseline warm CMOS50k repeat 0 and candidate warm CMOS50k repeat 2. The remaining completed warm CMOS50k pair is repeat 1. Successful-only medians in that row combine different repeats and must not be treated as a fully paired comparison.

Parent `childWallMs` includes Node startup/import, deck loading, warmup when present, result hashing, process exit and scheduling. `simulateMs` times only the measured simulate call, including parsing/analysis/result construction. It is not ngspice internal analysis time or pure LU CPU time. Peak RSS is Node's `resourceUsage().maxRSS`, converted from KiB to MiB, over the entire child including warmup and hashing. No GC/CPU profiler was attached to these timings.

## Correctness and RED/GREEN

All 52 fully completed A/B pairs match the complete IEEE-754 digests of every returned DC/transient node voltage, branch current and transient time vector, their vector/value counts, and convergence telemetry. Two pairs are incomplete because of timeouts, not proven correct. `summarize.py` asserts hashes and retains all status counts rather than silently dropping losses.

Tests were written first. Existing main passed all 5 dedicated tests (`baseline-tests.log`). The deliberately unsafe stale-alias mutant failed 4/5 (`red-stale-alias.log`, exit 1). Refreshing both aliases after growth passed 36/36 across the dedicated and existing solver tests (`green.log`, exit 0). This is optimization mutation RED, not a pre-existing main bug. The tests force replacement of both arrays midway through a supernode block, assert in-block growth, and compare complete L/U pointers, rows, IEEE value bits, permutation/order and IEEE solution bits. They exercise off-diagonal pivoting, explicit exact cancellation without pivot, changed-value refactor reuse/fallback, and singular classification. No existing solver test was edited.

## Reproduce

Use an isolated checkout at the exact baseline above with Node/pnpm versions from `host.json` and dependencies installed with `pnpm install --frozen-lockfile`. Copy this receipt directory's scripts/patch into that checkout if needed. From repository root:

    pnpm -C packages/core build
    mkdir -p benchmarks/performance/results/issue-926/baseline
    cp -R packages/core/dist/. benchmarks/performance/results/issue-926/baseline/
    git apply benchmarks/performance/results/issue-926/candidate.patch
    pnpm -C packages/core build
    mkdir -p benchmarks/performance/results/issue-926/candidate
    cp -R packages/core/dist/. benchmarks/performance/results/issue-926/candidate/
    git apply -R benchmarks/performance/results/issue-926/candidate.patch
    spice-heavy python3 benchmarks/performance/results/issue-926/run.py
    python3 benchmarks/performance/results/issue-926/summarize.py

The two generated bundle directories are ignored, not publication artifacts. Their measured JS hashes are in `host.json`; `candidate.patch` plus the baseline SHA reconstructs the candidate. The scripts overwrite their own receipts, so reproduce in another isolated checkout, not this immutable evidence copy.

No fresh ngspice timings/references were used. Historical references and their losses are not fresh comparisons, and none is copied or counted in this matrix. This evidence supports neither superiority to ngspice nor a new parity claim.

## Verification receipts

`verification.txt` records local build/lint/guarded full-suite exits for the experimental candidate; `final-verification.txt` and `final-targeted.log` record the reverted production solver checks. Exact PR-head CI and the independent review are recorded in the Kanban implementation handoff, rather than embedding a self-referential commit SHA here.
