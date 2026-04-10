# DC Sweep Analysis (.dc command)

**Issue:** mfiumara/spice-ts#9
**Date:** 2026-04-10

## Summary

Implement `.dc` sweep analysis to compute DC transfer characteristics by sweeping a voltage or current source over a range and recording node voltages and branch currents at each operating point.

## SPICE Syntax

```
.dc Vsrc start stop step
.dc Isrc start stop step
```

## What Already Exists

- **Parser** (`src/parser/index.ts:37-43`): Extracts `source`, `start`, `stop`, `step` into a `DCSweepAnalysis` command.
- **Type** (`src/types.ts:15-22`): `DCSweepAnalysis` interface with `type: 'dc'`, `source`, `start`, `stop`, `step`.
- **Result field** (`src/results.ts`): `SimulationResult.dcSweep` field exists, typed as `DCSweepResult`.
- **Simulator stub** (`src/simulate.ts:37-40`): The `'dc'` case in the analysis switch is a no-op placeholder.
- **DC solver** (`src/analysis/dc.ts`): `solveDCOperatingPoint()` solves a single DC operating point using Newton-Raphson.

## Architecture

### New file: `packages/core/src/analysis/dc-sweep.ts`

A `solveDCSweep()` function that:

1. Receives `CompiledCircuit`, `DCSweepAnalysis`, and `ResolvedOptions`.
2. Finds the sweep source by name in `compiled.devices` (supports both `VoltageSource` and `CurrentSource`).
3. Saves the original waveform, replaces it with a DC waveform at each sweep point.
4. Creates one `MNAAssembler` that persists across the loop. The `solution` vector carries forward as a warm-start initial guess for Newton-Raphson at each point.
5. Collects results into a `DCSweepResult` instance.
6. Restores the original waveform in a `finally` block.

### Dispatch: `simulate.ts`

The `'dc'` case calls `solveDCSweep()` and assigns the return value to `result.dcSweep`.

### No other files changed

The `index.ts` barrel already re-exports from `results.ts`. The `SimulationResult.dcSweep` field already exists.

## Source Lookup and Mutation

Scan `compiled.devices` for a `VoltageSource` or `CurrentSource` whose `.name` matches `analysis.source` (case-sensitive). If not found, throw `SimulationError` with message like `"DC sweep source 'V1' not found"`.

Before the loop, save `source.waveform` to a local variable. At each step, set `source.waveform = { type: 'dc', value: sweepValue }`. In a `finally` block, restore the original waveform so the compiled circuit is not left in a dirty state.

## Sweep Loop

Compute `N = Math.round((stop - start) / step) + 1` points. For `i = 0..N-1`:

1. `sweepValue = start + i * step` (avoids floating-point drift from repeated addition).
2. Set the source waveform to `{ type: 'dc', value: sweepValue }`.
3. `assembler.clear()` — zeros G matrix and b vector but keeps `solution` as-is for warm start.
4. `newtonRaphson(assembler, devices, options, ...)` — converges from previous solution.
5. Read `assembler.solution` into pre-allocated `Float64Array`s for each node and branch.

If `newtonRaphson` throws `ConvergenceError`, it propagates up and aborts the entire sweep (after restoring the source waveform via `finally`).

## Result Class

Replace the existing `DCSweepResult` plain interface in `results.ts` with a class:

```typescript
export class DCSweepResult {
  constructor(
    public readonly sweepValues: Float64Array,
    private readonly voltageArrays: Map<string, Float64Array>,
    private readonly currentArrays: Map<string, Float64Array>,
  ) {}

  voltage(node: string): Float64Array {
    const arr = this.voltageArrays.get(node);
    if (!arr) throw new Error(`Node '${node}' not found in DC sweep results`);
    return arr;
  }

  current(source: string): Float64Array {
    const arr = this.currentArrays.get(source);
    if (!arr) throw new Error(`Source '${source}' not found in DC sweep results`);
    return arr;
  }
}
```

- `sweepValues`: `Float64Array` of length N.
- `voltage(node)`: returns `Float64Array` of length N, aligned with `sweepValues`.
- `current(source)`: returns `Float64Array` of length N, aligned with `sweepValues`.

## Error Handling

- **Source not found:** `SimulationError` at the start of `solveDCSweep()`.
- **Convergence failure:** `ConvergenceError` propagates from `newtonRaphson()`, aborts sweep. Source waveform restored via `finally`.

## Tests

New file: `packages/core/src/analysis/dc-sweep.test.ts`

1. **Voltage divider sweep** — Sweep V1 0 to 5V, step 1V. Assert output voltage = `V1 * R2/(R1+R2)` at each point. Validates basic sweep mechanics and result shape.
2. **Diode I-V curve** — Sweep V1 -1V to 1V through resistor + diode. Assert exponential current growth in forward region. Validates nonlinear convergence and warm-starting.
3. **Current source sweep** — Sweep I1 0 to 1mA through a resistor. Assert `V = I * R`. Validates current source sweeping.
4. **Unknown source error** — Sweep a non-existent source name. Expect `SimulationError`.

## Public API Surface

No new exports beyond the `DCSweepResult` class (replacing the existing interface). The `simulate()` function remains the only entry point. Consumers access sweep results via `result.dcSweep.voltage(node)` / `result.dcSweep.current(source)`.
