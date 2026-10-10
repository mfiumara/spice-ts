# Issue 369 tokenizer and number-parse receipt

Scope: `packages/core/src/parser/tokenizer.ts` and its test. Nothing else in the
engine changed. Base: `d3eaf5a` (main). Host: Apple M5 Pro (18 logical CPUs,
48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, ngspice-47.

## What changed

- `parseNumber`: the plain-number regex test, the `Number()` probe and two more
  `match()` calls are now one `exec()` of the suffixed-number regex. The
  embedded RKM regex (`3k3`) runs only when that fails. The two forms can't both
  match: embedded needs a digit after the scale letter, suffixed allows only
  letters there. So the order doesn't change any result.
- `tokenizeNetlist`: lines are taken with `indexOf('\n')` instead of `split`.
  Continuation lines go into one pending string instead of a `mergedLines`
  array. `.toUpperCase()` runs only on lines of 4 characters or fewer, since
  `toUpperCase` never makes a string shorter. Each line is tokenized by one
  `match(/[()]|[^\s(),]+/g)`, which replaces 4 `replace()` passes, a `split` and
  a `filter`. The `\s*=\s*` replace still runs, but only on lines that contain `=`.

No observable behavior changed. The pinned quirks were kept as-is. For example,
`1e3k` is still rejected, because the old code built `1e3e3`, which is NaN.

## Behavior evidence

- `tokenizer.test.ts` adds 13 pin tests and 2 deterministic differential fuzz
  tests. The fuzz tests compare against a verbatim copy of the base
  implementation: 20,000 `parseNumber` tokens and 5,000 netlists, including
  Unicode whitespace, comments, continuations, braces, `=`, parens and commas.
  All of these tests passed on the unmodified base implementation before the
  rewrite.
- Sabotage run (`sabotage.mjs`, results in `sabotage.json`): every one of the
  11 single-point mutations of the new code fails at least one test.
- Public output hashes (`output-hashes.mjs`, using the issue-356 method) are
  byte-identical before and after, and identical to issue-356. OP for 1k, 5k
  and 10k nodes is `528b99b1…22094` (385 bytes). The 1,001-point DC sweep is
  `7bea0bb1…99d1` (12,993 bytes). See `output-hashes-before.json` and
  `output-hashes-after.json`.
- `pnpm bench:accuracy` results are identical between the base worktree and this
  branch, apart from the run date (`accuracy-compare.json`).

## Performance evidence and its limits

Every run happened on a heavily shared host, with load averages of 27–75 from
other workloads during the runs. The ngspice internal analysis medians moved by
up to 5x between back-to-back runs of the same netlist, so treat single
end-to-end numbers as noise-dominated. For that reason, before and after were
always measured back to back or interleaved.

Component level (`tokenizer-microbench.mjs`): legacy and new run in the same
process, interleaved, with the order alternating each round. 10k-node ladder,
20 warmups, 60 runs, medians.

| Workload | Before | After | Ratio |
| --- | ---: | ---: | ---: |
| `tokenizeNetlist` (full netlist) | 12.654 ms | 6.208 ms | 2.04x faster |
| `parseNumber` (10,000 values) | 2.439 ms | 1.548 ms | 1.58x faster |

Cold start (`cold-start.mjs`): 10 fresh processes per implementation and size,
alternating, tokenize plus parse. "First call" is the first pass in a fresh
process. "Window" is the median of calls 4–13, which is the window
`bench:scaling` measures.

| Nodes | First call before | First call after | Window before | Window after |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.376 ms | 1.765 ms | 1.540 ms | 0.720 ms |
| 5,000 | 20.176 ms | 5.581 ms | 9.138 ms | 5.166 ms |
| 10,000 | 34.528 ms | 16.037 ms | 16.153 ms | 8.333 ms |

A hand-written character scanner was tried first and then dropped. It was
faster when warm, but its first call was slower than the legacy code at 1k
(2.28 → 3.35 ms) and 5k (12.37 → 21.43 ms). That made one-shot `simulate()`
calls slower, so it was not kept.

End to end (`run-ab.sh`): the acceptance command is
`pnpm bench:scaling -- --sizes=1000,5000,10000 --warmups=3 --runs=10`. It was
run in a base worktree at `d3eaf5a` and on this branch, back to back, for three
rounds. The values are spice-ts public `simulate()` medians, and the full
reports are in `scaling-{before,after}-r{1,2,3}.json`.

| Round | Nodes | Before | After | Before/after |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1,000 | 4.628 ms | 4.268 ms | 1.08x |
| 1 | 5,000 | 19.368 ms | 19.772 ms | 0.98x (loss) |
| 1 | 10,000 | 133.033 ms | 49.829 ms | 2.67x |
| 2 | 1,000 | 3.944 ms | 3.667 ms | 1.08x |
| 2 | 5,000 | 13.823 ms | 16.042 ms | 0.86x (loss) |
| 2 | 10,000 | 47.360 ms | 48.277 ms | 0.98x (loss) |
| 3 | 1,000 | 3.983 ms | 3.976 ms | 1.00x |
| 3 | 5,000 | 13.423 ms | 11.440 ms | 1.17x |
| 3 | 10,000 | 33.977 ms | 44.134 ms | 0.77x (loss) |

Four of the nine pairs are losses, and the spread is far larger than the
component saving, which is about 8–10 ms at 10k nodes in the window above.
**No end-to-end speedup is claimed.** On this host the change can't be
separated from load noise at whole-workload level. Peak RSS moved in both
directions as well (see `ab-summary.json`), so no memory claim is made either.

CPU profiles (`profiles/tokenizer-{before,after}-r{1,2,3}.cpuprofile`) cover the
same workload as issue-356 (`profile-spice-ts.mjs 10000 20`). The table gives
self samples for `tokenizeNetlist` + `tokenizeLine` + `parseNumber`:

| Round | Before | After |
| ---: | ---: | ---: |
| 1 | 35 of 346 | 19 of 273 |
| 2 | 34 of 311 | 11 of 280 |
| 3 | 21 of 272 | 16 of 301 |

These are directional samples. Under this load the effective sampling interval
was much coarser than the nominal 1 ms.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm build
pnpm -C packages/core exec vitest run src/parser/tokenizer.test.ts
node benchmarks/results/issue-369/sabotage.mjs "$PWD" /tmp/sabotage.json
node benchmarks/results/issue-369/output-hashes.mjs /tmp/hashes.json
pnpm exec tsx benchmarks/results/issue-369/tokenizer-microbench.mjs /tmp/microbench.json
pnpm exec tsx benchmarks/results/issue-369/cold-start.mjs /tmp/cold-start.json
git worktree add --detach /tmp/spice-ts-base d3eaf5a && (cd /tmp/spice-ts-base && pnpm install --frozen-lockfile)
sh benchmarks/results/issue-369/run-ab.sh /tmp/spice-ts-base 1   # writes scaling + profiles for round 1
node benchmarks/results/issue-369/summarize-ab.mjs 1 && node benchmarks/results/issue-369/print-summary.mjs
```

`legacy-tokenizer.mts` is a verbatim copy of the base tokenizer, minus its
unused `ParseError` import. It exists only as the "before" side of the
in-process benchmarks.
