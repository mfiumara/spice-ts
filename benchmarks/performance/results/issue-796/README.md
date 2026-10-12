# Issue #796: M2 scaling decks after #784, next bottleneck

Base: main `6a39155b` (#784 check-free supernodal updates, #780 merged).
Machine: Apple M5 Pro (18 logical CPUs), 48 GiB, macOS 27.0.1 arm64, Node.js
v22.23.1, ngspice-47 (Homebrew, KLU compiled in). The host was shared with other
agent lanes; 1-minute load averages were 4-20 during this card and are given
next to the in-process measurements (`breakdown.txt`).

## 1. Which deck, which bottleneck

The #426 M2 harness on main (`scaling-m2.ts --sizes=1000,10000,50000
--ngspice-solvers=klu --warmups=1 --runs=3`, `scaling-m2-before.json`) puts the
**resistor mesh OP** furthest behind ngspice-47 KLU again: 2.90x / 2.22x /
1.90x analysis time at 1k / 10k / 50k (RC ladder 1.39x / 1.52x / 1.08x, MOS1
inverter chain 1.33x / 0.53x / 0.92x). spice-ts's "analysis" is `compile` plus
the analysis inside `simulate()`; ngspice's is its "Total analysis time".

In process on main (`scripts/breakdown-ab.sh`, `breakdown.txt`), the mesh's
largest phases are the one sparse LU and `Circuit.compile`; after #784 the LU
is already within about 1.1x of KLU's (`issue-779/README.md`), and `compile`
is the largest phase at 1k and the second largest at 10k / 50k:

| main, in process | simulate | compile | compile share |
|---|---:|---:|---:|
| mesh 1,000 | 7.19 / 4.56 ms | 2.83 / 1.83 ms | 39% / 40% |
| mesh 10,000 | 75.0 / 63.6 ms | 23.6 / 19.4 ms | 31% / 30% |
| mesh 50,176 | 736 / 718 ms | 171 / 164 ms | 23% / 23% |
| RC ladder 10,000 | 209 / 275 ms | 39.8 / 70.6 ms | 19% / 26% |
| RC ladder 50,000 | 1001 / 1112 ms | 160 / 176 ms | 16% / 16% |

(two alternating rounds, load average 6.7-8.5). `compile` is not part of the
LU work ngspice-47 times either; it is the same for every analysis, so it is
also the one phase all three decks share.

Inside `compile` (`profiles/compile-subtree.txt`: CPU profile of 150
`compile()` calls on the 10k decks, self time of every frame under `compile`,
dist build), main spends:

| frame (main) | mesh 10k | RC ladder 10k |
|---|---:|---:|
| `resolveResistor` (model-default merge per resistor) | 23.9% | 10.5% |
| `CaseInsensitiveMap.set` (element-name map) | 22.4% | 24.5% |
| node-resolution closures (`globalNode` / `resolveNode`, `toUpperCase` per terminal) | 18.0% | 16.5% |
| `CaseFoldedNameSet.canonical` + `add` (`toLowerCase` per terminal, twice) | 15.4% | 13.7% |

Every node *reference* was case-folded four times (`toUpperCase` for the
`.global` lookup and `toLowerCase` in `add`, then both again in
`resolveNode`), although a deck has far fewer distinct spellings than
terminals; and every resistor without a model card still walked the
`.model R` default table and copied its instance parameters.

## 2. Change

`packages/core/src/circuit.ts` (`compile` only; `formatNumber` untouched),
`case-fold.ts`, `devices/resistor-model.ts`:

- **Fold each raw node spelling once.** The node pass memoises the display
  spelling per distinct raw reference string (`CaseFoldedNameSet.addCanonical`
  adds and returns the display spelling with one fold). Insertion order, and
  so the first-spelling rule of #728, is unchanged.
- **Resolve display spellings directly.** `resolveNode` first looks the name
  up in the node index map: a key of that map is a display spelling, which
  folds onto itself, and `.global` maps a name to a spelling with the same
  fold, so the hit equals the folding path's answer. Other spellings (a case
  variant, a defaulted MOS bulk) use the memo, then the old folding path.
- **No `.global` lookup without globals.** `globalNode` is the identity when
  the deck declares none.
- **Resistors without a model card** read their instance parameters directly
  instead of merging an empty model-default table into a copy.

No numeric code changed. Compiled node names, node indices and device order
are identical (`compile-bench.mts` digests), and so are the results.

### Measured and not kept: a lazily filled element-name map

Deferring `CaseInsensitiveMap.set` until a K / F / H / W / B `i()` / XSPICE
lookup needs it removed the largest remaining compile frame (compile 2.3-2.9x
on the mesh, 1.6-2.1x on the RC ladder, 1.2-1.5x on the MOS chain in a
three-round `compile-ab.sh` run). It made the **MOS1 inverter chain 10k
transient 4-5% slower** in paired fresh-process A/B (0.96x, 0.94..0.98, 7/7
rounds), with bit-identical results. Bisecting with esbuild builds
(`lazy-map-bisect/`, main vs each variant, 7 concurrent pairs each):

| variant | MOS chain 10k paired wall ratio | CPU |
|---|---:|---:|
| this card's changes + lazy map | 0.96x (0.95..0.96) | 0.96x |
| node folding only (lazy map reverted) | **1.00x** (0.99..1.00) | 1.00x |
| lazy map only (node folding reverted) | 0.95x (0.92..0.96) | 0.95x |
| lazy map + `bindXspiceSources` still called | 0.95x (0.94..0.97) | 0.95x |
| lazy map, but the map built at the end of compile | 0.95x (0.93..1.01) | 0.95x |
| swapped A/B order (lazy branch as "before") | main 1.06x faster | 1.05x |

Building the same map at the end of `compile` instead of interleaved with the
devices is enough to lose the 4-5%, so the cause is where the device objects
end up in the heap, not the work skipped; the transient's device loop is
sensitive to it. The lazy map is therefore not in this PR. The first
all-cell A/B and compile A/B that included it were overwritten by the final
runs (the figures quoted above are from their summaries); the bisect JSONL
is the retained evidence.

## 3. Correctness

- New guard tests, `packages/core/src/compile-fast-paths.test.ts` (7 tests):
  - 40 random mixed-case decks (with and without `.global`), every device
    terminal index compared with an independent implementation of the
    folding rule;
  - a defaulted MOS bulk and a later case variant of an earlier node;
  - K cards before, between and after their inductors (bit-identical
    waveforms, ngspice-47 vmax 0.45701);
  - F, H, W and B `i()` bound through case variants; an unknown control
    source still errors;
  - `resolveResistor` without a model leaves its instance parameters
    untouched and with a model still applies the card defaults.
  They pass on main too. **6/6 mutants of the kept code fail them**
  (`scripts/mutants.sh`, `mutants.txt`).
- Targeted suites: `pnpm -C packages/core exec vitest run src/solver src/mna
  src/analysis src/simulate.test.ts src/circuit.test.ts src/case-fold.test.ts
  src/case-folding.test.ts src/compile-fast-paths.test.ts src/devices
  src/parser` → 181 files, 2628 tests passed. `pnpm build` and `pnpm lint`
  (all packages) pass.
- Aggregate corpus (`issue-740/scripts/corpus-compare.mts`, #486 digest of
  the full `EngineExecution`): **100/100 fixtures bit-identical** to main
  (`corpus-compare.json`).
- Every paired A/B sample has the same result hash in both builds; the mesh
  hashes equal the #727 / #779 receipts (`cc196ac6…`, `73da6824…`,
  `2cc38025…`). Every M2 probe value is identical before and after
  (`m2-table.md`).

## 4. Speed

### `compile()` alone (`compile-ab.jsonl`, `compile-ab-summary.md`)

`scripts/compile-ab.sh`: parse once, two warmups, then 41 / 15 / 7 timed
`compile()` calls per fresh `tsx` process at 1k / 10k / 50k, main's sources
and the branch's alternating, three rounds (load average 6-7).

| deck | main ms | branch ms | paired speedup (min..max) |
|---|---:|---:|---:|
| mesh 1,000 | 1.80 | 1.06 | 1.70x (1.51..1.86) |
| mesh 10,000 | 26.4 | 16.7 | 1.64x (1.58..1.79) |
| mesh 50,000 | 171 | 115 | 1.50x (1.47..1.61) |
| RC ladder 1,000 | 1.74 | 1.20 | 1.42x (1.41..1.64) |
| RC ladder 10,000 | 22.6 | 16.8 | 1.32x (1.32..1.41) |
| RC ladder 50,000 | 134 | 110 | 1.23x (1.18..1.32) |
| MOS chain 1,000 | 8.47 | 7.53 | 1.12x (1.11..1.15) |
| MOS chain 10,000 | 95.4 | 83.1 | 1.18x (1.02..1.28) |
| MOS chain 50,000 | 630 | 574 | 1.13x (1.06..1.14) |

In `simulate()` (`breakdown.txt`), compile's share of the mesh drops from
39-40% to 30-31% at 1k, 30-31% to 18-19% at 10k and 23% to 17-18% at 50k
(compile 171 / 164 → 91 / 89 ms at 50k). The other phases of those rows moved
with the load (main's 50k `simulate` read 718-736 ms against 508-525 ms on the
branch, more than compile explains), so only the compile column is attributed
to this change.

After the change the largest compile frames are the element-name map
(`set`, 28%), `compile`'s own body (28%) and the node closures (13-15%)
(`profiles/compile-subtree.txt`).

### Paired fresh-process A/B (`ab.jsonl`)

`benchmarks/results/issue-486/ab.mjs <main-dist> <branch-dist> 7 … --concurrent`
under `spice-heavy` (both samples of a pair start together in fresh `node`
processes; one warmup, one timed parse + `simulate()`); >1 = this change is
faster.

| cell | before median (min) ms | after median (min) ms | paired wall ratio (min..max) | paired CPU ratio | hash identical |
|---|---:|---:|---:|---:|---|
| rc-ladder-tran 1k | 53.4 (51.4) | 51.1 (50.6) | 1.04x (1.01..1.07) | 1.03x | yes |
| rc-ladder-tran 10k | 293 (286) | 281 (270) | 1.04x (1.02..1.09) | 1.06x | yes |
| rc-ladder-tran 50k | 1354 (1344) | 1319 (1291) | 1.03x (1.02..1.05) | 1.03x | yes |
| resistor-mesh-op 1k | 20.5 (20.1) | 19.8 (19.4) | 1.03x (1.02..1.09) | 1.02x | yes |
| resistor-mesh-op 10k | 166 (162) | 155 (148) | 1.06x (1.04..1.20) | 1.01x (0.98..1.17) | yes |
| resistor-mesh-op 50k | 931 (871) | 875 (807) | 1.07x (1.04..1.10) | 1.07x | yes |
| cmos-inverter-chain-tran 1k | 286 (284) | 285 (273) | 1.01x (0.99..1.05) | 1.01x | yes |
| cmos-inverter-chain-tran 10k | 2931 (2896) | 2935 (2902) | **1.00x (0.99..1.01)** | 1.00x (0.98..1.00) | yes |

Reading it honestly: a fresh-process sample also contains Node start-up,
module load and parsing, so a 1.2-1.7x compile gain shows up as 3-7% on the
mesh and RC ladder. The MOS chain is dominated by its transient and is
unchanged; its 10k CPU ratio reaches 0.98x in one pair, inside the spread.

### Against ngspice-47 KLU (same decks, `m2-table.md`)

The #426 harness re-run on this branch (`scaling-m2-after.json`) against the
main run (`scaling-m2-before.json`). The two runs were **not load-paired**:
ngspice's own analysis time moved by up to 37% between them (MOS chain 10k
6.50 → 4.08 s), so the before/after columns are not this change's
attribution; the paired A/B above is.

| deck | nodes | spice-ts analysis before / after | ngspice KLU analysis before / after run | spice-ts / KLU, before run | spice-ts / KLU, after run |
|---|---:|---:|---:|---:|---:|
| rc-ladder-tran | 1,000 | 20.1 / 23.4 ms | 14.5 / 14.2 ms | 1.39x | 1.65x |
| rc-ladder-tran | 10,000 | 192 / 192 ms | 127 / 147 ms | 1.52x | 1.31x |
| rc-ladder-tran | 50,000 | 942 ms / 1.02 s | 872 ms / 1.04 s | 1.08x | 0.99x |
| resistor-mesh-op | 1,024 | 7.7 / 10.1 ms | 2.7 / 3.1 ms | 2.90x | 3.28x |
| resistor-mesh-op | 10,000 | 87.2 / 110 ms | 39.3 / 45.4 ms | 2.22x | 2.42x |
| resistor-mesh-op | 50,176 | 738 / 694 ms | 388 / 422 ms | 1.90x | 1.65x |
| cmos-inverter-chain-tran | 1,000 | 212 / 238 ms | 160 / 172 ms | 1.33x | 1.38x |
| cmos-inverter-chain-tran | 10,000 | 3.47 / 2.95 s | 6.50 / 4.08 s | 0.53x | 0.72x |
| cmos-inverter-chain-tran | 50,000 | 51.6 / 37.6 s | 56.2 / 60.8 s | 0.92x | 0.62x |

**ngspice-47 KLU still wins the resistor mesh (1.65-3.3x), the RC ladder at
1k and 10k (1.3-1.65x) and the 1k MOS chain (1.4x) in both runs.** The
after-run mesh 1k and 10k cells and RC 1k cell read *worse* than the
before-run although the paired A/B has the branch faster on all three; that is
the unpaired load, and it is published as measured. The RC ladder 50k (0.99x)
and the MOS chain 10k / 50k cells read spice-ts faster, as in earlier runs,
but they are unpaired and are not claimed as wins.

## 5. Remaining scope

- **The element-name map** (`CaseInsensitiveMap.set`) is now the largest
  compile frame (28%). Filling it lazily is the obvious fix but costs the MOS
  chain 10k transient 4-5% through heap placement (section 2); a fix needs
  either a cheaper eager map or an understanding of the transient's
  sensitivity to device placement.
- **Heap-placement sensitivity of the transient device loop.** That a change
  in *when* a compile-time map is allocated moves the MOS chain transient by
  5% suggests the device state (one object graph per MOSFET) is
  cache/TLB-bound; a struct-of-arrays state layout (as #653 did for stamping)
  may be worth a card.
- **`compile`'s own body** (28%): per-device closures (`_steps.some(...)` per
  resistor, `desc.nodes.map(resolveNode)`), and the MOS path's
  `{ ...modelParams, ...desc.params }` copy per instance.
- **Parsing** is not in the M2 analysis time but is 23-40% of in-process
  parse + `simulate()` on the mesh (`parse` column of `breakdown.txt`).
- AMD ordering and the left-looking heap, as listed in #779.

## Reproduce

```sh
pnpm install --frozen-lockfile && pnpm build
D=benchmarks/performance/results/issue-796
# a copy of main's packages/core/src in <main-src>, main's dist in <main-dist>
pnpm -C packages/core exec vitest run src/compile-fast-paths.test.ts
bash $D/scripts/mutants.sh
bash $D/scripts/compile-ab.sh <main-src> 3 /tmp/compile-ab.jsonl
node $D/scripts/compile-ab-summary.mjs /tmp/compile-ab.jsonl
bash $D/scripts/breakdown-ab.sh <main-src> /tmp/breakdown.txt 2
node --import tsx --cpu-prof --cpu-prof-dir=/tmp/prof $D/scripts/compile-bench.mts resistor-mesh-op 10000 150 packages/core/dist
node $D/scripts/subtree-summary.mjs /tmp/prof/<file>.cpuprofile compile 10
spice-heavy node benchmarks/results/issue-486/ab.mjs <main-dist> packages/core/dist 7 /tmp/ab.jsonl --concurrent \
  rc-ladder-tran:1000 rc-ladder-tran:10000 rc-ladder-tran:50000 resistor-mesh-op:1000 \
  resistor-mesh-op:10000 resistor-mesh-op:50000 cmos-inverter-chain-tran:1000 cmos-inverter-chain-tran:10000
node benchmarks/results/issue-486/ab-summary.mjs /tmp/ab.jsonl [--cpu]
# corpus: <root>/packages/core/dist is the build under test
spice-heavy npx tsx benchmarks/performance/results/issue-740/scripts/corpus-compare.mts <main-root> . /tmp/corpus.json
spice-heavy pnpm exec tsx benchmarks/performance/scaling-m2.ts --sizes=1000,10000,50000 \
  --ngspice-solvers=klu --warmups=1 --runs=3 --timeout-s=600 --output=/tmp/m2.json
node benchmarks/performance/results/issue-769/scripts/m2-table.mjs <before.json> <after.json>
# lazy-map bisect: variant source trees, esbuild bundles, then ab.mjs main vs each
python3 $D/scripts/make-variants.py <lazy-map-branch-src> /tmp/var
npx esbuild /tmp/var/<variant>/index.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/var/dist-<variant>/index.js --external:eecircuit-engine
```

`scripts/sim-time.mjs <dist> <circuit> <nodes> [runs]` times parse +
`simulate()` in one process for a given dist (used while bisecting).
`make-variants.py` expects the lazy-map version of `circuit.ts` (the reverted
variant described in section 2), so it only reproduces the bisect.
