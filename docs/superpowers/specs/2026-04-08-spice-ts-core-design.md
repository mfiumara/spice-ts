# spice-ts Core Engine Design Spec

## Overview

**spice-ts** is a TypeScript-native SPICE circuit simulator designed to be both a powerful standalone simulator and an embeddable library for web-based EDA tools (first consumer: schematik.io).

### Goals
- Accurate DC, Transient, and AC small-signal analysis
- Standard SPICE netlist parsing + programmatic TypeScript API
- Streaming results for real-time plotting during simulation
- Zero runtime dependencies in core — pure TypeScript
- Extensible device model system supporting future BSIM3/BSIM4 import
- Validated against ngspice with industry-standard benchmark circuits

### Non-Goals (v1)
- GUI / schematic editor (separate package, later)
- BSIM3/BSIM4 model support (v2)
- Parallel/multi-threaded simulation
- Subcircuit / hierarchical netlist support (fast-follow)

---

## Project Structure

```
spice-ts/
├── package.json              ← root, pnpm workspaces
├── pnpm-workspace.yaml
├── tsconfig.base.json        ← shared TS config (strict, composite)
├── packages/
│   └── core/                 ← @spice-ts/core
│       ├── package.json      ← zero runtime deps
│       ├── tsconfig.json     ← extends base, composite: true
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts      ← public API barrel
│           ├── parser/       ← SPICE netlist parser
│           ├── solver/       ← MNA matrix assembly + sparse LU solver
│           ├── devices/      ← device model stampers
│           ├── analysis/     ← DC, transient, AC analysis strategies
│           └── types/        ← shared type definitions
├── benchmarks/               ← performance benchmarks (ISCAS, etc.)
└── fixtures/                 ← validation circuits + reference outputs
    ├── ngspice-ref/          ← reference results from ngspice
    └── circuits/             ← .cir/.spice test netlists
```

- **pnpm workspaces** monorepo with `@spice-ts/core` as the first package
- **vitest** for testing, **tsup** for publishing ESM + CJS
- Benchmarks and fixtures at monorepo root (cross-package concerns)

---

## Core Engine Architecture

Modular stamp-based MNA (Modified Nodal Analysis) pipeline:

```
Netlist (text or programmatic)
        │
        ▼
    ┌─────────┐
    │  Parser  │  → Circuit object (nodes, devices, commands)
    └────┬────┘
         │
         ▼
    ┌──────────┐
    │  Circuit  │  → Device instances with node connections
    └────┬─────┘
         │
         ▼
    ┌──────────────┐
    │  Analysis     │  ← DC / Transient / AC (strategy pattern)
    │  Controller   │
    └────┬─────────┘
         │  for each iteration / timestep:
         ▼
    ┌──────────────┐
    │  MNA Matrix   │  ← devices stamp themselves into G, C, b
    │  Assembler    │
    └────┬─────────┘
         │
         ▼
    ┌──────────────┐
    │  Sparse LU    │  ← solve Gx = b (or (G + C/Δt)x = b)
    │  Solver       │
    └────┬─────────┘
         │
         ▼
    ┌──────────────┐
    │  Convergence  │  ← Newton-Raphson check (for nonlinear)
    │  Check        │
    └──────────────┘
         │
         ▼
      Results (per-step, streamed or collected)
```

### Components

- **Parser** — reads SPICE netlist text, produces a `Circuit` descriptor. Supports `.model` and `.lib` cards for device parameters.
- **Circuit** — in-memory representation: list of device instances, each knowing its connected node indices. Also constructable programmatically via a TypeScript builder API.
- **Device Models** — each implements a `Stamper` interface. The device reads the current solution vector and stamps its contributions (conductance, current, capacitance) into the MNA matrix. This is the extensibility point.
- **MNA Assembler** — manages the `G` (conductance) matrix, `C` (capacitance) matrix, and `b` (RHS) vector. Clears and re-stamps each Newton-Raphson iteration.
- **Solver** — sparse LU decomposition. Clean interface so it can be swapped for WASM KLU later.
- **Analysis Controller** — orchestrates the outer loop per analysis type (strategy pattern).
- **Convergence** — Newton-Raphson with configurable tolerances and iteration limits.

---

## Device Model Interface

```typescript
interface DeviceModel {
  /** Stamp conductance (G) and current (b) contributions */
  stamp(context: StampContext): void;

  /** Stamp dynamic (capacitance/charge) contributions for transient */
  stampDynamic?(context: StampContext): void;

  /** Stamp small-signal AC contributions (complex admittance) */
  stampAC?(context: StampContext, frequency: number): void;
}

interface StampContext {
  /** Add value to conductance matrix G[row][col] */
  stampG(row: number, col: number, value: number): void;

  /** Add value to RHS vector b[row] */
  stampB(row: number, value: number): void;

  /** Add value to capacitance matrix C[row][col] */
  stampC(row: number, col: number, value: number): void;

  /** Read current solution voltage at node */
  getVoltage(node: number): number;

  /** Read current solution current through branch */
  getCurrent(branch: number): number;

  /** Current simulation time (transient only) */
  time: number;

  /** Current timestep (transient only) */
  dt: number;
}
```

### V1 Device Models

| Device | Model | Stamping behavior |
|--------|-------|-------------------|
| Resistor | Ohmic (R) | Stamps `1/R` into G matrix |
| Capacitor | Ideal (C) | Stamps `C` into C matrix |
| Inductor | Ideal (L) | Adds branch current variable, stamps into G and C |
| Voltage source | Ideal (V) | Adds branch current, stamps 1/-1 into G, value into b |
| Current source | Ideal (I) | Stamps directly into b |
| Diode | Exponential (Shockley) | Nonlinear — stamps linearized conductance + current each iteration |
| BJT | Ebers-Moll | Nonlinear — two diode junctions + current gain |
| MOSFET | Shichman-Hodges (Level 1) | Nonlinear — region-dependent stamps (cutoff/linear/saturation) |

Each device parses its own `.model` parameters from the SPICE netlist with sensible defaults matching SPICE conventions.

---

## Analysis Types

### DC Operating Point
1. Stamp all devices into G matrix and b vector (no C matrix)
2. Newton-Raphson iteration:
   - Solve `Gx = b`
   - Each nonlinear device re-stamps based on new solution `x`
   - Check convergence: `|x_new - x_old| < abstol + reltol * |x_new|`
   - Repeat until converged or max iterations (default 100)
3. Return node voltages and branch currents
4. Supports DC sweep — repeat operating point while varying a source value

### Transient Analysis
1. Compute DC operating point as initial condition
2. For each timestep:
   - Companion model: discretize C matrix using integration method
     - **Backward Euler** (first-order, stable, used for initial steps)
     - **Trapezoidal** (second-order, better accuracy, primary method)
   - Combine: `(G + C/Δt) * x = b + history_terms`
   - Newton-Raphson to convergence at this timestep
   - **Adaptive timestep**: grow Δt if convergence is fast, shrink if slow/failing. Bounded by user-specified max step.
   - **Yield result** — streaming point. Each converged timestep produces a result that can be consumed incrementally.
3. Breakpoint handling: ensure timesteps land on source discontinuities (e.g., pulse edges)

### AC Small-Signal Analysis
1. Compute DC operating point
2. Linearize all nonlinear devices at the operating point (small-signal models)
3. For each frequency in the sweep (linear, decade, or octave spacing):
   - Build complex admittance matrix: `Y = G + jωC`
   - Solve `Yx = b_ac` (complex linear system, no Newton-Raphson needed)
   - Yield magnitude and phase at each frequency point
4. Results: Bode plot data (magnitude in dB, phase in degrees)

### Convergence Defaults (SPICE convention)
- `abstol`: 1e-12 A (currents), 1e-6 V (voltages)
- `reltol`: 1e-3
- `maxiter`: 100 (DC), 50 (transient per step)
- `trtol`: 7 (trapezoidal truncation error factor)

---

## Public API

### Netlist API
```typescript
import { simulate, parse } from '@spice-ts/core';

// One-shot: parse + simulate
const results = await simulate(`
  V1 1 0 DC 5
  R1 1 2 1k
  R2 2 0 2k
  .op
  .end
`);

console.log(results.dc.voltage('2')); // 3.333...

// Or parse separately for inspection/reuse
const circuit = parse(netlistString);
const results = await simulate(circuit);
```

### Programmatic API
```typescript
import { Circuit, simulate } from '@spice-ts/core';

const ckt = new Circuit();
ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
ckt.addResistor('R1', '1', '2', 1e3);
ckt.addResistor('R2', '2', '0', 2e3);
ckt.addAnalysis('op');

const results = await simulate(ckt);
```

### Streaming API
```typescript
const ckt = parse(`
  V1 1 0 PULSE(0 5 0 1n 1n 5u 10u)
  R1 1 2 1k
  C1 2 0 1n
  .tran 100n 20u
  .end
`);

// Stream results as they're computed
for await (const step of simulateStream(ckt)) {
  // step: { time, voltages: Map<string, number>, currents: Map<string, number> }
  plotPoint(step.time, step.voltages.get('2'));
}

// Or collect all at once
const results = await simulate(ckt);
results.transient.voltage('2'); // number[] — full waveform
results.transient.time;         // number[] — time points
```

### Configuration
```typescript
const results = await simulate(ckt, {
  maxIterations: 150,
  abstol: 1e-12,
  reltol: 1e-3,
  maxTimestep: 1e-7,
  integrationMethod: 'trapezoidal', // or 'euler'
});
```

### Key API Decisions
- **`simulate()` is async** — returns a Promise, ready for Worker wrapping
- **`simulateStream()` returns an AsyncIterableIterator** — natural streaming via `for await...of`
- **Node names are strings** — matches SPICE convention
- **Results are typed per analysis** — `results.dc`, `results.transient`, `results.ac`

---

## Error Handling

### Error Types
- **ParseError** — malformed netlist, unknown device type, missing parameters. Includes line number and context.
- **ConvergenceError** — Newton-Raphson didn't converge. Reports oscillating nodes and last two solution vectors.
- **SingularMatrixError** — circuit has a topological issue (floating node, voltage source loop). Reports involved nodes/branches.
- **TimestepTooSmallError** — adaptive timestep shrank below minimum threshold.
- **InvalidCircuitError** — structural problems caught before simulation (no ground node, disconnected subcircuits, missing analysis command).

### Behavior
- Errors are thrown as typed Error subclasses for specific catch handling
- Warnings (e.g., "node X has only one connection") are collected and returned alongside results, not thrown
- Streaming: errors thrown from the async iterator, caught naturally in `for await...of`

```typescript
try {
  for await (const step of simulateStream(ckt)) {
    plotPoint(step);
  }
} catch (e) {
  if (e instanceof ConvergenceError) {
    showWarning(`Failed to converge at t=${e.time}: nodes ${e.oscillatingNodes}`);
  }
}
```

---

## Testing & Validation

### Unit Tests
- **Device models** — verify stamp values against hand-calculated matrices
- **Parser** — verify SPICE netlist parsing, `.model` cards, source types
- **Solver** — verify sparse LU against known linear systems
- **Convergence** — verify Newton-Raphson for simple nonlinear circuits

### Integration Tests (known circuits)
- Resistive voltage divider (DC)
- RC time constant (transient) — verify exponential decay matches `V * e^(-t/RC)`
- RL circuit (transient)
- RLC resonance (AC) — verify peak at `f = 1/(2π√LC)`
- Diode I-V curve (DC sweep)
- BJT common-emitter amplifier bias point (DC)
- MOSFET inverter transfer curve (DC sweep)

### Cross-Validation Against ngspice
- Run same `.cir` files through ngspice and spice-ts
- Compare node voltages/currents within tolerance (< 0.1% relative error)
- Automated script runs ngspice, captures output, compares numerically
- Golden references stored in `fixtures/ngspice-ref/`

### Benchmark Suite
- **ISCAS circuits** for performance tracking
- **Scaling tests** — resistor ladder at 10, 100, 1000, 10000 nodes
- Results tracked over time for regression detection
- Wall-clock comparison against ngspice

### CI
- Unit + integration tests on every PR
- Benchmark suite on `main` merges
- ngspice cross-validation nightly or on-demand

---

## Future Work (post-v1)
- BSIM3/BSIM4 model import from vendor `.lib` files
- Subcircuit / hierarchical netlist (`.subckt`)
- Web Worker wrapper for non-blocking browser execution
- WASM KLU solver for large circuit performance
- Noise analysis
- Monte Carlo / parameter sweep
- `@spice-ts/ui` package — schematic editor + waveform viewer
