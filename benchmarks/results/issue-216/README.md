# Issue 216 transient accepted-step allocation receipts

Same-machine measurements used Apple M5 Pro (18 logical CPUs, 48 GiB), macOS Darwin 27.0.0, Node v22.23.1, pnpm 10.28.1, and ngspice-47. Before and after runs were made consecutively in this worktree. Raw samples, machine metadata, commands, fixture hashes, profiles, convergence telemetry, waveform hashes, and every observed loss are retained beside this receipt.

## `/poteto-mode` receipt

The performance-issue playbook was loaded before implementation. Baselines and CPU/sampled-heap profiles were captured before changing the accepted-step path. Source inspection identified `TransientSimImpl.stampPrevB()` allocating a new system-sized `Float64Array` after every accepted trapezoidal step. Two designs were considered: retain two history buffers and swap them, or retain one workspace and overwrite it only after NR and LTE accept the new solution. The one-workspace design was selected because `attemptStep()` has finished reading the previous history before `stampPrevB()` runs, rejected attempts never call it, and both the static-current and device-RHS paths fully initialize the buffer. It removes allocations without changing integration, retry, history-commit, tolerance, or waveform semantics.

The benchmark-first regression covers static-current and device-RHS history. RED was 10 passed and 1 failed because each accepted step replaced `prevB`. GREEN was 11 passed. Focused transient, transmission-line history, LTE retry, and jimi-fuzz parity tests pass.

For jimi-fuzz, the system has 13 unknowns and a 104-byte history vector. The change retains one 104-byte buffer and eliminates 567,377 accepted-step allocations in the measured run, representing 59,007,208 bytes (56.274 MiB) of deterministic cumulative typed-array payload allocation. It does not reduce one-shot result storage.

## Deterministic transient smoke

Command: `pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=smoke --runs=5 --output=<receipt>`

The harness uses fresh isolated processes and the byte-identical netlist hash `6d83ff4648cbedd66a6053458c45eafa7907d27514790ce17b8ec8e0db925b0b` for both engines.

| Engine | Median runtime before → after | Change | Peak RSS before → after | Change |
| --- | ---: | ---: | ---: | ---: |
| spice-ts | 27.805 → 23.156 ms | -16.72% | 169.578 → 149.203 MiB | -12.02% |
| ngspice-47 fresh process | 19.587 → 17.429 ms | -11.02% | 10.281 → 10.266 MiB | -0.15% |

Every spice-ts run retained 1,158 accepted steps, 1,159 output points, and a byte-for-byte identical JSON waveform summary. The smoke deck selects Gear, so it does not execute trapezoidal accepted-step history and is a control workload rather than direct evidence for the allocation removal. Sampled whole-process heap bytes increased from 10,672,224 to 16,903,008 (+58.38%), which is retained as a noisy profile loss. The known correctness loss also remains visible: neither engine reaches the expected -12 V rail in smoke mode. After the change, spice-ts is 1.33x slower and its measured peak RSS is 14.53x ngspice's.

## Public jimi-fuzz transient

Fixture: pinned ngspice example `examples/wave/jimi_fuzz.cir`, BSD-3-Clause, recorded in `benchmarks/SOURCES.md`, SHA-256 `0607c7f358628d0ce60eff584b329a4d685ae215894c466622a19357c7163b0e`.

Commands:

- spice-ts samples: `pnpm exec tsx benchmarks/issue-146-memory.ts --one-shot`
- parity: `pnpm exec tsx benchmarks/issue-146-jimi-fuzz.ts --output <receipt>`
- ngspice resource samples: `/usr/bin/time -lp ngspice -b -r <raw> benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir`

| Engine | Median runtime before → after | Change | Peak RSS before → after | Change |
| --- | ---: | ---: | ---: | ---: |
| spice-ts | 9,580.603 → 6,746.506 ms | -29.58% | 284.094 → 314.969 MiB | +10.87% |
| ngspice-47 fresh process | 588.597 ms after | n/a | 10.281 MiB after | n/a |

The peak-RSS regression is retained. The separate after parity-harness sample, which includes native raw parsing and both result conversions, measured 8,620.548 ms for spice-ts and 2,961.861 ms for ngspice-47. The direct fresh-process comparison is 11.46x slower and uses 30.64x ngspice's peak RSS. No superiority claim is made.

All five runs on each spice-ts revision retained exactly 567,378 points, 567,377 accepted steps, 112,170 LTE retries, zero NR retries, and minimum accepted timestep `2.263254460638909e-8`. The exact binary hash over the time grid, all 11 voltage waveforms, and both branch-current waveforms is unchanged: `ffd174269bbe60be88b6f99004faf2e86c68181e645f40966c355fb3f0ac0ca8`.

Sampled whole-process heap bytes fell from 10,684,840 to 10,588,536 (-0.90%). CPU-profile `stampPrevB` samples fell from 45 to 21, while GC samples increased from 36 to 44; both are sampling evidence, not deterministic allocation counts. The raw profiles are primary evidence.

The ngspice-47 comparison outcome hash is unchanged at `56b1697a1a8442dc4831a7763e0a9cd08685788d764f3ed9799dbb297a1f4242`. Existing parity losses remain visible, including transient `V(11)` maximum/RMS absolute errors of 3.655197/0.939216 V, `V(8)` 0.474142/0.105159 V, and near-zero-reference relative-error spikes. The comparison uses the unchanged fixture bytes, no per-engine tolerance tuning, and linear interpolation onto the spice-ts grid.

## Verification

- focused RED/GREEN and transient parity tests: passed
- exact before/after waveform hash: passed
- exact LTE retry/history telemetry: passed
- `pnpm install --frozen-lockfile`: passed
- `pnpm build`: passed
- `pnpm lint`: passed
- `pnpm test`: passed
- `pnpm bench:accuracy`: passed
- `git diff --check`: passed
