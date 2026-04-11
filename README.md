# spice-ts

[![CI](https://github.com/mfiumara/spice-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/mfiumara/spice-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mfiumara/spice-ts/graph/badge.svg)](https://codecov.io/gh/mfiumara/spice-ts)
[![npm](https://img.shields.io/npm/v/@spice-ts/core)](https://www.npmjs.com/package/@spice-ts/core)

A zero-dependency TypeScript SPICE circuit simulator. Parse netlists and run DC, transient, and AC analysis directly in Node.js or the browser — no native binaries, no WASM.

```ts
import { simulate } from '@spice-ts/core';

const result = await simulate(`
  V1 1 0 DC 5
  R1 1 2 1k
  R2 2 0 1k
  .op
  .end
`);

console.log(result.dc?.voltage('2')); // 2.5
```

## Install

```bash
npm install @spice-ts/core
```

Requires Node.js ≥ 20.

## Features

- **DC operating point** — Newton-Raphson with voltage limiting for convergence
- **DC sweep** — `.dc` transfer curves and I-V characteristics
- **Transient analysis** — backward Euler and trapezoidal integration with adaptive timestep
- **AC small-signal** — frequency sweep (dec/oct/lin) via complex LU solve
- **Device models** — R, C, L, V, I, Diode (Shockley), BJT (Ebers-Moll NPN/PNP), MOSFET (Level 1 Shichman-Hodges NMOS/PMOS)
- **Subcircuits** — `.subckt`/`.ends` definitions with `X` device instantiation, nested expansion, parameterized subcircuits
- **Library support** — `.include` file resolution, `.lib`/`.endl` section selection (process corners), `.param` expressions with SI suffixes
- **Async parsing** — `parseAsync()` with platform-agnostic `IncludeResolver` callback for loading external files
- **Streaming API** — `simulateStream()` yields results as an `AsyncIterableIterator`
- **Programmatic API** — build circuits in code with `Circuit`, or parse SPICE netlists with `parse()`
- **Typed errors** — `ConvergenceError`, `SingularMatrixError`, `ParseError`, `CycleError`, and more

## Usage

### Netlist (SPICE format)

```ts
import { simulate } from '@spice-ts/core';

// RC low-pass filter — transient step response
const result = await simulate(`
  V1 in 0 PULSE(0 5 0 1n 1n 500u 1m)
  R1 in out 1k
  C1 out 0 1u
  .tran 10u 5m
  .end
`);

const { time, voltage } = result.transient!;
// time: Float64Array of timepoints
// voltage('out'): Float64Array of node voltages
```

### Programmatic (no netlist)

```ts
import { Circuit, simulate } from '@spice-ts/core';

const ckt = new Circuit();
ckt.addVoltageSource('V1', 'in', '0', { dc: 5 });
ckt.addResistor('R1', 'in', 'out', 1000);
ckt.addResistor('R2', 'out', '0', 1000);
ckt.addAnalysis('op');

const result = await simulate(ckt);
console.log(result.dc?.voltage('out')); // 2.5
```

### Streaming

```ts
import { simulateStream } from '@spice-ts/core';

for await (const step of simulateStream(netlist)) {
  if ('time' in step) {
    console.log(`t=${step.time}  V(out)=${step.voltages.get('out')}`);
  }
}
```

### AC analysis

```ts
const result = await simulate(`
  V1 in 0 AC 1
  R1 in out 1k
  C1 out 0 1u
  .ac dec 10 1 100k
  .end
`);

const freq = result.ac!.frequencies;          // Float64Array
const mag  = result.ac!.magnitude('out');     // Float64Array
const phase = result.ac!.phase('out');        // Float64Array (degrees)
```

## API

### `simulate(input, options?)`

```ts
simulate(input: string | Circuit, options?: SimulationOptions): Promise<SimulationResult>
```

Runs all analyses declared in the netlist/circuit. Returns a `SimulationResult` with `.dc`, `.transient`, and `.ac` fields (populated for each analysis present).

### `simulateStream(input, options?)`

```ts
simulateStream(input: string | Circuit, options?: SimulationOptions): AsyncIterableIterator<TransientStep | ACPoint>
```

Yields each timestep/frequency point as it is computed.

### `parse(netlist)`

```ts
parse(netlist: string): Circuit
```

Parses a SPICE netlist into a `Circuit` object without running any analysis. Throws `ParseError` if the netlist contains `.include` or `.lib` directives — use `parseAsync()` for those.

### `parseAsync(netlist, resolver?)`

```ts
parseAsync(netlist: string, resolver?: IncludeResolver): Promise<Circuit>
```

Async variant of `parse()` that runs the preprocessor first, resolving `.include`, `.lib`/`.endl`, and `.param` directives. The optional `resolver` callback loads external files:

```ts
import { parseAsync } from '@spice-ts/core';
import { readFile } from 'fs/promises';

const ckt = await parseAsync(netlist, async (path) => {
  return readFile(path, 'utf-8');
});
```

The resolver is platform-agnostic — use `fetch()` in the browser, `readFile()` in Node, or return bundled strings for static assets.

### `SimulationOptions`

| Option | Default | Description |
|---|---|---|
| `abstol` | `1e-12` | Absolute current tolerance (A) |
| `vntol` | `1e-6` | Absolute voltage tolerance (V) |
| `reltol` | `1e-3` | Relative tolerance |
| `maxIterations` | `100` | Max Newton-Raphson iterations (DC) |
| `maxTransientIterations` | `50` | Max NR iterations per timestep |
| `integrationMethod` | `'trapezoidal'` | `'euler'` or `'trapezoidal'` |
| `resolveInclude` | — | Async callback `(path: string) => Promise<string>` for `.include`/`.lib` |

## Benchmarks

Measured on Apple M4 Pro, Node.js v24, ngspice-44. spice-ts times are from `vitest bench` (tinybench, statistically stabilised). ngspice times include process spawn + file I/O overhead (~7 ms baseline).

### Scalability — DC (.op)

| Circuit | Nodes | spice-ts | ngspice | vs ngspice |
|---|---|---|---|---|
| Resistor ladder | 10 | 0.04 ms | 28 ms | **700× faster** |
| Resistor ladder | 100 | 1.8 ms | 7 ms | **4× faster** |
| Resistor ladder | 500 | 179 ms | 10 ms | 18× slower |

> **Note:** The numeric LU factorization is still O(n³) with a dense intermediate. The solver architecture (symbolic/numeric split, CSC format, `SparseSolver` interface) is designed for a future true sparse factorization or KLU WASM plugin. For circuits above ~200 nodes, ngspice's sparse KLU solver dominates.

### Scalability — Transient

| Circuit | Stages | spice-ts | ngspice | vs ngspice |
|---|---|---|---|---|
| RC chain | 10 | 13.7 ms | 10 ms | 1.4× slower |
| RC chain | 50 | 162 ms | 14 ms | 12× slower |
| RC chain | 100 | 837 ms | 23 ms | 36× slower |
| LC ladder | 10 | 42 ms | 13 ms | 3.2× slower |
| LC ladder | 50 | 1.67 s | 25 ms | 67× slower |

### Scalability — AC

| Circuit | Stages | spice-ts | ngspice | vs ngspice |
|---|---|---|---|---|
| RC chain | 10 | 2.3 ms | 8 ms | **3.5× faster** |
| RC chain | 50 | 55 ms | 8 ms | 7× slower |
| RC chain | 100 | 415 ms | 9 ms | 46× slower |

### Nonlinear — CMOS / Ring Oscillators

| Circuit | spice-ts | ngspice | vs ngspice |
|---|---|---|---|
| CMOS inverter chain (5 stages) | 22.6 ms | 21 ms | ~parity |
| CMOS inverter chain (10 stages) | 43.8 ms | 30 ms | 1.5× slower |
| Ring oscillator (3-stage) | 50.6 ms | 32 ms | 1.6× slower |
| Ring oscillator (5-stage) | 73.6 ms | 41 ms | 1.8× slower |
| Ring oscillator (11-stage) | 198 ms | 69 ms | 2.9× slower |

### SPICE3 Reference Circuits

| Circuit | Analysis | spice-ts |
|---|---|---|
| BJT differential pair | DC | 0.49 ms |
| RC ladder 5-stage | AC | 1.32 ms |
| One-stage OTA | DC | 0.58 ms |
| CMOS inverter | Transient | 5.3 ms |
| Bandpass RLC | AC | 0.57 ms |

### Accuracy

| Test | Metric | spice-ts | Expected | Error |
|---|---|---|---|---|
| RC step response | V(out) at t=τ | 3.151 V | 3.161 V | **0.29%** |
| BJT CE amplifier | V(base) DC bias | 2.048 V | 2.105 V | **2.7%** |
| RLC bandpass | peak frequency | 1585 Hz | 1592 Hz | **0.4%** |
| RC ladder 5-stage | f<sub>-3dB</sub> | 12.76 Hz | 12.73 Hz | **0.23%** |
| RLC resonance (transient) | oscillation frequency | 1579 Hz | 1592 Hz | 0.8%† |

†RLC transient resonance error is due to numerical damping in the trapezoidal integrator with the default timestep. Use a finer timestep or `integrationMethod: 'euler'` to reduce it. AC analysis of the same circuit gives 0.4% error (see RLC bandpass above).

Run `pnpm bench:accuracy` to see the full accuracy report including SPICE3 Quarles reference circuits.

## Limitations

- **Dense numeric factorization:** The solver uses a sparse architecture (CSC format, symbolic/numeric split, `SparseSolver` interface) but the numeric LU factorization still uses a dense O(n³) intermediate. A future release will implement true sparse column-by-column factorization or swap in KLU via WASM.
- **BSIM3v3 MOSFET:** Supported alongside Level 1 Shichman-Hodges. BSIM4, EKV not yet available.

## Development

```bash
git clone https://github.com/mfiumara/spice-ts
cd spice-ts
pnpm install
pnpm test              # run all tests
pnpm build             # build @spice-ts/core
pnpm bench             # vitest bench (ops/sec, mean, p99 — no external deps)
pnpm bench:accuracy    # accuracy vs analytical + ngspice diff (requires ngspice)
```

The `bench` script uses [vitest bench](https://vitest.dev/guide/benchmarking) (backed by tinybench) for statistically sound ops/sec and latency metrics. Results are written to `benchmarks/vitest-bench-results.json`.

The `bench:accuracy` script runs 8 reference circuits through spice-ts, compares them against analytical expected values, and optionally diffs against ngspice. Results are written to `benchmarks/accuracy-results.json`. Pass `--ci` to exit non-zero if any gated circuit exceeds 15% error.

See [ROADMAP.md](ROADMAP.md) for planned features.

## License

MIT
