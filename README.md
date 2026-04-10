# spice-ts

[![CI](https://github.com/mfiumara/spice-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/mfiumara/spice-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mfiumara/spice-ts/branch/main/graph/badge.svg)](https://codecov.io/gh/mfiumara/spice-ts)
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
- **Transient analysis** — backward Euler and trapezoidal integration with adaptive timestep
- **AC small-signal** — frequency sweep (dec/oct/lin) via complex LU solve
- **Device models** — R, C, L, V, I, Diode (Shockley), BJT (Ebers-Moll NPN/PNP), MOSFET (Level 1 Shichman-Hodges NMOS/PMOS)
- **Streaming API** — `simulateStream()` yields results as an `AsyncIterableIterator`
- **Programmatic API** — build circuits in code with `Circuit`, or parse SPICE netlists with `parse()`
- **Typed errors** — `ConvergenceError`, `SingularMatrixError`, `ParseError`, and more

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
ckt.addVoltageSource('V1', 'in', '0', { type: 'dc', value: 5 });
ckt.addResistor('R1', 'in', 'out', 1000);
ckt.addResistor('R2', 'out', '0', 1000);
ckt.addAnalysis({ type: 'op' });

const result = await simulate(ckt);
console.log(result.dc?.voltage('out')); // 2.5
```

### Streaming

```ts
import { simulateStream } from '@spice-ts/core';

for await (const step of simulateStream(netlist)) {
  if (step.type === 'transient') {
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

Parses a SPICE netlist into a `Circuit` object without running any analysis.

### `SimulationOptions`

| Option | Default | Description |
|---|---|---|
| `abstol` | `1e-12` | Absolute current tolerance (A) |
| `vntol` | `1e-6` | Absolute voltage tolerance (V) |
| `reltol` | `1e-3` | Relative tolerance |
| `maxIterations` | `100` | Max Newton-Raphson iterations (DC) |
| `maxTransientIterations` | `50` | Max NR iterations per timestep |
| `integrationMethod` | `'trapezoidal'` | `'euler'` or `'trapezoidal'` |

## Benchmarks

Measured on an AMD Ryzen machine running Node.js v22 and ngspice-42. spice-ts times are the mean of 5 runs (after 1 warmup). ngspice times include process spawn + file I/O overhead.

### Scalability — DC (.op)

| Circuit | Nodes | spice-ts | ngspice | vs ngspice |
|---|---|---|---|---|
| Resistor ladder | 10 | 0.53 ms | ~5 ms | 9× faster |
| Resistor ladder | 100 | 2.92 ms | ~5 ms | 1.7× faster |
| Resistor ladder | 500 | 163 ms | ~5 ms | 31× slower |
| Resistor ladder | 1000 | 1572 ms | ~5 ms | 314× slower |

> **Note:** The dense LU solver is O(n³). For large circuits (>200 nodes), performance degrades sharply compared to ngspice's sparse KLU solver. This is a [known limitation](#limitations) targeted for a future release.

### Scalability — Transient

| Circuit | Nodes | spice-ts | ngspice | vs ngspice |
|---|---|---|---|---|
| RC chain | 10 | 4.5 ms | 5 ms | 1.1× faster |
| RC chain | 50 | 15 ms | 6 ms | 2.5× slower |
| RC chain | 100 | 85 ms | 7 ms | 12× slower |
| RC chain | 200 | 554 ms | 10 ms | 55× slower |
| LC ladder | 10 | 4.9 ms | 22 ms | 4.5× faster |
| LC ladder | 50 | 82 ms | 31 ms | 2.7× slower |
| LC ladder | 100 | 588 ms | 41 ms | 14× slower |

### Scalability — AC

| Circuit | Nodes | spice-ts | ngspice | vs ngspice |
|---|---|---|---|---|
| RC chain | 10 | 3.6 ms | 1 ms | 3.6× slower |
| RC chain | 50 | 47 ms | 1 ms | 47× slower |
| RC chain | 100 | 325 ms | 2 ms | 163× slower |
| RC chain | 200 | 2454 ms | 4 ms | 614× slower |

### Nonlinear — CMOS / Ring Oscillators

For small nonlinear circuits, spice-ts avoids ngspice's process spawn overhead and is substantially faster:

| Circuit | spice-ts | ngspice | vs ngspice |
|---|---|---|---|
| CMOS inverter chain (5 stages) | 2.8 ms | 52 ms | **19× faster** |
| CMOS inverter chain (10 stages) | 2.8 ms | 55 ms | **20× faster** |
| Ring oscillator (3-stage) | 0.8 ms | 112 ms | **140× faster** |
| Ring oscillator (5-stage) | 0.7 ms | 124 ms | **170× faster** |
| Ring oscillator (11-stage) | 1.2 ms | 147 ms | **127× faster** |

### Accuracy

| Test | Metric | spice-ts | Expected | Error |
|---|---|---|---|---|
| RC step response | V(out) at t=τ | 3.167 V | 3.161 V | **0.20%** |
| BJT CE amplifier | V(base) DC bias | 2.048 V | 2.105 V | **2.7%** |
| RLC resonance | oscillation frequency | 1242 Hz | 1592 Hz | 21.9%* |

*The RLC resonance error is due to numerical damping in the trapezoidal integrator with the default timestep. Use a finer timestep or `integrationMethod: 'euler'` to improve accuracy for resonant circuits.

## Limitations

- **Dense LU solver:** The current solver converts the sparse MNA matrix to dense before factoring. This is O(n³) and impractical above ~200-300 nodes. A future release will use a sparse LU (KLU-style).
- **No DC sweep:** `.dc` sweep analysis is parsed but not yet executed.
- **No `.subckt`:** Subcircuit definitions are not yet supported.
- **Level 1 MOSFET only:** No Level 2/3/BSIM models.

## Development

```bash
git clone https://github.com/mfiumara/spice-ts
cd spice-ts
pnpm install
pnpm test        # run all tests
pnpm build       # build @spice-ts/core
pnpm bench       # run benchmark suite (requires ngspice for comparison)
```

## License

MIT
