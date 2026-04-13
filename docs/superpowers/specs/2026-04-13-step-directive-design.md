# .step Directive -- Parametric Sweep Support

**Issue:** #21
**Date:** 2026-04-13

## Summary

Add `.step` directive support to `@spice-ts/core`, enabling parametric sweeps that re-run an analysis while varying a component value or global parameter. Sequential execution with streaming; designed for future worker-based parallelism (#27).

## Scope

### v1 (this spec)

- Sweep **component values**: resistors, capacitors, inductors
- Sweep **global `.param` variables** that resolve to device values
- Sweep modes: linear, decade, octave, list
- Works with `.op`, `.dc`, `.tran`, `.ac` analyses
- Works with both netlist parsing and Circuit builder API
- Sequential execution with streaming results per step
- Previous step's DC solution seeds the next step's initial guess

### Future (out of scope)

- Model parameter sweeps (e.g., `M1.VTO`) -- requires device model setter extensions
- Temperature sweeps (`.step temp`) -- requires thermal modeling
- Nested `.step` directives (parameter grids)
- Parallel execution via Web Workers / Worker Threads (#27)

## Types

### StepAnalysis (types.ts)

```typescript
type StepSweepMode = 'lin' | 'dec' | 'oct' | 'list';

interface StepAnalysis {
  type: 'step';
  param: string;           // device name (e.g., 'R1') or global param name
  sweepMode: StepSweepMode;
  start?: number;          // lin/dec/oct
  stop?: number;           // lin/dec/oct
  increment?: number;      // lin: absolute step size between sweep points
  points?: number;         // dec/oct: points per decade or octave
  values?: number[];       // list mode
}
```

### StepResult (results.ts)

```typescript
interface StepResult {
  paramName: string;
  paramValue: number;
  dc?: DCResult;
  dcSweep?: DCSweepResult;
  transient?: TransientResult;
  ac?: ACResult;
}
```

### SimulationResult extension (results.ts)

```typescript
interface SimulationResult {
  // ...existing fields unchanged...
  steps?: StepResult[];  // present when .step is used
}
```

When `.step` is present, the top-level `dc`/`ac`/`transient`/`dcSweep` fields stay empty. All results live inside `steps[]`.

### StepStreamEvent (types.ts)

```typescript
interface StepStreamEvent {
  stepIndex: number;
  paramName: string;
  paramValue: number;
  point: TransientStep | ACPoint;
}
```

`simulateStream()` yield type becomes `TransientStep | ACPoint | StepStreamEvent`.

## Netlist Syntax

```spice
* Linear sweep: .step param <name> <start> <stop> <increment>
.step param R1 1k 100k 10k

* Decade sweep: .step dec param <name> <start> <stop> <points_per_decade>
.step dec param C1 1p 1u 10

* Octave sweep: .step oct param <name> <start> <stop> <points_per_octave>
.step oct param C1 1p 1u 5

* List sweep: .step param <name> list <val1> <val2> ...
.step param R1 list 1k 10k 100k
```

### Parsing (parser/index.ts)

New case in `parseDotCommand` for `.STEP`:

1. If first token after `.step` is `dec` or `oct`, consume as sweep mode, then `param`, then name + start/stop/points
2. Otherwise expect `param`, then check if the token after name is `list` -- if so, consume remaining as values
3. Otherwise parse as `lin` with start/stop/increment

The parsed `StepAnalysis` is stored via a new `Circuit.addStep()` method.

## Circuit Builder API

```typescript
// Linear sweep (default)
ckt.addStep('R1', { start: 1000, stop: 100000, step: 10000 });

// Decade sweep
ckt.addStep('C1', { mode: 'dec', start: 1e-12, stop: 1e-6, points: 10 });

// Octave sweep
ckt.addStep('C1', { mode: 'oct', start: 1e-12, stop: 1e-6, points: 5 });

// List
ckt.addStep('R1', { values: [1000, 10000, 100000] });
```

Internally stores `StepAnalysis[]` in `Circuit._steps`. These are included in `CompiledCircuit` as a new `steps: StepAnalysis[]` field.

## Device Parameter Setters

### DeviceModel interface extension (device.ts)

```typescript
interface DeviceModel {
  // ...existing methods...
  setParameter?(value: number): void;
  getParameter?(): number;
}
```

Both methods are optional -- only sweepable devices implement them.

### Implementations

- **Resistor**: `resistance` becomes non-readonly. `setParameter` sets it, `getParameter` returns it.
- **Capacitor**: `capacitance` becomes non-readonly. Same pattern.
- **Inductor**: `inductance` becomes non-readonly. Same pattern.

### Global .param support

When a device value originates from a `.param` expression, `Circuit.compile()` records a mapping from param name to the device instances that depend on it. Stored in `CompiledCircuit` as:

```typescript
paramDeps: Map<string, { device: DeviceModel; originalValue: number }[]>
```

When stepping a global param, all dependent devices get updated via `setParameter`.

## Simulation Loop (simulate.ts)

### Sweep value generation

Utility function `generateStepValues(step: StepAnalysis): number[]`:

- **lin**: `[start, start+increment, start+2*increment, ..., stop]`
- **dec**: `points` values per decade from `start` to `stop`, log-spaced
- **oct**: `points` values per octave from `start` to `stop`, log-spaced
- **list**: return `values` as-is

### simulate() changes

When `compiled.steps` is non-empty:

1. Generate sweep values from the `StepAnalysis`
2. For each sweep value:
   a. Save original device parameter(s)
   b. Call `setParameter(value)` on target device(s)
   c. Run all declared analyses (`.op`, `.dc`, `.tran`, `.ac`) using existing solver functions
   d. Use previous step's DC operating point solution as initial guess for the next step
   e. Collect results into a `StepResult { paramName, paramValue, dc?, dcSweep?, transient?, ac? }`
3. Restore original parameter values
4. Return `{ steps: [...], warnings }`

Top-level `dc`/`ac`/`transient`/`dcSweep` fields remain undefined.

### simulateStream() changes

When steps are present, yield `StepStreamEvent` objects wrapping each inner `TransientStep` or `ACPoint` with step metadata (`stepIndex`, `paramName`, `paramValue`). Events stream as each inner time/frequency point completes within each step, enabling progressive UI rendering.

## Error Handling

- Unknown param/device name in `.step`: throw `InvalidCircuitError` with descriptive message
- Device doesn't support `setParameter`: throw `InvalidCircuitError` ("device 'X' does not support parametric sweep")
- Invalid sweep range (start > stop for lin, start <= 0 for log): throw `ParseError`
- Convergence failure on a step: include step index/value in error message

## Testing

- **Unit: sweep value generation** -- verify lin/dec/oct/list produce correct arrays
- **Unit: parser** -- verify all four `.step` syntax variants parse correctly
- **Unit: device setters** -- verify set/get roundtrip on R, C, L
- **Integration: .step + .op** -- sweep R in voltage divider, verify output voltage curve
- **Integration: .step + .ac** -- sweep C in RC filter, verify family of Bode plots
- **Integration: .step + .tran** -- sweep R, verify family of transient waveforms
- **Integration: .step + .dc** -- sweep a component while also doing a DC source sweep
- **Integration: Circuit API** -- same tests via `ckt.addStep()` instead of netlist
- **Integration: streaming** -- verify `StepStreamEvent` ordering and metadata
- **Edge: single step value** -- list with one value behaves like no-step simulation
- **Edge: param deps** -- global `.param` sweep updates all dependent devices
