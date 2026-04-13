# .step Directive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.step` parametric sweep support so users can vary component values or `.param` variables across multiple simulation runs, producing a family of results.

**Architecture:** `.step` is implemented as a meta-directive that wraps existing analyses. Device classes gain `setParameter`/`getParameter` methods. The simulation loop iterates sweep values, updating device parameters and re-running all analyses per step. Results are collected into `StepResult[]`. Streaming yields `StepStreamEvent` per inner point.

**Tech Stack:** TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-04-13-step-directive-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/core/src/types.ts` | Add `StepAnalysis`, `StepSweepMode`, `StepStreamEvent` types |
| Modify | `packages/core/src/results.ts` | Add `StepResult` interface, extend `SimulationResult` |
| Modify | `packages/core/src/devices/device.ts` | Add optional `setParameter`/`getParameter` to `DeviceModel` |
| Modify | `packages/core/src/devices/resistor.ts` | Implement `setParameter`/`getParameter` |
| Modify | `packages/core/src/devices/capacitor.ts` | Implement `setParameter`/`getParameter` |
| Modify | `packages/core/src/devices/inductor.ts` | Implement `setParameter`/`getParameter` |
| Create | `packages/core/src/analysis/step.ts` | Sweep value generation + step execution loop |
| Create | `packages/core/src/analysis/step.test.ts` | All step-related tests |
| Modify | `packages/core/src/circuit.ts` | Add `_steps`, `addStep()`, expose in `CompiledCircuit` |
| Modify | `packages/core/src/parser/index.ts` | Parse `.STEP` directive |
| Modify | `packages/core/src/simulate.ts` | Wire step loop into `simulate()` and `simulateStream()` |
| Modify | `packages/core/src/index.ts` | Export new types |

---

### Task 1: Types and Result Interfaces

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/results.ts`

- [ ] **Step 1: Add step types to types.ts**

Add at the end of `packages/core/src/types.ts`, before the closing of the file:

```typescript
/** Sweep mode for .step directive */
export type StepSweepMode = 'lin' | 'dec' | 'oct' | 'list';

/** .step directive — parametric sweep configuration. */
export interface StepAnalysis {
  type: 'step';
  /** Device name (e.g., 'R1') or global param name to sweep */
  param: string;
  /** Sweep mode */
  sweepMode: StepSweepMode;
  /** Start value (lin/dec/oct) */
  start?: number;
  /** Stop value (lin/dec/oct) */
  stop?: number;
  /** Step increment (lin) or points per decade/octave (dec/oct) */
  increment?: number;
  /** Points per decade or octave (dec/oct) */
  points?: number;
  /** Explicit list of values (list mode) */
  values?: number[];
}

/**
 * A single streaming event from a stepped simulation.
 * Wraps a TransientStep or ACPoint with step metadata.
 */
export interface StepStreamEvent {
  stepIndex: number;
  paramName: string;
  paramValue: number;
  point: TransientStep | ACPoint;
}
```

- [ ] **Step 2: Add StepResult and extend SimulationResult in results.ts**

In `packages/core/src/results.ts`, add the `StepResult` interface after the `DCSweepResult` class and before `SimulationResult`:

```typescript
/**
 * Result of a single parametric step.
 * Contains the same result fields as a non-stepped simulation.
 */
export interface StepResult {
  /** Name of the swept parameter or device */
  paramName: string;
  /** Value of the parameter for this step */
  paramValue: number;
  /** DC operating point result (from .op) */
  dc?: DCResult;
  /** DC sweep result (from .dc) */
  dcSweep?: DCSweepResult;
  /** Transient analysis result (from .tran) */
  transient?: TransientResult;
  /** AC small-signal analysis result (from .ac) */
  ac?: ACResult;
}
```

Then add `steps` to `SimulationResult`:

```typescript
export interface SimulationResult {
  dc?: DCResult;
  dcSweep?: DCSweepResult;
  transient?: TransientResult;
  ac?: ACResult;
  /** Parametric sweep results (from .step). When present, top-level result fields are empty. */
  steps?: StepResult[];
  warnings: SimulationWarning[];
}
```

- [ ] **Step 3: Run type check**

Run: `cd packages/core && npx tsc --noEmit`
Expected: PASS (no compile errors — new types are additive)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/results.ts
git commit -m "feat(core): add StepAnalysis, StepResult, and StepStreamEvent types (#21)"
```

---

### Task 2: Device Parameter Setters

**Files:**
- Modify: `packages/core/src/devices/device.ts`
- Modify: `packages/core/src/devices/resistor.ts`
- Modify: `packages/core/src/devices/capacitor.ts`
- Modify: `packages/core/src/devices/inductor.ts`
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write failing tests for device setters**

Create `packages/core/src/analysis/step.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Resistor } from '../devices/resistor.js';
import { Capacitor } from '../devices/capacitor.js';
import { Inductor } from '../devices/inductor.js';

describe('Device parameter setters', () => {
  it('Resistor set/get parameter', () => {
    const r = new Resistor('R1', [0, 1], 1000);
    expect(r.getParameter()).toBe(1000);
    r.setParameter(2000);
    expect(r.getParameter()).toBe(2000);
    expect(r.resistance).toBe(2000);
  });

  it('Capacitor set/get parameter', () => {
    const c = new Capacitor('C1', [0, 1], 1e-9);
    expect(c.getParameter()).toBe(1e-9);
    c.setParameter(2e-9);
    expect(c.getParameter()).toBe(2e-9);
    expect(c.capacitance).toBe(2e-9);
  });

  it('Inductor set/get parameter', () => {
    const l = new Inductor('L1', [0, 1], 0, 1e-3);
    expect(l.getParameter()).toBe(1e-3);
    l.setParameter(2e-3);
    expect(l.getParameter()).toBe(2e-3);
    expect(l.inductance).toBe(2e-3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: FAIL — `setParameter` and `getParameter` do not exist on device classes

- [ ] **Step 3: Add optional methods to DeviceModel interface**

In `packages/core/src/devices/device.ts`, add to the `DeviceModel` interface:

```typescript
  /** Set the device's primary parameter value (resistance, capacitance, etc.). */
  setParameter?(value: number): void;
  /** Get the device's primary parameter value. */
  getParameter?(): number;
```

- [ ] **Step 4: Implement setters on Resistor**

In `packages/core/src/devices/resistor.ts`, change `readonly resistance` to `resistance` and add:

```typescript
  setParameter(value: number): void {
    this.resistance = value;
  }

  getParameter(): number {
    return this.resistance;
  }
```

- [ ] **Step 5: Implement setters on Capacitor**

In `packages/core/src/devices/capacitor.ts`, change `readonly capacitance` to `capacitance` and add:

```typescript
  setParameter(value: number): void {
    this.capacitance = value;
  }

  getParameter(): number {
    return this.capacitance;
  }
```

- [ ] **Step 6: Implement setters on Inductor**

In `packages/core/src/devices/inductor.ts`, change `readonly inductance` to `inductance` and add:

```typescript
  setParameter(value: number): void {
    this.inductance = value;
  }

  getParameter(): number {
    return this.inductance;
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 8: Run full test suite to check for regressions**

Run: `cd packages/core && npx vitest run`
Expected: PASS — changing `readonly` to mutable should not break existing tests

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/devices/device.ts packages/core/src/devices/resistor.ts packages/core/src/devices/capacitor.ts packages/core/src/devices/inductor.ts packages/core/src/analysis/step.test.ts
git commit -m "feat(core): add setParameter/getParameter to R, C, L devices (#21)"
```

---

### Task 3: Sweep Value Generation

**Files:**
- Create: `packages/core/src/analysis/step.ts`
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write failing tests for sweep value generation**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
import { generateStepValues } from './step.js';
import type { StepAnalysis } from '../types.js';

describe('generateStepValues', () => {
  it('generates linear sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'R1', sweepMode: 'lin',
      start: 1000, stop: 5000, increment: 1000,
    };
    const values = generateStepValues(step);
    expect(values).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it('generates decade sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'C1', sweepMode: 'dec',
      start: 1e-12, stop: 1e-9, points: 3,
    };
    const values = generateStepValues(step);
    // 3 decades (1p to 1n), 3 points per decade = 9 intervals + 1 = 10 points
    expect(values.length).toBe(10);
    expect(values[0]).toBeCloseTo(1e-12, 20);
    expect(values[values.length - 1]).toBeCloseTo(1e-9, 18);
  });

  it('generates octave sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'C1', sweepMode: 'oct',
      start: 100, stop: 800, points: 1,
    };
    const values = generateStepValues(step);
    // 3 octaves (100->200->400->800), 1 point per octave = 3 intervals + 1 = 4 points
    expect(values.length).toBe(4);
    expect(values[0]).toBeCloseTo(100);
    expect(values[1]).toBeCloseTo(200);
    expect(values[2]).toBeCloseTo(400);
    expect(values[3]).toBeCloseTo(800);
  });

  it('generates list sweep values', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'R1', sweepMode: 'list',
      values: [1000, 4700, 10000],
    };
    const values = generateStepValues(step);
    expect(values).toEqual([1000, 4700, 10000]);
  });

  it('single-value list returns one value', () => {
    const step: StepAnalysis = {
      type: 'step', param: 'R1', sweepMode: 'list',
      values: [1000],
    };
    const values = generateStepValues(step);
    expect(values).toEqual([1000]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: FAIL — `generateStepValues` does not exist yet

- [ ] **Step 3: Implement generateStepValues**

Create `packages/core/src/analysis/step.ts`:

```typescript
import type { StepAnalysis } from '../types.js';

/**
 * Generate the array of parameter values for a .step sweep.
 */
export function generateStepValues(step: StepAnalysis): number[] {
  switch (step.sweepMode) {
    case 'lin': {
      const { start, stop, increment } = step;
      const values: number[] = [];
      const n = Math.round((stop! - start!) / increment!) + 1;
      for (let i = 0; i < n; i++) {
        values.push(start! + i * increment!);
      }
      return values;
    }
    case 'dec': {
      const { start, stop, points } = step;
      const decades = Math.log10(stop! / start!);
      const totalPoints = Math.round(decades * points!);
      const values: number[] = [];
      for (let i = 0; i <= totalPoints; i++) {
        values.push(start! * Math.pow(10, i / points!));
      }
      return values;
    }
    case 'oct': {
      const { start, stop, points } = step;
      const octaves = Math.log2(stop! / start!);
      const totalPoints = Math.round(octaves * points!);
      const values: number[] = [];
      for (let i = 0; i <= totalPoints; i++) {
        values.push(start! * Math.pow(2, i / points!));
      }
      return values;
    }
    case 'list':
      return step.values!.slice();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/analysis/step.ts packages/core/src/analysis/step.test.ts
git commit -m "feat(core): add generateStepValues for lin/dec/oct/list sweeps (#21)"
```

---

### Task 4: Circuit Builder API and CompiledCircuit

**Files:**
- Modify: `packages/core/src/circuit.ts`
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write failing test for addStep and compile**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
import { Circuit } from '../circuit.js';

describe('Circuit.addStep', () => {
  it('stores step and includes it in compiled output', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R1', { start: 1000, stop: 5000, step: 1000 });

    const compiled = ckt.compile();
    expect(compiled.steps.length).toBe(1);
    expect(compiled.steps[0].param).toBe('R1');
    expect(compiled.steps[0].sweepMode).toBe('lin');
  });

  it('stores decade sweep step', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addCapacitor('C1', '1', '0', 1e-12);
    ckt.addAnalysis('op');
    ckt.addStep('C1', { mode: 'dec', start: 1e-12, stop: 1e-6, points: 10 });

    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('dec');
    expect(compiled.steps[0].points).toBe(10);
  });

  it('stores list sweep step', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R1', { values: [1000, 10000, 100000] });

    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('list');
    expect(compiled.steps[0].values).toEqual([1000, 10000, 100000]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: FAIL — `addStep` does not exist on `Circuit`, `steps` does not exist on `CompiledCircuit`

- [ ] **Step 3: Add `_steps` field and `addStep` method to Circuit**

In `packages/core/src/circuit.ts`, add import for `StepAnalysis`:

```typescript
import type { AnalysisCommand, SourceWaveform, ModelParams, SubcktDefinition, StepAnalysis } from './types.js';
```

Add a field alongside `_analyses`:

```typescript
private _steps: StepAnalysis[] = [];
```

Add `addStep` method (after `addAnalysis`):

```typescript
  /**
   * Add a .step parametric sweep directive.
   *
   * @param param - Device name (e.g., 'R1') or global parameter name to sweep
   * @param opts - Sweep configuration
   */
  addStep(param: string, opts: {
    mode?: 'lin' | 'dec' | 'oct';
    start?: number;
    stop?: number;
    step?: number;
    points?: number;
    values?: number[];
  }): void {
    if (opts.values) {
      this._steps.push({ type: 'step', param, sweepMode: 'list', values: opts.values });
    } else {
      const sweepMode = opts.mode ?? 'lin';
      this._steps.push({
        type: 'step', param, sweepMode,
        start: opts.start, stop: opts.stop,
        increment: sweepMode === 'lin' ? opts.step : undefined,
        points: sweepMode !== 'lin' ? opts.points : undefined,
      });
    }
  }
```

- [ ] **Step 4: Add `steps` to CompiledCircuit and compile()**

In `packages/core/src/circuit.ts`, add to the `CompiledCircuit` interface:

```typescript
  /** Step directives for parametric sweeps */
  steps: StepAnalysis[];
```

In the `compile()` method return object, add:

```typescript
  steps: this._steps,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/circuit.ts packages/core/src/analysis/step.test.ts
git commit -m "feat(core): add Circuit.addStep() and CompiledCircuit.steps (#21)"
```

---

### Task 5: Parser — .STEP Directive

**Files:**
- Modify: `packages/core/src/parser/index.ts`
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write failing parser tests**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
import { parse } from '../parser/index.js';

describe('.step netlist parsing', () => {
  it('parses linear step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R1 1k 100k 10k
    `);
    const compiled = ckt.compile();
    expect(compiled.steps.length).toBe(1);
    expect(compiled.steps[0].param).toBe('R1');
    expect(compiled.steps[0].sweepMode).toBe('lin');
    expect(compiled.steps[0].start).toBeCloseTo(1000);
    expect(compiled.steps[0].stop).toBeCloseTo(100000);
    expect(compiled.steps[0].increment).toBeCloseTo(10000);
  });

  it('parses decade step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      C1 1 0 1p
      .op
      .step dec param C1 1p 1u 10
    `);
    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('dec');
    expect(compiled.steps[0].start).toBeCloseTo(1e-12);
    expect(compiled.steps[0].stop).toBeCloseTo(1e-6);
    expect(compiled.steps[0].points).toBe(10);
  });

  it('parses octave step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      C1 1 0 1p
      .op
      .step oct param C1 100 800 1
    `);
    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('oct');
    expect(compiled.steps[0].points).toBe(1);
  });

  it('parses list step', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R1 list 1k 10k 100k
    `);
    const compiled = ckt.compile();
    expect(compiled.steps[0].sweepMode).toBe('list');
    expect(compiled.steps[0].values).toEqual([1000, 10000, 100000]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: FAIL — `.step` is silently ignored by the parser (falls through the `default: break` in `parseDotCommand`)

- [ ] **Step 3: Implement .STEP parsing in parseDotCommand**

In `packages/core/src/parser/index.ts`, add a case for `.STEP` in the `parseDotCommand` function's switch statement (before the `default:` case):

```typescript
    case '.STEP': {
      // .step [dec|oct] param <name> <start> <stop> <step|points>
      // .step param <name> list <val1> <val2> ...
      let idx = 1;
      let sweepMode: 'lin' | 'dec' | 'oct' = 'lin';
      const modeToken = tokens[idx].toUpperCase();
      if (modeToken === 'DEC' || modeToken === 'OCT') {
        sweepMode = modeToken.toLowerCase() as 'dec' | 'oct';
        idx++;
      }
      // Skip 'param' keyword
      if (tokens[idx].toUpperCase() === 'PARAM') idx++;
      const paramName = tokens[idx++];
      // Check for list mode
      if (tokens[idx] && tokens[idx].toUpperCase() === 'LIST') {
        idx++;
        const values: number[] = [];
        for (; idx < tokens.length; idx++) {
          values.push(parseNumber(tokens[idx]));
        }
        circuit.addStep(paramName, { values });
      } else {
        const start = parseNumber(tokens[idx++]);
        const stop = parseNumber(tokens[idx++]);
        const stepOrPoints = parseInt(tokens[idx], 10);
        // For dec/oct the third number is points (integer); for lin it's an increment
        if (sweepMode === 'lin') {
          circuit.addStep(paramName, { mode: 'lin', start, stop, step: parseNumber(tokens[idx]) });
        } else {
          circuit.addStep(paramName, { mode: sweepMode, start, stop, points: stepOrPoints });
        }
      }
      break;
    }
```

Also add import for `parseNumber` if not already imported (it is — `parseNumber` is already imported from `./tokenizer.js`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/parser/index.ts packages/core/src/analysis/step.test.ts
git commit -m "feat(core): parse .step directive in netlist (#21)"
```

---

### Task 6: Step Execution Loop (simulate)

**Files:**
- Modify: `packages/core/src/analysis/step.ts`
- Modify: `packages/core/src/simulate.ts`
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write failing integration tests for .step + .op**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
import { simulate } from '../simulate.js';

describe('.step + .op integration', () => {
  it('sweeps resistor in voltage divider', async () => {
    const result = await simulate(`
      V1 1 0 DC 10
      R1 1 2 1k
      R2 2 0 1k
      .op
      .step param R2 1k 5k 1k
    `);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(5); // 1k, 2k, 3k, 4k, 5k
    // Top-level fields should be empty when .step is present
    expect(result.dc).toBeUndefined();

    for (let i = 0; i < 5; i++) {
      const step = result.steps![i];
      const r2 = 1000 + i * 1000;
      expect(step.paramName).toBe('R2');
      expect(step.paramValue).toBeCloseTo(r2);
      expect(step.dc).toBeDefined();
      // V(2) = 10 * R2 / (R1 + R2)
      const expected = 10 * r2 / (1000 + r2);
      expect(step.dc!.voltage('2')).toBeCloseTo(expected, 4);
    }
  });

  it('sweeps with list mode', async () => {
    const result = await simulate(`
      V1 1 0 DC 10
      R1 1 2 1k
      R2 2 0 1k
      .op
      .step param R2 list 1k 10k
    `);

    expect(result.steps!.length).toBe(2);
    expect(result.steps![0].paramValue).toBeCloseTo(1000);
    expect(result.steps![1].paramValue).toBeCloseTo(10000);

    // V(2) = 10 * R2 / (R1 + R2)
    expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(10 * 1000 / 2000, 4);
    expect(result.steps![1].dc!.voltage('2')).toBeCloseTo(10 * 10000 / 11000, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: FAIL — `result.steps` is undefined

- [ ] **Step 3: Implement solveStep in step.ts**

Add to `packages/core/src/analysis/step.ts`:

```typescript
import type { StepAnalysis, SimulationWarning } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import type { StepResult } from '../results.js';
import { solveDCOperatingPoint } from './dc.js';
import { solveDCSweep } from './dc-sweep.js';
import { solveTransient } from './transient.js';
import { solveAC } from './ac.js';
import { resolveOptions } from '../types.js';
import { InvalidCircuitError } from '../errors.js';
import type { SimulationOptions } from '../types.js';

/**
 * Execute a parametric sweep: for each step value, update the target device
 * parameter and run all declared analyses.
 */
export function solveStep(
  compiled: CompiledCircuit,
  step: StepAnalysis,
  options: SimulationOptions | undefined,
  warnings: SimulationWarning[],
): StepResult[] {
  const values = generateStepValues(step);

  // Find the target device
  const device = compiled.devices.find(d => d.name === step.param);
  if (!device) {
    throw new InvalidCircuitError(`Step parameter device '${step.param}' not found`);
  }
  if (!device.setParameter || !device.getParameter) {
    throw new InvalidCircuitError(
      `Device '${step.param}' does not support parametric sweep`,
    );
  }

  const originalValue = device.getParameter();
  const results: StepResult[] = [];

  try {
    for (const value of values) {
      device.setParameter(value);
      const stepResult: StepResult = { paramName: step.param, paramValue: value };

      for (const analysis of compiled.analyses) {
        switch (analysis.type) {
          case 'op': {
            const opts = resolveOptions(options);
            const { result: dcResult } = solveDCOperatingPoint(compiled, opts);
            stepResult.dc = dcResult;
            break;
          }
          case 'dc': {
            const opts = resolveOptions(options);
            stepResult.dcSweep = solveDCSweep(compiled, analysis, opts);
            break;
          }
          case 'tran': {
            const opts = resolveOptions(options, analysis.stopTime);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
            stepResult.transient = solveTransient(compiled, analysis, opts, dcAsm.solution);
            break;
          }
          case 'ac': {
            const opts = resolveOptions(options);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
            stepResult.ac = solveAC(compiled, analysis, opts, dcAsm.solution);
            break;
          }
        }
      }

      results.push(stepResult);
    }
  } finally {
    device.setParameter(originalValue);
  }

  return results;
}
```

- [ ] **Step 4: Note on initial guess seeding**

`solveDCOperatingPoint` currently takes 2 arguments (`compiled`, `opts`). The `prevDCSolution` argument shown in Step 3 above will not compile yet. For now, remove the third argument from all `solveDCOperatingPoint` calls — just call `solveDCOperatingPoint(compiled, opts)`. Also remove the `prevDCSolution` variable and the lines that set it. Task 8 will add the initial guess seeding optimization.

- [ ] **Step 5: Wire step loop into simulate()**

In `packages/core/src/simulate.ts`, add import:

```typescript
import { solveStep } from './analysis/step.js';
```

In the `simulate()` function, after `validateCircuit(compiled, warnings)` and before the `for (const analysis of compiled.analyses)` loop, add:

```typescript
  if (compiled.steps.length > 0) {
    const stepResults = solveStep(compiled, compiled.steps[0], options, warnings);
    return { steps: stepResults, warnings };
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/analysis/step.ts packages/core/src/simulate.ts packages/core/src/analysis/step.test.ts
git commit -m "feat(core): implement .step execution loop in simulate() (#21)"
```

---

### Task 7: Step + AC and Transient Integration Tests

**Files:**
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write .step + .ac integration test**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
describe('.step + .ac integration', () => {
  it('sweeps capacitor in RC low-pass filter', async () => {
    // RC low-pass: V1 -> R1 -> out -> C1 -> GND
    // Cutoff freq = 1 / (2*pi*R*C)
    const result = await simulate(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1n
      .ac dec 10 1k 10Meg
      .step param C1 list 1n 10n
    `);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(2);
    expect(result.ac).toBeUndefined();

    // With C=1n, fc ~ 159kHz; with C=10n, fc ~ 15.9kHz
    // At 1kHz both should be near unity gain
    const step1 = result.steps![0];
    const step2 = result.steps![1];
    expect(step1.ac).toBeDefined();
    expect(step2.ac).toBeDefined();

    // First frequency point (1kHz) should have near-unity magnitude for both
    const v1_1k = step1.ac!.voltage('2')[0];
    const v2_1k = step2.ac!.voltage('2')[0];
    expect(v1_1k.magnitude).toBeGreaterThan(0.9);
    expect(v2_1k.magnitude).toBeGreaterThan(0.9);

    // At high frequencies, larger C should have lower magnitude
    const lastIdx = step1.ac!.frequencies.length - 1;
    const v1_high = step1.ac!.voltage('2')[lastIdx];
    const v2_high = step2.ac!.voltage('2')[lastIdx];
    expect(v2_high.magnitude).toBeLessThan(v1_high.magnitude);
  });
});

describe('.step + .tran integration', () => {
  it('sweeps resistor in RC circuit transient', async () => {
    // RC charging: V1(step) -> R1 -> out -> C1 -> GND
    const result = await simulate(`
      V1 1 0 PULSE(0 5 0 1n 1n 10m 20m)
      R1 1 2 1k
      C1 2 0 1u
      .tran 10u 5m
      .step param R1 list 1k 10k
    `);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(2);
    expect(result.transient).toBeUndefined();

    const step1 = result.steps![0]; // R=1k, tau=1ms
    const step2 = result.steps![1]; // R=10k, tau=10ms

    expect(step1.transient).toBeDefined();
    expect(step2.transient).toBeDefined();

    // At t=5ms (~5*tau for R=1k, ~0.5*tau for R=10k)
    // R=1k should be closer to 5V, R=10k should be lower
    const t1 = step1.transient!.time;
    const v1 = step1.transient!.voltage('2');
    const v2 = step2.transient!.voltage('2');
    const lastIdx = t1.length - 1;
    expect(v1[lastIdx]).toBeGreaterThan(v2[lastIdx]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS — these test the already-implemented step loop with `.ac` and `.tran`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/analysis/step.test.ts
git commit -m "test(core): add .step + .ac and .step + .tran integration tests (#21)"
```

---

### Task 8: Initial Guess Seeding (DC Solution Reuse)

**Files:**
- Modify: `packages/core/src/analysis/dc.ts`
- Modify: `packages/core/src/analysis/step.ts`

- [ ] **Step 1: Read current dc.ts signature**

Read `packages/core/src/analysis/dc.ts` and check the `solveDCOperatingPoint` signature.

- [ ] **Step 2: Add optional initialSolution parameter to solveDCOperatingPoint**

If not already present, add an optional third parameter:

```typescript
export function solveDCOperatingPoint(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
): { result: DCResult; assembler: MNAAssembler } {
```

At the start of the function, after creating the assembler, seed it if provided:

```typescript
  if (initialSolution) {
    assembler.solution.set(initialSolution);
  }
```

- [ ] **Step 3: Update solveStep to pass prevDCSolution**

In `packages/core/src/analysis/step.ts`, ensure all `solveDCOperatingPoint` calls pass `prevDCSolution` as the third argument (if this was deferred in Task 6 Step 4, now add the argument).

- [ ] **Step 4: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS — this is a transparent optimization, should not change results

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/analysis/dc.ts packages/core/src/analysis/step.ts
git commit -m "perf(core): seed DC solution from previous step for faster convergence (#21)"
```

---

### Task 9: Streaming Support

**Files:**
- Modify: `packages/core/src/simulate.ts`
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write failing streaming test**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
import { simulateStream } from '../simulate.js';
import type { StepStreamEvent } from '../types.js';

describe('.step streaming', () => {
  it('streams step events for .ac', async () => {
    const events: StepStreamEvent[] = [];
    for await (const event of simulateStream(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1n
      .ac dec 5 1k 100k
      .step param C1 list 1n 10n
    `)) {
      events.push(event as StepStreamEvent);
    }

    expect(events.length).toBeGreaterThan(0);
    // All events should have step metadata
    for (const e of events) {
      expect(e.stepIndex).toBeDefined();
      expect(e.paramName).toBe('C1');
      expect(e.paramValue).toBeDefined();
    }

    // Should have events from both steps
    const stepIndices = new Set(events.map(e => e.stepIndex));
    expect(stepIndices.size).toBe(2);
    expect(stepIndices.has(0)).toBe(true);
    expect(stepIndices.has(1)).toBe(true);

    // Step 0 events should come before step 1 events
    const firstStep1Idx = events.findIndex(e => e.stepIndex === 1);
    const lastStep0Idx = events.length - 1 - [...events].reverse().findIndex(e => e.stepIndex === 0);
    expect(lastStep0Idx).toBeLessThan(firstStep1Idx);
  });

  it('streams step events for .tran', async () => {
    const events: StepStreamEvent[] = [];
    for await (const event of simulateStream(`
      V1 1 0 PULSE(0 5 0 1n 1n 1m 2m)
      R1 1 2 1k
      C1 2 0 100n
      .tran 10u 500u
      .step param R1 list 1k 10k
    `)) {
      events.push(event as StepStreamEvent);
    }

    expect(events.length).toBeGreaterThan(0);
    const stepIndices = new Set(events.map(e => e.stepIndex));
    expect(stepIndices.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: FAIL — `simulateStream` does not handle `.step` yet

- [ ] **Step 3: Implement step-aware streaming in simulateStream**

In `packages/core/src/simulate.ts`, import the needed types and function:

```typescript
import type { StepStreamEvent, StepAnalysis } from './types.js';
import { generateStepValues } from './analysis/step.js';
```

In `simulateStream()`, after `validateCircuit(compiled, warnings)` and before the `for (const analysis of compiled.analyses)` loop, add:

```typescript
  if (compiled.steps.length > 0) {
    yield* streamWithSteps(compiled, compiled.steps[0], options);
    return;
  }
```

Then add the `streamWithSteps` generator function:

```typescript
function* streamWithSteps(
  compiled: CompiledCircuit,
  step: StepAnalysis,
  options: SimulationOptions | undefined,
): Generator<StepStreamEvent> {
  const values = generateStepValues(step);

  const device = compiled.devices.find(d => d.name === step.param);
  if (!device?.setParameter || !device?.getParameter) {
    throw new InvalidCircuitError(
      `Device '${step.param}' does not support parametric sweep`,
    );
  }

  const originalValue = device.getParameter();

  try {
    for (let stepIndex = 0; stepIndex < values.length; stepIndex++) {
      const value = values[stepIndex];
      device.setParameter(value);

      for (const analysis of compiled.analyses) {
        switch (analysis.type) {
          case 'tran': {
            const opts = resolveOptions(options, analysis.stopTime);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
            for (const point of streamTransient(compiled, analysis, opts, dcAsm.solution)) {
              yield { stepIndex, paramName: step.param, paramValue: value, point };
            }
            break;
          }
          case 'ac': {
            const opts = resolveOptions(options);
            const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
            for (const point of streamAC(compiled, analysis, opts, dcAsm.solution)) {
              yield { stepIndex, paramName: step.param, paramValue: value, point };
            }
            break;
          }
        }
      }
    }
  } finally {
    device.setParameter(originalValue);
  }
}
```

Note: `simulateStream` is `async function*` but `streamWithSteps` can be a synchronous `function*` since the inner generators (`streamTransient`, `streamAC`) are synchronous. Update the signature of `simulateStream` to yield `TransientStep | ACPoint | StepStreamEvent`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/simulate.ts packages/core/src/analysis/step.test.ts
git commit -m "feat(core): add .step streaming support in simulateStream() (#21)"
```

---

### Task 10: Circuit Builder API Integration Test

**Files:**
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write Circuit API integration test**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
describe('.step via Circuit builder API', () => {
  it('sweeps resistor using addStep', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 10 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R2', { start: 1000, stop: 3000, step: 1000 });

    const result = await simulate(ckt);

    expect(result.steps).toBeDefined();
    expect(result.steps!.length).toBe(3);

    for (let i = 0; i < 3; i++) {
      const r2 = 1000 + i * 1000;
      const expected = 10 * r2 / (1000 + r2);
      expect(result.steps![i].dc!.voltage('2')).toBeCloseTo(expected, 4);
    }
  });

  it('sweeps capacitor with decade mode using addStep', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { type: 'ac', magnitude: 1, phase: 0 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addCapacitor('C1', '2', '0', 1e-9);
    ckt.addAnalysis('ac', { variation: 'dec', points: 5, startFreq: 1000, stopFreq: 1e6 });
    ckt.addStep('C1', { mode: 'dec', start: 1e-9, stop: 1e-7, points: 1 });

    const result = await simulate(ckt);

    expect(result.steps).toBeDefined();
    // 2 decades, 1 point per decade = 3 values: 1n, 10n, 100n
    expect(result.steps!.length).toBe(3);
    for (const step of result.steps!) {
      expect(step.ac).toBeDefined();
      expect(step.ac!.frequencies.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/analysis/step.test.ts
git commit -m "test(core): add Circuit builder API integration tests for .step (#21)"
```

---

### Task 11: Exports and Cleanup

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add new exports**

In `packages/core/src/index.ts`, add exports for the new types:

```typescript
export type { StepResult } from './results.js';
export type { StepAnalysis, StepSweepMode, StepStreamEvent } from './types.js';
```

- [ ] **Step 2: Run type check and full test suite**

Run: `cd packages/core && npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export StepResult, StepAnalysis, StepStreamEvent types (#21)"
```

---

### Task 12: Edge Cases and Error Handling Tests

**Files:**
- Test: `packages/core/src/analysis/step.test.ts`

- [ ] **Step 1: Write error handling and edge case tests**

Append to `packages/core/src/analysis/step.test.ts`:

```typescript
describe('.step error handling', () => {
  it('throws on unknown device name', async () => {
    await expect(simulate(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .step param R99 1k 10k 1k
    `)).rejects.toThrow("Step parameter device 'R99' not found");
  });

  it('throws on non-sweepable device', async () => {
    await expect(simulate(`
      V1 1 0 DC 5
      R1 1 0 1k
      D1 1 0
      .op
      .step param D1 list 1 2
    `)).rejects.toThrow("does not support parametric sweep");
  });

  it('single step value produces one result', async () => {
    const result = await simulate(`
      V1 1 0 DC 10
      R1 1 2 1k
      R2 2 0 1k
      .op
      .step param R2 list 2k
    `);

    expect(result.steps!.length).toBe(1);
    expect(result.steps![0].dc!.voltage('2')).toBeCloseTo(10 * 2000 / 3000, 4);
  });

  it('restores original value after step completes', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 10 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 1000);
    ckt.addAnalysis('op');
    ckt.addStep('R2', { values: [2000, 3000] });

    const compiled = ckt.compile();
    const device = compiled.devices.find(d => d.name === 'R2')!;
    expect(device.getParameter!()).toBe(1000); // original

    await simulate(ckt);

    // After simulation, original value should be restored
    const compiled2 = ckt.compile();
    const device2 = compiled2.devices.find(d => d.name === 'R2')!;
    expect(device2.getParameter!()).toBe(1000);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd packages/core && npx vitest run src/analysis/step.test.ts`
Expected: PASS (or fix any failures — the "restores original value" test may need adjustment since `compile()` creates new device instances each time. If so, test via the `solveStep` function directly instead.)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/analysis/step.test.ts
git commit -m "test(core): add .step error handling and edge case tests (#21)"
```

---

### Task 13: Final Validation

- [ ] **Step 1: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: PASS — all existing tests + all new step tests

- [ ] **Step 2: Run type check**

Run: `cd packages/core && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run the UI package tests to check for regressions**

Run: `cd packages/ui && npm test`
Expected: PASS — the UI package should not be affected by core changes

- [ ] **Step 4: Verify exports work from package entry point**

Run: `cd packages/core && node -e "import('./dist/index.js').then(m => console.log('StepResult' in m ? 'OK' : 'MISSING'))"`
(Build first if needed: `npm run build`)
Expected: OK
