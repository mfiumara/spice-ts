# #1053 MOS1 lazy stamp-slot rejection receipt

Refs #1053. Evidence only. The candidate is rejected; no simulator runtime change is shipped and #1053 remains open. This result rejects one small general optimization, not MOS batching as a whole.

## Hypothesis and benchmark-first sequence

Current main's earlier [attribution](../issue-1053/README.md) identifies MOS1 `batchStamp` as the largest 10k frame (26.8% self). Its stamping tail eagerly reads eight channel matrix slots and, in reverse mode, replaces all eight. The candidate in `candidate.patch` reads only slots for entries actually stamped, selecting the reverse-mode slot at the point of use. It retains the exact arithmetic and write order, including bulk stamps. It does not change the load cache, junction GMIN, channel equations, tolerances, decks, solver, parser, or MOS3.

Started from `origin/main` at `1e16230d7d396506e6f86f931d45ebf166b05eae`. Built/pinned the control and ran one baseline cell on each deck before editing (`run/red-receipts.jsonl`). Baseline API wall values were CMOS1k 303.09 ms, CMOS10k 2561.38 ms, RC10k 342.46 ms, Mesh10k 236.90 ms. These four observations establish benchmark-first execution only; they are not the A/B comparison or a selected timing baseline. Built/pinned the candidate after the edit and 12 targeted MOS tests passed. Ran all ten A/B rounds, then the CI accuracy script on the candidate. After rejection, reversed the patch, rebuilt, and verified every restored ESM bundle hash equals the control pin.

## Protocol and result

Node v22.23.1, Darwin 27.0.0 arm64, shared Mac. A/B 1-minute load ranged 8.26–11.18. `spice-heavy` serialized this run against the machine-wide two-heavy-job limit; it does not ensure an otherwise idle host. Ten rounds, four decks, two builds, 80 serial cold-process cells. Control/candidate order alternates each round. No warmups, retries, discarded outliers, or timing selection. Each cell is a new Node process importing its pinned ESM bundle. `run/ab-receipts.jsonl` records API wall, parent elapsed, load before/after, full-output hash, convergence counters, grid and probe. Quantiles use linear interpolation; IQR = Q3−Q1.

Primary wall is the same public parse+simulate API timer in the reused [worker](../issue-1053/worker.mjs), excluding process startup/import and post-simulation hashing. It includes parsing, initial OP, and transient where applicable. Parent elapsed is retained but is not substituted for API wall. This is same-engine A/B; no new ngspice comparison or engine-superiority claim is made. All decks are byte-identical between builds and match the earlier #1053 deck hashes. The unchanged MIT-authored M2 fixture provenance is already recorded in `benchmarks/SOURCES.md`; no third-party material is newly introduced.

| Deck | Control median ms | Control IQR ms | Candidate median ms | Candidate IQR ms | Candidate wall change |
|---|---:|---:|---:|---:|---:|
| CMOS1k transient | 348.70 | 30.97 | 370.98 | 13.19 | +6.39% |
| CMOS10k transient | 2918.16 | 229.17 | 2888.12 | 147.04 | −1.03% |
| RC10k transient | 434.34 | 36.25 | 420.91 | 42.38 | −3.09% |
| Mesh10k OP | 289.29 | 16.22 | 299.88 | 35.70 | +3.66% |

The >=15% CMOS10k reduction gate fails. The <=3% control-regression gate also fails on Mesh10k. Non-MOS controls do not execute the changed function; their movement demonstrates host/JIT/bundle variance, not a claimed benefit or a diagnosed MOS regression. Neither small measured movement nor correctness identity justifies shipping this candidate. `summary.json` retains exact values, Q1/Q3 and every sample.

## Correctness and verification

Across all ten rounds of both builds, each deck has the same complete DC/transient output digest, vector count, value count, convergence object, time grid and probe. CMOS1k/10k both retain 214 output rows, 213 accepted advances, zero rejected steps, zero NR/LTE retries, and 466 transient Newton iterations. This is full-output same-engine identity on these four decks, not a full-corpus cross-engine parity claim.

Commands actually run:

- `pnpm install --frozen-lockfile`
- `pnpm build` before the edit, on the candidate, and after restoration
- `node benchmarks/results/issue-1053-stamp/prepare.mjs benchmarks/results/issue-1053-stamp/run control`
- `spice-heavy python3 benchmarks/results/issue-1053-stamp/run.py benchmarks/results/issue-1053-stamp/run red`
- `pnpm -C packages/core exec vitest run src/devices/mosfet-batch-stamp.test.ts src/devices/mosfet-batch-state.test.ts src/devices/mosfet-load-cache-842.test.ts` — 12/12 pass on candidate
- `node benchmarks/results/issue-1053-stamp/prepare.mjs benchmarks/results/issue-1053-stamp/run candidate`
- `spice-heavy python3 benchmarks/results/issue-1053-stamp/run.py benchmarks/results/issue-1053-stamp/run` — 80/80 cells complete
- `node benchmarks/results/issue-1053-stamp/check.mjs benchmarks/results/issue-1053-stamp/run` — both gates false, full-output identity true
- `spice-heavy pnpm exec tsx benchmarks/accuracy.ts --ci` — candidate passes all eight circuits' thresholds. Native comparison columns are empty on this host despite the script reporting ngspice enabled; this exit is not native-parity proof. See `candidate-accuracy-results.json` and compressed log.
- `git apply --reverse benchmarks/results/issue-1053-stamp/candidate.patch`
- `pnpm lint` and `spice-heavy pnpm test` — restored runtime passes full monorepo/root suite
- `node --test benchmarks/results/issue-1053-stamp/evidence.test.mjs` — 3/3 offline checks, including missing/duplicate/altered-sample rejection and deck/bundle hash pins

Compressed build, lint, test and accuracy logs are retained in `logs/`. Required exact-head CI build/accuracy/test (20)/test (22) is recorded on the PR and Kanban handoff, not asserted by the base-SHA experiment. Production `mosfet.ts` is unchanged in the final PR; the rejected diff lives only in this evidence directory. This avoids the open #1068 junction-GMIN lane entirely.

## Reproduce

Offline validation of committed evidence (does not simulate):

```sh
node --test benchmarks/results/issue-1053-stamp/evidence.test.mjs
node benchmarks/results/issue-1053-stamp/check.mjs benchmarks/results/issue-1053-stamp/run
```

Fresh timing replay in a disposable worktree, using the committed pinned bundles rather than rebuilding a different base:

```sh
python3 -c 'from pathlib import Path; import gzip; p=Path("benchmarks/results/issue-1053-stamp/run"); [f.with_suffix("").write_bytes(gzip.decompress(f.read_bytes())) for f in p.rglob("*.gz") if f.name.endswith((".js.gz", ".cir.gz"))]'
# Use a fresh directory so immutable journals cannot be overwritten.
mkdir -p benchmarks/results/issue-1053-stamp/replay
cp -R benchmarks/results/issue-1053-stamp/run/control benchmarks/results/issue-1053-stamp/run/candidate benchmarks/results/issue-1053-stamp/replay/
cp benchmarks/results/issue-1053-stamp/run/*.cir benchmarks/results/issue-1053-stamp/run/prepared.json benchmarks/results/issue-1053-stamp/replay/
spice-heavy python3 benchmarks/results/issue-1053-stamp/run.py benchmarks/results/issue-1053-stamp/replay
node benchmarks/results/issue-1053-stamp/check.mjs benchmarks/results/issue-1053-stamp/replay
```

The checker writes `summary.json` in the parent of its run directory. Replay therefore replaces the local summary; use a disposable worktree and do not commit regenerated timings. Alternatively rebuild at the pinned base, prepare a fresh control, apply `candidate.patch`, build and prepare a fresh candidate, then run the same guarded matrix. Never apply this rejected patch to production main.
