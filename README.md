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

Three-way comparison: **spice-ts** (pure TypeScript) vs **eecircuit** (ngspice compiled to WASM via [EEcircuit-engine](https://github.com/eelab-dev/EEcircuit-engine)) vs **ngspice** (native C). Measured on Apple M4 Pro, Node.js v24. Run `pnpm bench:compare` to reproduce.

### DC Operating Point

spice-ts uses a sparse LU solver (Gilbert-Peierls with symbolic/numeric split) and typed-array direct stamping. For DC analysis, it beats ngspice-WASM across all sizes:

| Circuit | Size | spice-ts | eecircuit (WASM) | ngspice (native) | vs eecircuit |
|---|---|---|---|---|---|
| Resistor ladder | 10 | 0.16 ms | 0.9 ms | 0.9 ms | **5.5x faster** |
| Resistor ladder | 100 | 1.2 ms | 1.4 ms | 0.5 ms | **1.2x faster** |
| Resistor ladder | 500 | 2.2 ms | 4.0 ms | 0.7 ms | **1.8x faster** |

### Transient

| Circuit | Size | spice-ts | eecircuit (WASM) | ngspice (native) | vs eecircuit |
|---|---|---|---|---|---|
| RC chain | 10 | 5.1 ms | 4.2 ms | 1.6 ms | 1.2x slower |
| RC chain | 50 | 14.7 ms | 17.1 ms | 4.0 ms | **1.2x faster** |
| RC chain | 100 | 25.9 ms | 21.0 ms | 7.0 ms | 1.2x slower |
| LC ladder | 10 | 10.7 ms | 10.6 ms | 3.7 ms | ~parity |
| LC ladder | 50 | 41.6 ms | 35.9 ms | 11.2 ms | 1.2x slower |

### AC Small-Signal

| Circuit | Size | spice-ts | eecircuit (WASM) | ngspice (native) | vs eecircuit |
|---|---|---|---|---|---|
| RC chain | 10 | 0.95 ms | 1.3 ms | 0.5 ms | **1.4x faster** |
| RC chain | 50 | 14.2 ms | 3.4 ms | 0.7 ms | 4.1x slower |
| RC chain | 100 | 98.2 ms | 5.9 ms | 1.1 ms | 16.7x slower |

### Nonlinear (CMOS / Ring Oscillators)

| Circuit | spice-ts | eecircuit (WASM) | ngspice (native) | vs eecircuit |
|---|---|---|---|---|
| CMOS inv chain (5 stg) | 18.2 ms | 16.6 ms | 8.7 ms | ~parity |
| CMOS inv chain (10 stg) | 28.2 ms | 25.3 ms | 13.5 ms | ~parity |
| Ring oscillator (3 stg) | 33.6 ms | 30.6 ms | 15.0 ms | ~parity |
| Ring oscillator (5 stg) | 58.6 ms | 41.6 ms | 20.4 ms | 1.4x slower |
| Ring oscillator (11 stg) | 120.2 ms | 70.8 ms | 37.3 ms | 1.7x slower |

> **Where spice-ts shines:** DC analysis (up to 5.5x faster than WASM), transient on small-to-medium circuits (parity or faster), and anywhere you need a zero-dependency in-process simulator (no WASM, no native binary, no process spawn). The remaining gap on large nonlinear circuits and AC sweeps is due to the 2n×2n complex matrix expansion and TypeScript overhead in tight numerical loops.

### Accuracy

| Test | Metric | spice-ts | Expected | Error |
|---|---|---|---|---|
| RC step response | V(out) at t=τ | 3.151 V | 3.161 V | **0.29%** |
| BJT CE amplifier | V(base) DC bias | 2.048 V | 2.105 V | **2.7%** |
| RLC bandpass | peak frequency | 1585 Hz | 1592 Hz | **0.4%** |
| RC ladder 5-stage | f<sub>-3dB</sub> | 12.76 Hz | 12.73 Hz | **0.23%** |
| RLC resonance (transient) | oscillation frequency | 1579 Hz | 1592 Hz | 0.8%† |

†RLC transient resonance error is due to numerical damping in the trapezoidal integrator with the default timestep. Use a finer timestep or `integrationMethod: 'euler'` to reduce it.

Run `pnpm bench:accuracy` to see the full accuracy report including SPICE3 Quarles reference circuits.

## Limitations

- **AC performance on large circuits:** AC analysis builds a 2n×2n real matrix for complex solves. For large circuits (100+ nodes), this expansion dominates and is 4-17x slower than ngspice-WASM. A native complex sparse solver would close this gap.
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
pnpm bench:compare     # 3-way comparison: spice-ts vs eecircuit (WASM) vs ngspice
```

The `bench` script uses [vitest bench](https://vitest.dev/guide/benchmarking) (backed by tinybench) for statistically sound ops/sec and latency metrics. The `bench:compare` script runs 16 circuits through all three engines and outputs a markdown table. Pass `--json` for machine-readable output or `--no-ngspice` to skip native ngspice.

See [ROADMAP.md](ROADMAP.md) for planned features.

## License

MIT
