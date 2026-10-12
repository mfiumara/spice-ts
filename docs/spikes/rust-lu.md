# Spike: Rust sparse LU vs the TypeScript LU (#802)

Status: proof of concept, measurement only. Nothing in `@spice-ts/core` changed; Rust is not on any runtime
path, CI required check or published package.

## Question

On the M2 scaling decks, how much faster is a Rust sparse LU than spice-ts' TypeScript LU when called from
Node, as a native addon (napi-rs) and as WASM (wasm-bindgen)? Proposed gate: proceed to a phased Rust core
migration only if Rust is at least 3x faster end-to-end on the 10k and 50k-node decks, in an
equal-algorithm comparison.

## Answer

**No-go.** No configuration reaches 3x on any 10k/50k deck.

- **Equal algorithm.** The Rust port runs the same algorithm as the TS solver at the spike's base commit
  `45d6ea7`, and its results are bit-identical. Rust is 1.5-2.4x faster on symbolic+factor+solve called from
  Node, and 1.1-1.8x on the pivot-reuse refactor. WASM is usually slower than native.
- **Against current `main`.** Since the base commit, `main` gained supernodal block updates in the TS
  factorization (#727, #779). The same Rust port is now *slower* than TS on the deck where LU matters most:
  full factor of the 50k resistor mesh takes 253 ms in TS vs 280-344 ms in Rust. One algorithm change in
  TypeScript was worth more than the language change. On the other decks the Rust port is 1.1-2.9x faster
  on LU calls that take a few milliseconds or less.
- **End to end.** With the Rust LU swapped into the full DC operating point (OP) on current `main`, the
  10k/50k decks run 1.0-1.2x faster (native). LU is 3-6% of OP time on the ladder and inverter-chain decks
  and 33-48% on the mesh. Device evaluation and stamping dominate the rest, and they dominate ngspice's
  time too.
- **Gap to ngspice.** ngspice's KLU factors the 50k mesh in 90 ms, against 253 ms for the current TS and
  280 ms for the Rust port. The fill is comparable (within 7% of SuperLU's minimum degree), so the remaining
  gap is in the algorithm and data layout, not the language.

## What was built

- `rust/spice-lu`: a pure-Rust, dependency-free, line-by-line port of
  `packages/core/src/solver/{amd-ordering,gilbert-peierls}.ts` at `45d6ea7`. It keeps:
  - the same AMD on A + Aᵀ and the "structural column singletons first" step;
  - the left-looking column-Crout kernel with its min-heap of active columns;
  - threshold partial pivoting (0.1, preferring the diagonal);
  - the identical-input skip;
  - the pivot-reuse refactor that only succeeds when the full kernel would choose the same pivots.

  The supernodal updates added on `main` later are *not* ported. Unit tests are in
  `rust/spice-lu/tests/solver.rs` (`cargo test -p spice-lu`, 7 pass).
- `rust/spice-lu-node`: napi-rs v2 addon. It borrows the caller's typed arrays without copying and solves in
  place, like the TS solver. `dispose()` frees a solver eagerly.
- `rust/spice-lu-wasm`: wasm-bindgen 0.2.128, `wasm32-unknown-unknown` with `+simd128`, `--target nodejs`.
  It uses standard slice marshalling (`&[f64]` is copied in; `&mut [f64]` is copied in and back out).
- `benchmarks/rust-lu-spike/`: matrix dump, LU harness, OP swap harness, report and an optional SciPy fill
  reference. Its README has the reproduction commands.

The matrices are the real Newton systems spice-ts builds for the OP of the three M2 decks (`.tran` replaced
by `.op`; the mesh is already an OP deck). They were captured from the unchanged TS solver:

| deck | n | nnz(A) | OP factorizations (pivot reuse) |
|---|---:|---:|---:|
| rc-ladder 1k / 10k / 50k | 1001 / 10001 / 50001 | 3000 / 30000 / 150000 | 1 (0) |
| resistor-mesh 1k / 10k / 50k | 1025 / 10001 / 50177 | 4994 / 49602 / 249986 | 1 (0) |
| cmos-chain 1k / 10k / 50k | 1002 / 10002 / 50002 | 3998 / 39998 / 199998 | 143 / 232 / 1123 (91 / 128 / 974) |

## Method

- Machine: Apple M5 Pro, 18 logical CPUs, 48 GiB, macOS 27; Node v22.23.1; rustc 1.96.0; ngspice-47.
- The Mac is shared by several benchmark lanes (load average about 9-11), and heavy runs were serialised
  with `spice-heavy`. Absolute times are noisy; ratios within a run are more stable. Every raw sample is
  committed in `benchmarks/rust-lu-spike/results/`.
- `results/`: run on this branch rebased onto current `main`. The TS backend is `main`'s solver;
  `versions.gitHead` records the commit.
- `results/base-45d6ea7/`: the equal-algorithm run, with the TS solver at the base commit the Rust port
  was taken from.
- LU harness (`bench.ts`):
  - Each backend/deck cell runs in a fresh Node child.
  - A fresh solver per run does analyze (symbolic), a factor of the first OP matrix, one solve, and then a
    same-pattern factorize of a second matrix.
  - Medians are over 5 timed runs after 10 untimed warm-ups. The warm-ups matter: with 1-2 warm-ups, TS on
    the 1k decks looked 10-20x slower than Rust, which measures V8 tiering, not the kernel.
  - Native and WASM times include the JS-to-Rust call and argument marshalling. `rust-pure` is the Rust
    binary timing itself with no Node involved.
- OP swap (`op-swap.ts`):
  - `GilbertPeierlsSolver.prototype` is patched in a child process so that analyze/factorize/solve go to
    the Rust backend. The parser, device load, stamping, CSC assembly and Newton loop stay the unchanged
    TypeScript.
  - Medians are over 5 runs after 5 warm-ups. The 50k inverter chain gets 3 runs and no warm-up, because a
    single run is about 65 s.
  - Rust solvers of finished runs are freed explicitly; see Memory.

## Results

### Go/no-go 1: equal algorithm (TS at `45d6ea7`), LU called from Node

| deck | native: symbolic+factor+solve | native: refactor+solve | wasm: symbolic+factor+solve | wasm: refactor+solve |
|---|---:|---:|---:|---:|
| rc-ladder-10k | 2.1x | 1.3x | 1.7x | 1.2x |
| rc-ladder-50k | 2.4x | 1.4x | 1.8x | 1.5x |
| resistor-mesh-10k | 2.2x | 1.7x | 2.0x | 1.4x |
| resistor-mesh-50k | 1.5x | 1.1x | 2.1x | 1.3x |
| cmos-chain-10k | 2.0x | 1.6x | 1.6x | 1.1x |
| cmos-chain-50k | 2.2x | 1.8x | 1.8x | 1.2x |

An earlier full run of the same harness and commit, on a less loaded host, gave native 1.8-2.5x and
1.1-1.9x (`results/base-45d6ea7/run1-lu-medians.log`). The ranges overlap and neither reaches 3x. The
mesh-50k native cell moves the most between runs (2.4x vs 1.5x).

### Go/no-go 2: current `main` TS (supernodal #727/#779) vs the same Rust port

This is not an equal-algorithm comparison: TS now has supernodal block updates and the Rust port does not.

| deck | native: symbolic+factor+solve | native: refactor+solve | wasm: symbolic+factor+solve | wasm: refactor+solve |
|---|---:|---:|---:|---:|
| rc-ladder-10k | 2.9x | 1.6x | 2.2x | 1.9x |
| rc-ladder-50k | 1.7x | 1.1x | 2.0x | 1.6x |
| resistor-mesh-10k | 1.4x | 1.6x | 1.2x | 1.3x |
| resistor-mesh-50k | **0.9x** | 1.5x | 1.0x | 1.3x |
| cmos-chain-10k | 2.1x | 1.8x | 1.5x | 1.1x |
| cmos-chain-50k | 2.4x | 1.7x | 1.8x | 1.2x |

Median ms for resistor-mesh-50k, the one deck where LU dominates:

| backend | symbolic | full factor | solve | refactor |
|---|---:|---:|---:|---:|
| TS at `45d6ea7` | 76.7 | 612.0 | 3.1 | 184.2 |
| TS on `main` | 79.0 | 252.8 | 3.6 | 189.6 |
| Rust port (pure / native / wasm) | 22.6 / 28.3 / 26.6 | 279.7 / 344.4 / 319.0 | 3.3 / 3.8 / 2.4 | 128.0 / 127.3 / 151.7 |
| ngspice-47 KLU (whole OP, acct) | reorder 224.2 | factor 90.4 | solve 7.1 | - |

"refactor" in both go/no-go tables is the pivot-reuse kernel on its own: the first matrix with a
deterministic ±3e-6 relative perturbation, factored right after the first matrix. Reuse succeeded on every
deck and backend.

On the inverter chain, the last OP Newton matrix does not pass the reuse test against the first matrix,
so TS and Rust both fall back to a full factorization there. They agree, and the appendix marks those
cells "(full)".

### Correctness: bit-identical

In both runs, on every deck, both Rust backends produce the same column ordering as TS and a solution `x`
that is bit-identical in every entry (max relative difference 0). Since `main`'s supernodal kernel is
documented as bit-identical, this also holds against current `main`. The OP swap gives bit-identical node
voltages on all 9 decks in both runs.

Relative residuals ‖Ax−b‖/‖b‖ are the same for all backends: 1e-23 to 1e-16 on the mesh and chain decks,
and 6e-13 to 1.3e-9 on the RC ladder. For the ladder the OP right-hand side is all zero (its PULSE source is
0 at t=0), so the harness uses a deterministic synthetic RHS and flags it. The ladder's residual reflects
the conditioning of a resistor-only ladder at DC.

### End-to-end DC OP with the LU swapped, current `main` (parse + simulate, median ms)

| deck | runs | TS total | TS in LU | LU share | native total | native in LU | wasm total | wasm in LU | OP speed-up native / wasm | node voltages bit-identical |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| rc-ladder-1k | 5 | 5.0 | 0.2 | 5% | 4.6 | 0.1 | 4.6 | 0.1 | 1.1x / 1.1x | 1000/1000 / 1000/1000 |
| rc-ladder-10k | 5 | 48.6 | 1.7 | 3% | 48.0 | 0.7 | 47.7 | 0.9 | 1.0x / 1.0x | 10000/10000 / 10000/10000 |
| rc-ladder-50k | 5 | 357.3 | 11.3 | 3% | 356.4 | 5.0 | 354.0 | 5.8 | 1.0x / 1.0x | 50000/50000 / 50000/50000 |
| resistor-mesh-1k | 5 | 9.0 | 2.0 | 22% | 8.1 | 1.2 | 8.9 | 1.4 | 1.1x / 1.0x | 1024/1024 / 1024/1024 |
| resistor-mesh-10k | 5 | 105.1 | 34.9 | 33% | 94.2 | 25.7 | 98.1 | 28.6 | 1.1x / 1.1x | 10000/10000 / 10000/10000 |
| resistor-mesh-50k | 5 | 767.0 | 370.8 | 48% | 705.9 | 310.9 | 762.5 | 347.6 | 1.1x / 1.0x | 50176/50176 / 50176/50176 |
| cmos-chain-1k | 5 | 172.7 | 7.2 | 4% | 169.5 | 4.9 | 170.9 | 6.0 | 1.0x / 1.0x | 1000/1000 / 1000/1000 |
| cmos-chain-10k | 5 | 2801.8 | 154.5 | 6% | 2314.4 | 75.7 | 2573.5 | 102.0 | 1.2x / 1.1x | 10000/10000 / 10000/10000 |
| cmos-chain-50k | 3 | 67485.9 | 2383.1 | 4% | 64998.8 | 1450.4 | 53095.4 | 1357.6 | 1.0x / 1.3x | 50000/50000 / 50000/50000 |

Notes:

- **cmos-chain-10k.** The native total is about 490 ms lower than TS, but only about 80 ms of that is LU
  time. The non-LU part is also consistently lower, by about 400 ms across all 5 samples. The cause was not
  investigated. GC pressure from the TS solver's own typed-array traffic is one hypothesis; it is not
  established here.
- **cmos-chain-50k.** Single OP runs range from 52 s to 82 s across backends because of host load. That
  range is far larger than the LU time (1.4-2.4 s), so the 1.0x / 1.3x there is noise, not a result.
- **Equal-algorithm OP run** (`results/base-45d6ea7/rust-lu-op-swap.json`, 2 warm-ups): 1.0-1.1x on the
  10k/50k ladder and chain decks, 1.1x on mesh-10k, and 1.4x on mesh-50k, where the old TS kernel spent
  776 ms of a 1266 ms OP in the LU.

### ngspice-47 on the same OP decks (context only, current run, median of 3)

Times are in ms.

| deck | KLU total | KLU reorder | KLU factor | KLU solve | device load | spice-ts TS OP (swap table) |
|---|---:|---:|---:|---:|---:|---:|
| rc-ladder-50k | 77.6 | 3.2 | 0.9 | 1.6 | 2.7 | 357.3 |
| resistor-mesh-50k | 420.6 | 224.2 | 90.4 | 7.1 | 4.1 | 767.0 |
| cmos-chain-10k | 1333.2 | 1.4 | 109.8 | 101.3 | 992.4 | 2801.8 |
| cmos-chain-50k | 43810.0 | 9.8 | 2287.6 | 1407.4 | 38477.8 | 67485.9 |

The tables for every deck, both ngspice solvers and the 5-run base-commit measurement are in the
appendices. ngspice's phase timers are not the same quantities as ours: its "factor" accumulates over every
Newton iteration, and "reorder" includes Markowitz/KLU symbolic work. This is context, not a parity claim
in either direction.

### Fill reference (optional, SciPy 1.18.1 SuperLU, `results/fill-reference.jsonl`)

| deck | spice-ts L+U nnz (AMD) | SuperLU MMD(A+Aᵀ) L+U nnz | SuperLU COLAMD L+U nnz | SuperLU MMD factor ms |
|---|---:|---:|---:|---:|
| resistor-mesh-10k | 396,986 | 372,298 | 702,182 | 10.4 |
| resistor-mesh-50k | 2,988,840 | 2,816,214 | 5,706,226 | 92.7 |

Our AMD's fill is within 7% of SuperLU's minimum degree on A+Aᵀ, and well below COLAMD. The ordering is not
where the time goes.

### Memory

| deck (current run) | TS solver MiB | Rust solver MiB | WASM linear memory MiB | peak RSS TS / native / wasm MiB |
|---|---:|---:|---:|---|
| resistor-mesh-50k | 72.0 | 53.0 | 73.3 | 350 / 640 / 248 |
| cmos-chain-50k | 12.5 | 10.2 | 13.6 | 223 / 204 / 201 |

The solver owns about the same number of bytes in TS at `45d6ea7` and in Rust. On `main` the TS solver
owns more (72 vs 53 MiB on mesh-50k), presumably for the supernode blocks. WASM linear memory never shrinks
and also holds the copied inputs.

Native and WASM allocations are invisible to V8's GC, so the harnesses free each Rust solver explicitly
(`dispose()` / `free()`). Without that, in this spike:

- WASM linear memory reached 831 MiB on mesh-50k in the LU harness;
- WASM OP times on mesh-10k grew from 140 ms to 460 ms over five runs. That was a superseded OP run
  without solver release; it was re-run and not committed.

A real integration would need explicit lifetime management. Peak RSS for the native mesh-50k cell reflects
transient doubling reallocations and macOS malloc retention; it is a process peak, not a steady state.

## Analysis: where the gap comes from

1. **Language (V8 JIT vs LLVM): about 1.4-2.4x on this kernel** at equal algorithm. The `rust-pure` and
   `rust-native` columns agree to within noise, so this is the language gap and not overhead. The kernel is
   integer-indexed typed-array code with no allocation in the hot loop, and TurboFan compiles it well.
   Bounds checks remain in the safe Rust; there is no SIMD-friendly inner loop to exploit.
2. **Marshalling: negligible for native, small for WASM.** A napi call that borrows a 250k-entry
   Float64Array takes about 0.3 µs. The WASM copy-in of the same array is 0.02-0.03 ms. WASM's real cost is
   the code: 32-bit wasm with bounds-checked linear memory is usually slower than native (up to about 1.5x;
   individual cells vary between runs). On some cells it is no faster than TS, for example rc-ladder-1k
   factor at the base commit.
3. **Algorithm and data layout: the larger lever.**
   - `main`'s supernodal TS kernel factors the 50k mesh 2.4x faster than the base TS kernel (253 vs
     612 ms). That is the same size as the whole Rust language gain, and it already beats the Rust port of
     the old kernel.
   - In the Rust port, the pivot-reuse path takes 128 ms against 280 ms for a full factor: same pattern,
     same flops. So about 55% of a full factorization is per-column bookkeeping: the min-heap that orders
     the active columns, the touched-row flags, the pivot search, and growing the factor arrays.
   - KLU (90 ms) and SuperLU (93 ms) factor the same matrix with comparable fill.

   A cheaper reach computation (topological DFS order, as in classic Gilbert-Peierls/KLU, instead of a
   heap), together with a symbolic factor computed once per topology, is the obvious next TS experiment.
   That is a hypothesis to test in a follow-up, not a measured result here.
4. **Amdahl: LU is not the bottleneck on most decks.** On the ladder and the nonlinear inverter chain, LU is
   3-6% of OP time, so even an infinitely fast LU gives at most about 1.06x. Device evaluation and stamping
   dominate. ngspice shows the same shape: on cmos-chain-50k, device load is 38.5 s of its 43.8 s. Only the
   resistor mesh is LU-bound, with 33-48% of OP time on `main`, because AMD fill grows faster than n and
   there is a single factorization.

## Recommendation

- **Do not start a Rust core migration on the LU's account.**
  - The equal-algorithm speed-up is 1.1-2.4x, not 3x.
  - Against current `main` the port is already behind on the LU-bound deck.
  - End-to-end OP gains are 1.0-1.2x.
  - WASM in particular gives little over V8 for this code. It adds a build toolchain, a manual memory
    lifetime model, and a second numeric implementation that would have to stay bit-identical to the TS
    one.
- **Spend the speed budget in TypeScript, driven by measurement.** Two follow-ups are proposed:
  (a) Replace the heap-ordered active set with a DFS topological reach and reuse a symbolic L/U pattern per
  topology, then re-measure against KLU on the mesh. This is the mesh/large-linear case where LU is 33-48%
  of the OP.
  (b) Profile device load and stamping on the inverter chain, which is about 95% of OP time and also
  dominates ngspice's time.
- **Revisit Rust only with new evidence.** For example: a similar spike shows device load/stamping in Rust at
  3x or more end to end, or a WASM-only deployment target needs a numeric kernel that V8 cannot optimise.

## If a migration is ever approved: phased sketch

The boundary stays the same at every phase. `@spice-ts/core`'s public TS API, the parser, the protocol/JSON
netlist layer, the MCP server and structured errors stay in TypeScript. Rust sits behind the existing
`SparseSolver` interface (and its successors) and must reproduce the TS results bit-for-bit, or within the
published benchmark thresholds, before each phase ships.

1. **LU** (this spike): a `SparseSolver` implementation behind `assembler.options.solverFactory`. Native for
   Node, WASM for browsers, with the TS solver kept as the fallback and the reference. It needs explicit
   `dispose()` wiring wherever an assembler is dropped. Exit gate: the corpus/parity suite is unchanged,
   and the measured gain clears the gate against the then-current TS kernel.
2. **Device load/stamping**: move model evaluation and stamping into Rust, writing straight into the CSC
   value array the LU already owns. This removes the per-iteration boundary crossing, which is where a
   Rust LU alone loses its advantage. It needs a stable, serialisable device/model description handed over
   from the TS compiler.
3. **Transient/Newton driver**: move the timestep and Newton loops behind the same boundary. TS keeps
   orchestration, streaming, cancellation and result shaping.

Each phase gets its own spike-style go/no-go with the same honesty rules: identical inputs, bit-identity or
published error thresholds, losses reported.

## Limitations

- These are OP matrices only. In a transient, the Newton matrices differ: capacitor companion stamps make
  them more diagonally dominant, and pivot reuse runs much more often. The LU ratios should carry over,
  but this was not measured.
- The machine was shared and loaded. Runs were serialised through `spice-heavy`, but OP wall times on the
  largest decks still vary by up to 1.5x between samples.
- The TS solver was loaded from source through tsx (esbuild transform). This is the same code that tsup
  builds into `dist`, but it is not byte-identical JS.
- The Rust port is deliberately faithful to the `45d6ea7` kernel. No Rust-specific optimisation was tried
  (unchecked indexing, supernodes, a different reach algorithm), because the question was the language gap
  at equal algorithm. Porting `main`'s supernodal updates would presumably restore a 1.5-2.4x language
  margin on the mesh. That is unmeasured, and still short of 3x.

## Appendix A: full generated tables, current run (TS = `main`)

Generated by `pnpm exec tsx benchmarks/rust-lu-spike/report.ts`.

#### LU phases, median ms (5 runs after 10 warm-ups; fresh solver per run)

| deck | n | nnz | L+U nnz | backend | symbolic | factor | solve | refactor (Newton) | refactor (perturbed) | factor+solve vs TS | refactor(p)+solve vs TS |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-1k | 1001 | 3000 | 3000 | ts | 0.136 | 0.054 | 0.011 | 0.021 | 0.018 | 1.0x | 1.0x |
| rc-ladder-1k | 1001 | 3000 | 3000 | rust-pure | 0.058 | 0.026 | 7.3e-3 | 8.8e-3 | 8.9e-3 | 2.0x | 1.8x |
| rc-ladder-1k | 1001 | 3000 | 3000 | rust-native | 0.059 | 0.026 | 7.6e-3 | 0.011 | 8.5e-3 | 1.9x | 1.8x |
| rc-ladder-1k | 1001 | 3000 | 3000 | rust-wasm | 0.149 | 0.084 | 8.6e-3 | 0.035 | 0.034 | 0.7x | 0.7x |
| rc-ladder-10k | 10001 | 30000 | 30000 | ts | 1.598 | 0.603 | 0.110 | 0.224 | 0.198 | 1.0x | 1.0x |
| rc-ladder-10k | 10001 | 30000 | 30000 | rust-pure | 0.593 | 0.321 | 0.113 | 0.139 | 0.136 | 1.6x | 1.2x |
| rc-ladder-10k | 10001 | 30000 | 30000 | rust-native | 0.473 | 0.240 | 0.085 | 0.105 | 0.103 | 2.2x | 1.6x |
| rc-ladder-10k | 10001 | 30000 | 30000 | rust-wasm | 0.647 | 0.313 | 0.068 | 0.100 | 0.095 | 1.9x | 1.9x |
| rc-ladder-50k | 50001 | 150000 | 150000 | ts | 8.397 | 2.719 | 0.398 | 0.815 | 0.957 | 1.0x | 1.0x |
| rc-ladder-50k | 50001 | 150000 | 150000 | rust-pure | 3.006 | 1.524 | 0.482 | 0.933 | 0.591 | 1.6x | 1.3x |
| rc-ladder-50k | 50001 | 150000 | 150000 | rust-native | 3.945 | 2.232 | 0.496 | 0.776 | 0.704 | 1.1x | 1.1x |
| rc-ladder-50k | 50001 | 150000 | 150000 | rust-wasm | 3.133 | 2.173 | 0.350 | 0.514 | 0.473 | 1.2x | 1.6x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | ts | 1.049 | 1.774 | 0.055 | 0.473 | 0.465 | 1.0x | 1.0x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | rust-pure | 0.421 | 1.141 | 0.032 | 0.316 | 0.316 | 1.6x | 1.5x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | rust-native | 0.229 | 0.667 | 0.017 | 0.130 | 0.127 | 2.7x | 3.6x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | rust-wasm | 0.535 | 1.232 | 0.045 | 0.375 | 0.362 | 1.4x | 1.3x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | ts | 9.022 | 27.675 | 0.488 | 13.896 | 14.029 | 1.0x | 1.0x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | rust-pure | 3.943 | 23.640 | 0.390 | 9.211 | 9.354 | 1.2x | 1.5x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | rust-native | 3.676 | 23.110 | 0.365 | 8.559 | 8.465 | 1.2x | 1.6x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | rust-wasm | 3.905 | 26.285 | 0.453 | 10.190 | 10.514 | 1.1x | 1.3x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | ts | 78.975 | 252.762 | 3.594 | 190.522 | 189.637 | 1.0x | 1.0x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | rust-pure | 22.600 | 279.733 | 3.343 | 126.027 | 127.968 | 0.9x | 1.5x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | rust-native | 28.341 | 344.448 | 3.754 | 133.142 | 127.279 | 0.7x | 1.5x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | rust-wasm | 26.564 | 319.011 | 2.387 | 152.692 | 151.742 | 0.8x | 1.3x |
| cmos-chain-1k | 1002 | 3998 | 2999 | ts | 0.197 | 0.090 | 8.5e-3 | 0.085 (full) | 0.019 | 1.0x | 1.0x |
| cmos-chain-1k | 1002 | 3998 | 2999 | rust-pure | 0.076 | 0.048 | 6.0e-3 | 0.048 (full) | 0.012 | 1.8x | 1.5x |
| cmos-chain-1k | 1002 | 3998 | 2999 | rust-native | 0.069 | 0.047 | 4.4e-3 | 0.048 (full) | 0.012 | 1.9x | 1.7x |
| cmos-chain-1k | 1002 | 3998 | 2999 | rust-wasm | 0.182 | 0.061 | 6.0e-3 | 0.066 (full) | 0.017 | 1.5x | 1.2x |
| cmos-chain-10k | 10002 | 39998 | 29999 | ts | 1.591 | 0.973 | 0.079 | 1.013 (full) | 0.204 | 1.0x | 1.0x |
| cmos-chain-10k | 10002 | 39998 | 29999 | rust-pure | 0.696 | 0.569 | 0.057 | 0.582 (full) | 0.126 | 1.7x | 1.5x |
| cmos-chain-10k | 10002 | 39998 | 29999 | rust-native | 0.668 | 0.563 | 0.037 | 0.567 (full) | 0.121 | 1.8x | 1.8x |
| cmos-chain-10k | 10002 | 39998 | 29999 | rust-wasm | 0.861 | 0.795 | 0.057 | 0.824 (full) | 0.202 | 1.2x | 1.1x |
| cmos-chain-50k | 50002 | 199998 | 149999 | ts | 9.241 | 6.560 | 0.439 | 6.725 (full) | 1.141 | 1.0x | 1.0x |
| cmos-chain-50k | 50002 | 199998 | 149999 | rust-pure | 3.682 | 3.488 | 0.304 | 3.592 (full) | 0.724 | 1.8x | 1.5x |
| cmos-chain-50k | 50002 | 199998 | 149999 | rust-native | 3.383 | 3.217 | 0.283 | 3.211 (full) | 0.638 | 2.0x | 1.7x |
| cmos-chain-50k | 50002 | 199998 | 149999 | rust-wasm | 4.215 | 4.381 | 0.283 | 4.561 (full) | 1.054 | 1.5x | 1.2x |

#### Go/no-go: Rust speed-up over TS on the 10k and 50k decks (LU from Node, incl. marshalling)

| deck | native: symbolic+factor+solve | native: refactor(p)+solve | wasm: symbolic+factor+solve | wasm: refactor(p)+solve |
|---|---:|---:|---:|---:|
| rc-ladder-10k | 2.9x | 1.6x | 2.2x | 1.9x |
| rc-ladder-50k | 1.7x | 1.1x | 2.0x | 1.6x |
| resistor-mesh-10k | 1.4x | 1.6x | 1.2x | 1.3x |
| resistor-mesh-50k | 0.9x | 1.5x | 1.0x | 1.3x |
| cmos-chain-10k | 2.1x | 1.8x | 1.5x | 1.1x |
| cmos-chain-50k | 2.4x | 1.7x | 1.8x | 1.2x |

#### Accuracy vs the TS solution x (first OP Newton system)

| deck | backend | same column order as TS | bit-identical x entries | max rel diff | rel residual ‖Ax−b‖/‖b‖ | synthetic RHS |
|---|---|---|---:|---:|---:|---|
| rc-ladder-1k | rust-native | yes | 1001/1001 | 0.0e+0 | 5.7e-13 | yes |
| rc-ladder-1k | rust-wasm | yes | 1001/1001 | 0.0e+0 | 5.7e-13 | yes |
| rc-ladder-10k | rust-native | yes | 10001/10001 | 0.0e+0 | 7.2e-11 | yes |
| rc-ladder-10k | rust-wasm | yes | 10001/10001 | 0.0e+0 | 7.2e-11 | yes |
| rc-ladder-50k | rust-native | yes | 50001/50001 | 0.0e+0 | 1.3e-9 | yes |
| rc-ladder-50k | rust-wasm | yes | 50001/50001 | 0.0e+0 | 1.3e-9 | yes |
| resistor-mesh-1k | rust-native | yes | 1025/1025 | 0.0e+0 | 1.3e-17 | no |
| resistor-mesh-1k | rust-wasm | yes | 1025/1025 | 0.0e+0 | 1.3e-17 | no |
| resistor-mesh-10k | rust-native | yes | 10001/10001 | 0.0e+0 | 4.5e-17 | no |
| resistor-mesh-10k | rust-wasm | yes | 10001/10001 | 0.0e+0 | 4.5e-17 | no |
| resistor-mesh-50k | rust-native | yes | 50177/50177 | 0.0e+0 | 1.1e-16 | no |
| resistor-mesh-50k | rust-wasm | yes | 50177/50177 | 0.0e+0 | 1.1e-16 | no |
| cmos-chain-1k | rust-native | yes | 1002/1002 | 0.0e+0 | 7.5e-23 | no |
| cmos-chain-1k | rust-wasm | yes | 1002/1002 | 0.0e+0 | 7.5e-23 | no |
| cmos-chain-10k | rust-native | yes | 10002/10002 | 0.0e+0 | 1.2e-22 | no |
| cmos-chain-10k | rust-wasm | yes | 10002/10002 | 0.0e+0 | 1.2e-22 | no |
| cmos-chain-50k | rust-native | yes | 50002/50002 | 0.0e+0 | 1.6e-19 | no |
| cmos-chain-50k | rust-wasm | yes | 50002/50002 | 0.0e+0 | 1.6e-19 | no |

#### Memory (solver-owned bytes after the run; child peak RSS includes Node + parsed matrices)

| deck | TS solver MiB | Rust solver MiB | WASM linear memory MiB | peak RSS TS / native / wasm MiB |
|---|---:|---:|---:|---|
| rc-ladder-1k | 0.2 | 0.2 | 1.3 | 117 / 109 / 115 |
| rc-ladder-10k | 2.1 | 1.7 | 3.2 | 151 / 125 / 132 |
| rc-ladder-50k | 10.7 | 8.6 | 11.8 | 207 / 196 / 197 |
| resistor-mesh-1k | 0.8 | 0.6 | 1.9 | 132 / 110 / 118 |
| resistor-mesh-10k | 10.4 | 7.8 | 11.9 | 203 / 146 / 149 |
| resistor-mesh-50k | 72.0 | 53.0 | 73.3 | 350 / 640 / 248 |
| cmos-chain-1k | 0.2 | 0.2 | 1.3 | 119 / 108 / 116 |
| cmos-chain-10k | 2.5 | 2.0 | 3.6 | 161 / 130 / 137 |
| cmos-chain-50k | 12.5 | 10.2 | 13.6 | 223 / 204 / 201 |

#### End-to-end DC OP with the LU swapped (parse + simulate, median ms)

| deck | runs | TS total | TS in LU | LU share | native total | native in LU | wasm total | wasm in LU | OP speed-up native / wasm | node voltages bit-identical |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| rc-ladder-1k | 5 | 5.0 | 0.2 | 5% | 4.6 | 0.1 | 4.6 | 0.1 | 1.1x / 1.1x | 1000/1000 / 1000/1000 |
| rc-ladder-10k | 5 | 48.6 | 1.7 | 3% | 48.0 | 0.7 | 47.7 | 0.9 | 1.0x / 1.0x | 10000/10000 / 10000/10000 |
| rc-ladder-50k | 5 | 357.3 | 11.3 | 3% | 356.4 | 5.0 | 354.0 | 5.8 | 1.0x / 1.0x | 50000/50000 / 50000/50000 |
| resistor-mesh-1k | 5 | 9.0 | 2.0 | 22% | 8.1 | 1.2 | 8.9 | 1.4 | 1.1x / 1.0x | 1024/1024 / 1024/1024 |
| resistor-mesh-10k | 5 | 105.1 | 34.9 | 33% | 94.2 | 25.7 | 98.1 | 28.6 | 1.1x / 1.1x | 10000/10000 / 10000/10000 |
| resistor-mesh-50k | 5 | 767.0 | 370.8 | 48% | 705.9 | 310.9 | 762.5 | 347.6 | 1.1x / 1.0x | 50176/50176 / 50176/50176 |
| cmos-chain-1k | 5 | 172.7 | 7.2 | 4% | 169.5 | 4.9 | 170.9 | 6.0 | 1.0x / 1.0x | 1000/1000 / 1000/1000 |
| cmos-chain-10k | 5 | 2801.8 | 154.5 | 6% | 2314.4 | 75.7 | 2573.5 | 102.0 | 1.2x / 1.1x | 10000/10000 / 10000/10000 |
| cmos-chain-50k | 3 | 67485.9 | 2383.1 | 4% | 64998.8 | 1450.4 | 53095.4 | 1357.6 | 1.0x / 1.3x | 50000/50000 / 50000/50000 |

#### ngspice-47 OP for context (same OP decks, median ms of .options acct)

| deck | solver | total analysis | reorder | factor | solve | load |
|---|---|---:|---:|---:|---:|---:|
| rc-ladder-1k | klu | 1.7 | 0.070 | 0.014 | 0.032 | 0.0 |
| rc-ladder-1k | sparse | 1.0 | 0.060 | 0.013 | 0.014 | 0.0 |
| rc-ladder-10k | klu | 13.7 | 0.722 | 0.178 | 0.412 | 0.5 |
| rc-ladder-10k | sparse | 5.2 | 0.544 | 0.117 | 0.140 | 0.6 |
| rc-ladder-50k | klu | 77.6 | 3.222 | 0.881 | 1.611 | 2.7 |
| rc-ladder-50k | sparse | 25.8 | 2.906 | 0.612 | 0.872 | 4.0 |
| resistor-mesh-1k | klu | 3.6 | 0.694 | 0.254 | 0.074 | 0.1 |
| resistor-mesh-1k | sparse | 14.7 | 11.618 | 1.995 | 0.154 | 0.5 |
| resistor-mesh-10k | klu | 54.0 | 23.173 | 7.862 | 1.009 | 0.8 |
| resistor-mesh-10k | sparse | 1510.3 | 1358.200 | 127.226 | 10.133 | 10.8 |
| resistor-mesh-50k | klu | 420.6 | 224.235 | 90.365 | 7.117 | 4.1 |
| resistor-mesh-50k | sparse | 48152.1 | 45407.400 | 2515.190 | 106.653 | 107.4 |
| cmos-chain-1k | klu | 61.6 | 0.145 | 6.810 | 6.133 | 39.9 |
| cmos-chain-1k | sparse | 62.1 | 2.797 | 4.094 | 5.153 | 44.0 |
| cmos-chain-10k | klu | 1333.2 | 1.379 | 109.833 | 101.326 | 992.4 |
| cmos-chain-10k | sparse | 1910.6 | 315.200 | 68.317 | 84.006 | 1102.1 |
| cmos-chain-50k | klu | 43810.0 | 9.799 | 2287.610 | 1407.440 | 38477.8 |
| cmos-chain-50k | sparse | 50983.5 | 7935.300 | 1003.990 | 984.975 | 33457.0 |

## Appendix B: full generated tables, equal-algorithm run (TS = `45d6ea7`)

Generated by `pnpm exec tsx benchmarks/rust-lu-spike/report.ts --dir=results/base-45d6ea7`.

#### LU phases, median ms (5 runs after 10 warm-ups; fresh solver per run)

| deck | n | nnz | L+U nnz | backend | symbolic | factor | solve | refactor (Newton) | refactor (perturbed) | factor+solve vs TS | refactor(p)+solve vs TS |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| rc-ladder-1k | 1001 | 3000 | 3000 | ts | 0.234 | 0.077 | 0.019 | 0.028 | 0.027 | 1.0x | 1.0x |
| rc-ladder-1k | 1001 | 3000 | 3000 | rust-pure | 0.081 | 0.036 | 9.8e-3 | 0.012 | 0.012 | 2.1x | 2.2x |
| rc-ladder-1k | 1001 | 3000 | 3000 | rust-native | 0.094 | 0.042 | 0.012 | 0.014 | 0.013 | 1.8x | 1.9x |
| rc-ladder-1k | 1001 | 3000 | 3000 | rust-wasm | 0.172 | 0.117 | 0.011 | 0.044 | 0.042 | 0.8x | 0.9x |
| rc-ladder-10k | 10001 | 30000 | 30000 | ts | 2.000 | 0.655 | 0.122 | 0.260 | 0.247 | 1.0x | 1.0x |
| rc-ladder-10k | 10001 | 30000 | 30000 | rust-pure | 0.792 | 0.426 | 0.112 | 0.183 | 0.182 | 1.4x | 1.3x |
| rc-ladder-10k | 10001 | 30000 | 30000 | rust-native | 0.799 | 0.426 | 0.113 | 0.180 | 0.181 | 1.4x | 1.3x |
| rc-ladder-10k | 10001 | 30000 | 30000 | rust-wasm | 1.021 | 0.529 | 0.132 | 0.181 | 0.177 | 1.2x | 1.2x |
| rc-ladder-50k | 50001 | 150000 | 150000 | ts | 10.855 | 3.600 | 0.842 | 1.504 | 1.472 | 1.0x | 1.0x |
| rc-ladder-50k | 50001 | 150000 | 150000 | rust-pure | 4.340 | 2.212 | 0.701 | 0.948 | 0.943 | 1.5x | 1.4x |
| rc-ladder-50k | 50001 | 150000 | 150000 | rust-native | 3.470 | 1.953 | 0.849 | 0.850 | 0.848 | 1.6x | 1.4x |
| rc-ladder-50k | 50001 | 150000 | 150000 | rust-wasm | 5.109 | 2.729 | 0.611 | 1.041 | 0.949 | 1.3x | 1.5x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | ts | 0.672 | 1.451 | 0.038 | 0.332 | 0.320 | 1.0x | 1.0x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | rust-pure | 0.330 | 0.786 | 0.024 | 0.215 | 0.215 | 1.8x | 1.5x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | rust-native | 0.241 | 0.654 | 0.022 | 0.243 | 0.242 | 2.2x | 1.4x |
| resistor-mesh-1k | 1025 | 4994 | 23088 | rust-wasm | 0.451 | 0.911 | 0.035 | 0.270 | 0.243 | 1.6x | 1.3x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | ts | 8.518 | 41.346 | 0.496 | 12.370 | 12.285 | 1.0x | 1.0x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | rust-pure | 3.110 | 19.068 | 0.286 | 7.499 | 7.501 | 2.2x | 1.6x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | rust-native | 3.198 | 19.587 | 0.286 | 7.212 | 7.148 | 2.1x | 1.7x |
| resistor-mesh-10k | 10001 | 49602 | 396986 | rust-wasm | 3.794 | 21.092 | 0.338 | 8.745 | 8.713 | 2.0x | 1.4x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | ts | 76.666 | 611.987 | 3.123 | 183.903 | 184.201 | 1.0x | 1.0x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | rust-pure | 20.693 | 274.305 | 3.142 | 121.323 | 121.805 | 2.2x | 1.5x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | rust-native | 29.316 | 434.017 | 4.641 | 174.276 | 159.696 | 1.4x | 1.1x |
| resistor-mesh-50k | 50177 | 249986 | 2988840 | rust-wasm | 24.241 | 303.716 | 2.678 | 144.453 | 144.215 | 2.0x | 1.3x |
| cmos-chain-1k | 1002 | 3998 | 2999 | ts | 0.154 | 0.060 | 6.1e-3 | 0.057 (full) | 0.014 | 1.0x | 1.0x |
| cmos-chain-1k | 1002 | 3998 | 2999 | rust-pure | 0.055 | 0.035 | 4.3e-3 | 0.035 (full) | 8.4e-3 | 1.7x | 1.6x |
| cmos-chain-1k | 1002 | 3998 | 2999 | rust-native | 0.054 | 0.035 | 4.7e-3 | 0.036 (full) | 8.3e-3 | 1.7x | 1.6x |
| cmos-chain-1k | 1002 | 3998 | 2999 | rust-wasm | 0.133 | 0.045 | 5.5e-3 | 0.047 (full) | 0.013 | 1.3x | 1.1x |
| cmos-chain-10k | 10002 | 39998 | 29999 | ts | 1.199 | 0.706 | 0.058 | 0.703 (full) | 0.148 | 1.0x | 1.0x |
| cmos-chain-10k | 10002 | 39998 | 29999 | rust-pure | 0.592 | 0.442 | 0.044 | 0.454 (full) | 0.091 | 1.6x | 1.5x |
| cmos-chain-10k | 10002 | 39998 | 29999 | rust-native | 0.514 | 0.416 | 0.032 | 0.424 (full) | 0.096 | 1.7x | 1.6x |
| cmos-chain-10k | 10002 | 39998 | 29999 | rust-wasm | 0.601 | 0.557 | 0.045 | 0.584 (full) | 0.143 | 1.3x | 1.1x |
| cmos-chain-50k | 50002 | 199998 | 149999 | ts | 8.521 | 5.762 | 0.400 | 5.976 (full) | 1.084 | 1.0x | 1.0x |
| cmos-chain-50k | 50002 | 199998 | 149999 | rust-pure | 3.916 | 3.274 | 0.285 | 3.330 (full) | 0.684 | 1.7x | 1.5x |
| cmos-chain-50k | 50002 | 199998 | 149999 | rust-native | 3.437 | 3.043 | 0.268 | 3.100 (full) | 0.576 | 1.9x | 1.8x |
| cmos-chain-50k | 50002 | 199998 | 149999 | rust-wasm | 3.916 | 4.067 | 0.267 | 4.249 (full) | 0.991 | 1.4x | 1.2x |

#### Go/no-go: Rust speed-up over TS on the 10k and 50k decks (LU from Node, incl. marshalling)

| deck | native: symbolic+factor+solve | native: refactor(p)+solve | wasm: symbolic+factor+solve | wasm: refactor(p)+solve |
|---|---:|---:|---:|---:|
| rc-ladder-10k | 2.1x | 1.3x | 1.7x | 1.2x |
| rc-ladder-50k | 2.4x | 1.4x | 1.8x | 1.5x |
| resistor-mesh-10k | 2.2x | 1.7x | 2.0x | 1.4x |
| resistor-mesh-50k | 1.5x | 1.1x | 2.1x | 1.3x |
| cmos-chain-10k | 2.0x | 1.6x | 1.6x | 1.1x |
| cmos-chain-50k | 2.2x | 1.8x | 1.8x | 1.2x |

#### Accuracy vs the TS solution x (first OP Newton system)

| deck | backend | same column order as TS | bit-identical x entries | max rel diff | rel residual ‖Ax−b‖/‖b‖ | synthetic RHS |
|---|---|---|---:|---:|---:|---|
| rc-ladder-1k | rust-native | yes | 1001/1001 | 0.0e+0 | 5.7e-13 | yes |
| rc-ladder-1k | rust-wasm | yes | 1001/1001 | 0.0e+0 | 5.7e-13 | yes |
| rc-ladder-10k | rust-native | yes | 10001/10001 | 0.0e+0 | 7.2e-11 | yes |
| rc-ladder-10k | rust-wasm | yes | 10001/10001 | 0.0e+0 | 7.2e-11 | yes |
| rc-ladder-50k | rust-native | yes | 50001/50001 | 0.0e+0 | 1.3e-9 | yes |
| rc-ladder-50k | rust-wasm | yes | 50001/50001 | 0.0e+0 | 1.3e-9 | yes |
| resistor-mesh-1k | rust-native | yes | 1025/1025 | 0.0e+0 | 1.3e-17 | no |
| resistor-mesh-1k | rust-wasm | yes | 1025/1025 | 0.0e+0 | 1.3e-17 | no |
| resistor-mesh-10k | rust-native | yes | 10001/10001 | 0.0e+0 | 4.5e-17 | no |
| resistor-mesh-10k | rust-wasm | yes | 10001/10001 | 0.0e+0 | 4.5e-17 | no |
| resistor-mesh-50k | rust-native | yes | 50177/50177 | 0.0e+0 | 1.1e-16 | no |
| resistor-mesh-50k | rust-wasm | yes | 50177/50177 | 0.0e+0 | 1.1e-16 | no |
| cmos-chain-1k | rust-native | yes | 1002/1002 | 0.0e+0 | 7.5e-23 | no |
| cmos-chain-1k | rust-wasm | yes | 1002/1002 | 0.0e+0 | 7.5e-23 | no |
| cmos-chain-10k | rust-native | yes | 10002/10002 | 0.0e+0 | 1.2e-22 | no |
| cmos-chain-10k | rust-wasm | yes | 10002/10002 | 0.0e+0 | 1.2e-22 | no |
| cmos-chain-50k | rust-native | yes | 50002/50002 | 0.0e+0 | 1.6e-19 | no |
| cmos-chain-50k | rust-wasm | yes | 50002/50002 | 0.0e+0 | 1.6e-19 | no |

#### Memory (solver-owned bytes after the run; child peak RSS includes Node + parsed matrices)

| deck | TS solver MiB | Rust solver MiB | WASM linear memory MiB | peak RSS TS / native / wasm MiB |
|---|---:|---:|---:|---|
| rc-ladder-1k | 0.2 | 0.2 | 1.3 | 117 / 108 / 115 |
| rc-ladder-10k | 1.7 | 1.7 | 3.2 | 153 / 122 / 131 |
| rc-ladder-50k | 8.6 | 8.6 | 11.8 | 214 / 187 / 193 |
| resistor-mesh-1k | 0.6 | 0.6 | 1.9 | 124 / 108 / 115 |
| resistor-mesh-10k | 7.9 | 7.8 | 11.9 | 190 / 143 / 147 |
| resistor-mesh-50k | 53.4 | 53.0 | 73.3 | 372 / 637 / 250 |
| cmos-chain-1k | 0.2 | 0.2 | 1.3 | 124 / 105 / 112 |
| cmos-chain-10k | 2.1 | 2.0 | 3.6 | 158 / 132 / 139 |
| cmos-chain-50k | 10.4 | 10.2 | 13.6 | 246 / 197 / 201 |

#### End-to-end DC OP with the LU swapped (parse + simulate, median ms)

| deck | runs | TS total | TS in LU | LU share | native total | native in LU | wasm total | wasm in LU | OP speed-up native / wasm | node voltages bit-identical |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| rc-ladder-1k | 5 | 9.4 | 0.6 | 6% | 6.9 | 0.1 | 8.2 | 0.2 | 1.4x / 1.2x | 1000/1000 / 1000/1000 |
| rc-ladder-10k | 5 | 70.9 | 4.2 | 6% | 66.8 | 1.1 | 63.3 | 1.4 | 1.1x / 1.1x | 10000/10000 / 10000/10000 |
| rc-ladder-50k | 5 | 371.5 | 19.2 | 5% | 368.6 | 5.3 | 395.6 | 6.7 | 1.0x / 0.9x | 50000/50000 / 50000/50000 |
| resistor-mesh-1k | 5 | 11.5 | 2.6 | 23% | 10.1 | 1.3 | 10.7 | 1.6 | 1.1x / 1.1x | 1024/1024 / 1024/1024 |
| resistor-mesh-10k | 5 | 121.3 | 50.4 | 42% | 107.8 | 26.6 | 113.5 | 30.0 | 1.1x / 1.1x | 10000/10000 / 10000/10000 |
| resistor-mesh-50k | 5 | 1265.5 | 775.9 | 61% | 894.0 | 386.2 | 971.6 | 475.5 | 1.4x / 1.3x | 50176/50176 / 50176/50176 |
| cmos-chain-1k | 5 | 218.2 | 8.9 | 4% | 205.9 | 6.4 | 224.5 | 8.1 | 1.1x / 1.0x | 1000/1000 / 1000/1000 |
| cmos-chain-10k | 5 | 3377.9 | 173.6 | 5% | 3389.1 | 110.6 | 3607.6 | 142.0 | 1.0x / 0.9x | 10000/10000 / 10000/10000 |
| cmos-chain-50k | 3 | 86504.9 | 2259.1 | 3% | 89931.4 | 1490.1 | 83555.2 | 2054.3 | 1.0x / 1.0x | 50000/50000 / 50000/50000 |

#### ngspice-47 OP for context (same OP decks, median ms of .options acct)

| deck | solver | total analysis | reorder | factor | solve | load |
|---|---|---:|---:|---:|---:|---:|
| rc-ladder-1k | klu | 2.4 | 0.094 | 0.018 | 0.043 | 0.1 |
| rc-ladder-1k | sparse | 1.4 | 0.081 | 0.017 | 0.020 | 0.1 |
| rc-ladder-10k | klu | 18.8 | 0.810 | 0.201 | 0.478 | 0.7 |
| rc-ladder-10k | sparse | 7.6 | 0.915 | 0.232 | 0.194 | 0.9 |
| rc-ladder-50k | klu | 92.7 | 4.099 | 1.005 | 1.935 | 3.3 |
| rc-ladder-50k | sparse | 27.2 | 2.904 | 0.797 | 0.907 | 4.2 |
| resistor-mesh-1k | klu | 3.5 | 0.787 | 0.175 | 0.063 | 0.1 |
| resistor-mesh-1k | sparse | 14.5 | 12.117 | 1.034 | 0.133 | 0.3 |
| resistor-mesh-10k | klu | 42.9 | 17.898 | 5.848 | 0.826 | 0.7 |
| resistor-mesh-10k | sparse | 1279.3 | 1148.970 | 112.388 | 9.044 | 10.0 |
| resistor-mesh-50k | klu | 428.0 | 228.771 | 90.346 | 7.880 | 4.4 |
| resistor-mesh-50k | sparse | 68134.4 | 65135.400 | 3669.470 | 133.859 | 127.9 |
| cmos-chain-1k | klu | 44.8 | 0.105 | 4.890 | 4.322 | 28.8 |
| cmos-chain-1k | sparse | 44.1 | 1.939 | 2.834 | 3.658 | 31.2 |
| cmos-chain-10k | klu | 1416.0 | 1.104 | 88.350 | 72.883 | 1128.9 |
| cmos-chain-10k | sparse | 2351.1 | 280.502 | 62.364 | 76.102 | 1571.2 |
| cmos-chain-50k | klu | 39161.2 | 9.066 | 1737.670 | 1100.100 | 35016.5 |
| cmos-chain-50k | sparse | 66918.1 | 9508.900 | 1389.580 | 1485.430 | 41277.7 |
