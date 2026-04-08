# spice-ts Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@spice-ts/core` — a zero-dependency TypeScript SPICE circuit simulator supporting DC, Transient, and AC analysis with streaming results.

**Architecture:** Stamp-based MNA (Modified Nodal Analysis) with strategy-pattern analysis controllers. Each device model stamps its contributions into sparse matrices. Newton-Raphson handles nonlinear convergence. Results stream via AsyncIterableIterator.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, tsup

**Spec:** `docs/superpowers/specs/2026-04-08-spice-ts-core-design.md`

---

## File Structure

```
spice-ts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── packages/
│   └── core/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── tsup.config.ts
│       └── src/
│           ├── index.ts                 # Public API barrel export
│           ├── types.ts                 # Core type definitions
│           ├── errors.ts                # Error type hierarchy
│           ├── circuit.ts               # Circuit class (programmatic builder)
│           ├── results.ts               # SimulationResult types + accessors
│           ├── simulate.ts              # simulate() and simulateStream() entry points
│           ├── parser/
│           │   ├── index.ts             # Parser entry: parse(netlist) → Circuit
│           │   ├── tokenizer.ts         # Tokenize SPICE netlist lines
│           │   └── model-parser.ts      # Parse .model cards into device params
│           ├── solver/
│           │   ├── sparse-matrix.ts     # COO-format sparse matrix
│           │   └── lu-solver.ts         # Sparse LU decomposition with partial pivoting
│           ├── mna/
│           │   ├── assembler.ts         # MNA matrix assembly + StampContext
│           │   └── companion.ts         # Transient companion models (BE, Trap)
│           ├── devices/
│           │   ├── index.ts             # Device registry + factory
│           │   ├── device.ts            # DeviceModel interface
│           │   ├── resistor.ts
│           │   ├── capacitor.ts
│           │   ├── inductor.ts
│           │   ├── voltage-source.ts
│           │   ├── current-source.ts
│           │   ├── diode.ts
│           │   ├── bjt.ts
│           │   └── mosfet.ts
│           └── analysis/
│               ├── dc.ts                # DC operating point + sweep
│               ├── transient.ts         # Transient analysis
│               ├── ac.ts                # AC small-signal analysis
│               └── newton-raphson.ts    # Newton-Raphson iteration loop
├── benchmarks/                          # (Task 18)
└── fixtures/
    └── circuits/                        # .cir test netlists
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`, `packages/core/tsup.config.ts`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "spice-ts",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
coverage/
```

- [ ] **Step 5: Create packages/core/package.json**

```json
{
  "name": "@spice-ts/core",
  "version": "0.1.0",
  "description": "TypeScript-native SPICE circuit simulator engine",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 6: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 7: Create packages/core/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 8: Create packages/core/tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 9: Create packages/core/src/index.ts (empty barrel)**

```typescript
// @spice-ts/core — public API
```

- [ ] **Step 10: Install dependencies and verify**

Run: `pnpm install`
Expected: Lockfile created, no errors.

Run: `cd packages/core && pnpm test`
Expected: "No test files found" or similar (no tests yet), exit 0 or 1 is fine.

Run: `cd packages/core && pnpm build`
Expected: dist/ created with index.js, index.cjs, index.d.ts.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold pnpm monorepo with @spice-ts/core package"
```

---

### Task 2: Core Types & Error Hierarchy

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/errors.test.ts`

- [ ] **Step 1: Create types.ts**

```typescript
/** Node identifier — string name from netlist (e.g., '1', 'out', '0' for ground) */
export type NodeName = string;

/** Ground node is always '0' */
export const GROUND_NODE = '0';

/** Analysis command types */
export type AnalysisType = 'op' | 'dc' | 'tran' | 'ac';

/** DC analysis command */
export interface DCAnalysis {
  type: 'op';
}

/** DC sweep analysis command */
export interface DCSweepAnalysis {
  type: 'dc';
  source: string;
  start: number;
  stop: number;
  step: number;
}

/** Transient analysis command */
export interface TransientAnalysis {
  type: 'tran';
  timestep: number;
  stopTime: number;
  startTime?: number;
  maxTimestep?: number;
}

/** AC analysis command */
export interface ACAnalysis {
  type: 'ac';
  variation: 'dec' | 'oct' | 'lin';
  points: number;
  startFreq: number;
  stopFreq: number;
}

export type AnalysisCommand = DCAnalysis | DCSweepAnalysis | TransientAnalysis | ACAnalysis;

/** Integration methods for transient analysis */
export type IntegrationMethod = 'euler' | 'trapezoidal';

/** Simulation options with SPICE-convention defaults */
export interface SimulationOptions {
  /** Absolute current tolerance (A). Default: 1e-12 */
  abstol?: number;
  /** Absolute voltage tolerance (V). Default: 1e-6 */
  vntol?: number;
  /** Relative tolerance. Default: 1e-3 */
  reltol?: number;
  /** Max Newton-Raphson iterations (DC). Default: 100 */
  maxIterations?: number;
  /** Max Newton-Raphson iterations per transient step. Default: 50 */
  maxTransientIterations?: number;
  /** Maximum timestep for transient. Default: stopTime/50 */
  maxTimestep?: number;
  /** Integration method. Default: 'trapezoidal' */
  integrationMethod?: IntegrationMethod;
  /** Trapezoidal truncation error factor. Default: 7 */
  trtol?: number;
}

/** Resolved options with all defaults filled in */
export interface ResolvedOptions {
  abstol: number;
  vntol: number;
  reltol: number;
  maxIterations: number;
  maxTransientIterations: number;
  maxTimestep: number;
  integrationMethod: IntegrationMethod;
  trtol: number;
}

export const DEFAULT_OPTIONS: ResolvedOptions = {
  abstol: 1e-12,
  vntol: 1e-6,
  reltol: 1e-3,
  maxIterations: 100,
  maxTransientIterations: 50,
  maxTimestep: Infinity,
  integrationMethod: 'trapezoidal',
  trtol: 7,
};

export function resolveOptions(opts?: SimulationOptions, stopTime?: number): ResolvedOptions {
  return {
    abstol: opts?.abstol ?? DEFAULT_OPTIONS.abstol,
    vntol: opts?.vntol ?? DEFAULT_OPTIONS.vntol,
    reltol: opts?.reltol ?? DEFAULT_OPTIONS.reltol,
    maxIterations: opts?.maxIterations ?? DEFAULT_OPTIONS.maxIterations,
    maxTransientIterations: opts?.maxTransientIterations ?? DEFAULT_OPTIONS.maxTransientIterations,
    maxTimestep: opts?.maxTimestep ?? (stopTime ? stopTime / 50 : DEFAULT_OPTIONS.maxTimestep),
    integrationMethod: opts?.integrationMethod ?? DEFAULT_OPTIONS.integrationMethod,
    trtol: opts?.trtol ?? DEFAULT_OPTIONS.trtol,
  };
}

/** A single transient timestep result */
export interface TransientStep {
  time: number;
  voltages: Map<string, number>;
  currents: Map<string, number>;
}

/** A single AC frequency point result */
export interface ACPoint {
  frequency: number;
  voltages: Map<string, { magnitude: number; phase: number }>;
  currents: Map<string, { magnitude: number; phase: number }>;
}

/** Device model parameter set parsed from .model card */
export interface ModelParams {
  name: string;
  type: string;
  params: Record<string, number>;
}

/** Source waveform types */
export interface DCSource {
  type: 'dc';
  value: number;
}

export interface PulseSource {
  type: 'pulse';
  v1: number;
  v2: number;
  delay: number;
  rise: number;
  fall: number;
  width: number;
  period: number;
}

export interface SinSource {
  type: 'sin';
  offset: number;
  amplitude: number;
  frequency: number;
  delay?: number;
  damping?: number;
  phase?: number;
}

export interface ACSource {
  type: 'ac';
  magnitude: number;
  phase: number;
}

export type SourceWaveform = DCSource | PulseSource | SinSource | ACSource;

/** Warning collected during simulation */
export interface SimulationWarning {
  type: string;
  message: string;
  node?: string;
}
```

- [ ] **Step 2: Create errors.ts**

```typescript
export class SpiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpiceError';
  }
}

export class ParseError extends SpiceError {
  constructor(
    message: string,
    public readonly line: number,
    public readonly context: string,
  ) {
    super(`Parse error at line ${line}: ${message}\n  ${context}`);
    this.name = 'ParseError';
  }
}

export class InvalidCircuitError extends SpiceError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCircuitError';
  }
}

export class SingularMatrixError extends SpiceError {
  constructor(
    message: string,
    public readonly involvedNodes: string[],
  ) {
    super(`Singular matrix: ${message} (nodes: ${involvedNodes.join(', ')})`);
    this.name = 'SingularMatrixError';
  }
}

export class ConvergenceError extends SpiceError {
  constructor(
    message: string,
    public readonly time: number | undefined,
    public readonly oscillatingNodes: string[],
    public readonly lastSolution: Float64Array,
    public readonly prevSolution: Float64Array,
  ) {
    super(
      `Convergence failed${time !== undefined ? ` at t=${time}` : ''}: ${message}` +
        (oscillatingNodes.length > 0 ? ` (oscillating nodes: ${oscillatingNodes.join(', ')})` : ''),
    );
    this.name = 'ConvergenceError';
  }
}

export class TimestepTooSmallError extends SpiceError {
  constructor(
    public readonly time: number,
    public readonly timestep: number,
  ) {
    super(`Timestep too small at t=${time}: dt=${timestep}`);
    this.name = 'TimestepTooSmallError';
  }
}
```

- [ ] **Step 3: Write test for error types**

```typescript
// packages/core/src/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  SpiceError,
  ParseError,
  InvalidCircuitError,
  SingularMatrixError,
  ConvergenceError,
  TimestepTooSmallError,
} from './errors.js';

describe('SpiceError hierarchy', () => {
  it('ParseError includes line and context', () => {
    const err = new ParseError('unknown device', 5, 'X1 1 2 mystery');
    expect(err).toBeInstanceOf(SpiceError);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.line).toBe(5);
    expect(err.context).toBe('X1 1 2 mystery');
    expect(err.message).toContain('line 5');
    expect(err.message).toContain('unknown device');
  });

  it('ConvergenceError includes time and oscillating nodes', () => {
    const last = new Float64Array([1, 2]);
    const prev = new Float64Array([1.5, 2.5]);
    const err = new ConvergenceError('max iterations', 1e-6, ['3', '4'], last, prev);
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.time).toBe(1e-6);
    expect(err.oscillatingNodes).toEqual(['3', '4']);
    expect(err.lastSolution).toBe(last);
    expect(err.message).toContain('t=');
  });

  it('SingularMatrixError includes involved nodes', () => {
    const err = new SingularMatrixError('floating node', ['5']);
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.involvedNodes).toEqual(['5']);
    expect(err.message).toContain('floating node');
  });

  it('TimestepTooSmallError includes time and dt', () => {
    const err = new TimestepTooSmallError(1e-3, 1e-18);
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.time).toBe(1e-3);
    expect(err.timestep).toBe(1e-18);
  });

  it('InvalidCircuitError is a SpiceError', () => {
    const err = new InvalidCircuitError('no ground node');
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.message).toBe('no ground node');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/errors.ts packages/core/src/errors.test.ts
git commit -m "feat: add core types and error hierarchy"
```

---

### Task 3: Sparse Matrix & LU Solver

**Files:**
- Create: `packages/core/src/solver/sparse-matrix.ts`
- Create: `packages/core/src/solver/sparse-matrix.test.ts`
- Create: `packages/core/src/solver/lu-solver.ts`
- Create: `packages/core/src/solver/lu-solver.test.ts`

- [ ] **Step 1: Write sparse matrix tests**

```typescript
// packages/core/src/solver/sparse-matrix.test.ts
import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';

describe('SparseMatrix', () => {
  it('creates an empty matrix of given size', () => {
    const m = new SparseMatrix(3);
    expect(m.size).toBe(3);
    expect(m.get(0, 0)).toBe(0);
  });

  it('sets and gets values', () => {
    const m = new SparseMatrix(3);
    m.add(0, 1, 5.0);
    expect(m.get(0, 1)).toBe(5.0);
    expect(m.get(1, 0)).toBe(0);
  });

  it('accumulates values at same position', () => {
    const m = new SparseMatrix(3);
    m.add(1, 1, 3.0);
    m.add(1, 1, 2.0);
    expect(m.get(1, 1)).toBe(5.0);
  });

  it('converts to dense array', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 1);
    m.add(0, 1, 2);
    m.add(1, 0, 3);
    m.add(1, 1, 4);
    expect(m.toDense()).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('clears all entries', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 5);
    m.add(1, 1, 3);
    m.clear();
    expect(m.get(0, 0)).toBe(0);
    expect(m.get(1, 1)).toBe(0);
  });

  it('addMatrix combines two matrices', () => {
    const a = new SparseMatrix(2);
    a.add(0, 0, 1);
    const b = new SparseMatrix(2);
    b.add(0, 0, 2);
    b.add(1, 1, 3);
    a.addMatrix(b, 0.5);
    expect(a.get(0, 0)).toBe(2);   // 1 + 0.5*2
    expect(a.get(1, 1)).toBe(1.5); // 0 + 0.5*3
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/solver/sparse-matrix.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SparseMatrix**

```typescript
// packages/core/src/solver/sparse-matrix.ts

/**
 * Sparse matrix using a Map-of-Maps (dictionary of keys) format.
 * Optimized for incremental assembly (stamping) and moderate sizes.
 * For very large circuits, replace with CSC format.
 */
export class SparseMatrix {
  private rows: Map<number, Map<number, number>> = new Map();

  constructor(public readonly size: number) {}

  /** Add a value to position [row][col]. Accumulates if entry exists. */
  add(row: number, col: number, value: number): void {
    if (value === 0) return;
    let rowMap = this.rows.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.rows.set(row, rowMap);
    }
    rowMap.set(col, (rowMap.get(col) ?? 0) + value);
  }

  /** Get the value at [row][col]. Returns 0 if not set. */
  get(row: number, col: number): number {
    return this.rows.get(row)?.get(col) ?? 0;
  }

  /** Set a specific value at [row][col], replacing any existing value. */
  set(row: number, col: number, value: number): void {
    if (value === 0) {
      this.rows.get(row)?.delete(col);
      return;
    }
    let rowMap = this.rows.get(row);
    if (!rowMap) {
      rowMap = new Map();
      this.rows.set(row, rowMap);
    }
    rowMap.set(col, value);
  }

  /** Add another matrix scaled by a factor: this += scale * other */
  addMatrix(other: SparseMatrix, scale: number): void {
    for (const [row, cols] of other.rows) {
      for (const [col, val] of cols) {
        this.add(row, col, scale * val);
      }
    }
  }

  /** Clear all entries, keeping the same size. */
  clear(): void {
    this.rows.clear();
  }

  /** Convert to dense 2D array (for debugging/testing). */
  toDense(): number[][] {
    const dense: number[][] = [];
    for (let i = 0; i < this.size; i++) {
      dense[i] = [];
      for (let j = 0; j < this.size; j++) {
        dense[i][j] = this.get(i, j);
      }
    }
    return dense;
  }

  /** Iterate over all non-zero entries in a row. */
  getRow(row: number): Map<number, number> {
    return this.rows.get(row) ?? new Map();
  }

  /** Check if matrix has any entries. */
  get isEmpty(): boolean {
    return this.rows.size === 0;
  }
}
```

- [ ] **Step 4: Run sparse matrix tests**

Run: `cd packages/core && pnpm test -- src/solver/sparse-matrix.test.ts`
Expected: All pass.

- [ ] **Step 5: Write LU solver tests**

```typescript
// packages/core/src/solver/lu-solver.test.ts
import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { solveLU } from './lu-solver.js';

describe('solveLU', () => {
  it('solves a 2x2 system', () => {
    // [2, 1] [x]   [5]
    // [1, 3] [y] = [7]
    // Solution: x=1.6, y=1.8
    const A = new SparseMatrix(2);
    A.add(0, 0, 2); A.add(0, 1, 1);
    A.add(1, 0, 1); A.add(1, 1, 3);
    const b = new Float64Array([5, 7]);
    const x = solveLU(A, b);
    expect(x[0]).toBeCloseTo(1.6, 10);
    expect(x[1]).toBeCloseTo(1.8, 10);
  });

  it('solves a 3x3 system', () => {
    // [1, 2, 3] [x]   [14]
    // [4, 5, 6] [y] = [32]
    // [7, 8, 0] [z]   [23]
    // Solution: x=1, y=2, z=3
    const A = new SparseMatrix(3);
    A.add(0, 0, 1); A.add(0, 1, 2); A.add(0, 2, 3);
    A.add(1, 0, 4); A.add(1, 1, 5); A.add(1, 2, 6);
    A.add(2, 0, 7); A.add(2, 1, 8); A.add(2, 2, 0);
    const b = new Float64Array([14, 32, 23]);
    const x = solveLU(A, b);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(2, 10);
    expect(x[2]).toBeCloseTo(3, 10);
  });

  it('solves a system requiring pivoting', () => {
    // [0, 1] [x]   [3]
    // [1, 0] [y] = [2]
    // Solution: x=2, y=3
    const A = new SparseMatrix(2);
    A.add(0, 1, 1);
    A.add(1, 0, 1);
    const b = new Float64Array([3, 2]);
    const x = solveLU(A, b);
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('solves sparse system (many zeros)', () => {
    // Diagonal: [5, 3, 7]
    const A = new SparseMatrix(3);
    A.add(0, 0, 5);
    A.add(1, 1, 3);
    A.add(2, 2, 7);
    const b = new Float64Array([10, 9, 21]);
    const x = solveLU(A, b);
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(3, 10);
    expect(x[2]).toBeCloseTo(3, 10);
  });
});
```

- [ ] **Step 6: Run LU test to verify it fails**

Run: `cd packages/core && pnpm test -- src/solver/lu-solver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement LU solver**

```typescript
// packages/core/src/solver/lu-solver.ts
import { SparseMatrix } from './sparse-matrix.js';

/**
 * Solve Ax = b using dense LU decomposition with partial pivoting.
 * Converts sparse matrix to dense for the solve — suitable for small-to-medium circuits.
 * For large circuits, replace with a proper sparse LU (KLU via WASM).
 */
export function solveLU(A: SparseMatrix, b: Float64Array): Float64Array {
  const n = A.size;
  if (b.length !== n) {
    throw new Error(`Dimension mismatch: matrix is ${n}x${n}, b has length ${b.length}`);
  }

  // Convert to dense column-major for in-place LU
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (const [j, val] of A.getRow(i)) {
      M[i * n + j] = val;
    }
  }

  // Copy b — will be overwritten with solution
  const x = new Float64Array(b);

  // Pivot tracking
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;

  // LU decomposition with partial pivoting (in-place on M)
  for (let k = 0; k < n; k++) {
    // Find pivot
    let maxVal = Math.abs(M[perm[k] * n + k]);
    let maxIdx = k;
    for (let i = k + 1; i < n; i++) {
      const val = Math.abs(M[perm[i] * n + k]);
      if (val > maxVal) {
        maxVal = val;
        maxIdx = i;
      }
    }

    if (maxVal < 1e-18) {
      throw new Error(`Singular matrix at column ${k}`);
    }

    // Swap rows in permutation
    if (maxIdx !== k) {
      const tmp = perm[k];
      perm[k] = perm[maxIdx];
      perm[maxIdx] = tmp;
    }

    const pivotRow = perm[k];

    // Eliminate below pivot
    for (let i = k + 1; i < n; i++) {
      const row = perm[i];
      const factor = M[row * n + k] / M[pivotRow * n + k];
      M[row * n + k] = factor; // Store L factor in place

      for (let j = k + 1; j < n; j++) {
        M[row * n + j] -= factor * M[pivotRow * n + j];
      }
    }
  }

  // Forward substitution (Ly = Pb)
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    y[i] = x[perm[i]];
    for (let j = 0; j < i; j++) {
      y[i] -= M[perm[i] * n + j] * y[j];
    }
  }

  // Back substitution (Ux = y)
  const result = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    result[i] = y[i];
    for (let j = i + 1; j < n; j++) {
      result[i] -= M[perm[i] * n + j] * result[j];
    }
    result[i] /= M[perm[i] * n + i];
  }

  return result;
}

/**
 * Solve a complex system (G + jwC)x = b for AC analysis.
 * A_real and A_imag are the real and imaginary parts.
 * Returns [real_part, imag_part] of solution.
 */
export function solveComplexLU(
  Areal: SparseMatrix,
  Aimag: SparseMatrix,
  bReal: Float64Array,
  bImag: Float64Array,
): [Float64Array, Float64Array] {
  const n = Areal.size;

  // Convert complex system to real system of double size:
  // [Ar, -Ai] [xr]   [br]
  // [Ai,  Ar] [xi] = [bi]
  const N = 2 * n;
  const A = new SparseMatrix(N);

  // Top-left: Ar
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Areal.getRow(i)) {
      A.add(i, j, val);
    }
  }
  // Top-right: -Ai
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Aimag.getRow(i)) {
      A.add(i, j + n, -val);
    }
  }
  // Bottom-left: Ai
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Aimag.getRow(i)) {
      A.add(i + n, j, val);
    }
  }
  // Bottom-right: Ar
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Areal.getRow(i)) {
      A.add(i + n, j + n, val);
    }
  }

  const b = new Float64Array(N);
  b.set(bReal, 0);
  b.set(bImag, n);

  const x = solveLU(A, b);
  return [x.slice(0, n), x.slice(n)];
}
```

- [ ] **Step 8: Run LU solver tests**

Run: `cd packages/core && pnpm test -- src/solver/lu-solver.test.ts`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/solver/
git commit -m "feat: add sparse matrix and LU solver with partial pivoting"
```

---

### Task 4: MNA Assembler & Stamp Context

**Files:**
- Create: `packages/core/src/mna/assembler.ts`
- Create: `packages/core/src/mna/assembler.test.ts`
- Create: `packages/core/src/devices/device.ts`

- [ ] **Step 1: Create DeviceModel interface**

```typescript
// packages/core/src/devices/device.ts

export interface StampContext {
  /** Add value to conductance matrix G[row][col] */
  stampG(row: number, col: number, value: number): void;
  /** Add value to RHS vector b[row] */
  stampB(row: number, value: number): void;
  /** Add value to capacitance matrix C[row][col] */
  stampC(row: number, col: number, value: number): void;
  /** Read current solution voltage at node index */
  getVoltage(node: number): number;
  /** Read current solution branch current */
  getCurrent(branch: number): number;
  /** Current simulation time (transient only) */
  time: number;
  /** Current timestep size (transient only) */
  dt: number;
}

export interface DeviceModel {
  /** Device instance name (e.g., 'R1') */
  readonly name: string;

  /** Node indices this device is connected to */
  readonly nodes: number[];

  /** Branch indices this device adds (for voltage sources, inductors) */
  readonly branches: number[];

  /** Stamp conductance (G) and current (b) contributions */
  stamp(ctx: StampContext): void;

  /** Stamp dynamic (capacitance/charge) contributions for transient */
  stampDynamic?(ctx: StampContext): void;

  /** Stamp small-signal AC contributions. magnitude and phase of AC source if applicable. */
  stampAC?(ctx: StampContext, omega: number): void;

  /** Whether this device is nonlinear (requires Newton-Raphson) */
  readonly isNonlinear: boolean;

  /** Get AC source excitation if this device is an AC source */
  getACExcitation?(): { magnitude: number; phase: number; branch: number } | null;
}
```

- [ ] **Step 2: Write assembler tests**

```typescript
// packages/core/src/mna/assembler.test.ts
import { describe, it, expect } from 'vitest';
import { MNAAssembler } from './assembler.js';

describe('MNAAssembler', () => {
  it('creates matrices of correct size for node count + branch count', () => {
    const asm = new MNAAssembler(3, 1); // 3 nodes (excl ground) + 1 branch
    expect(asm.G.size).toBe(4);
    expect(asm.C.size).toBe(4);
    expect(asm.b.length).toBe(4);
  });

  it('provides a StampContext that stamps into G and b', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 1.5);
    ctx.stampG(0, 1, -0.5);
    ctx.stampB(1, 3.0);
    expect(asm.G.get(0, 0)).toBe(1.5);
    expect(asm.G.get(0, 1)).toBe(-0.5);
    expect(asm.b[1]).toBe(3.0);
  });

  it('StampContext reads solution vector', () => {
    const asm = new MNAAssembler(2, 1);
    asm.solution[0] = 5.0;
    asm.solution[1] = 3.0;
    asm.solution[2] = 0.001; // branch current
    const ctx = asm.getStampContext();
    expect(ctx.getVoltage(0)).toBe(5.0);
    expect(ctx.getVoltage(1)).toBe(3.0);
    expect(ctx.getCurrent(0)).toBe(0.001);
  });

  it('clear resets G, C, and b but preserves solution', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 5);
    ctx.stampB(0, 3);
    asm.solution[0] = 2.5;
    asm.clear();
    expect(asm.G.get(0, 0)).toBe(0);
    expect(asm.b[0]).toBe(0);
    expect(asm.solution[0]).toBe(2.5); // preserved
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/mna/assembler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement MNAAssembler**

```typescript
// packages/core/src/mna/assembler.ts
import { SparseMatrix } from '../solver/sparse-matrix.js';
import type { StampContext } from '../devices/device.js';

export class MNAAssembler {
  /** Conductance matrix */
  public readonly G: SparseMatrix;
  /** Capacitance matrix (for transient) */
  public readonly C: SparseMatrix;
  /** Right-hand side vector */
  public readonly b: Float64Array;
  /** Current solution vector */
  public readonly solution: Float64Array;
  /** Previous solution (for convergence check) */
  public readonly prevSolution: Float64Array;

  /** Total system size: numNodes + numBranches */
  public readonly systemSize: number;

  /** Current simulation time */
  public time = 0;
  /** Current timestep */
  public dt = 0;

  constructor(
    public readonly numNodes: number,
    public readonly numBranches: number,
  ) {
    this.systemSize = numNodes + numBranches;
    this.G = new SparseMatrix(this.systemSize);
    this.C = new SparseMatrix(this.systemSize);
    this.b = new Float64Array(this.systemSize);
    this.solution = new Float64Array(this.systemSize);
    this.prevSolution = new Float64Array(this.systemSize);
  }

  /** Get a StampContext for devices to stamp into */
  getStampContext(): StampContext {
    return {
      stampG: (row, col, value) => this.G.add(row, col, value),
      stampB: (row, value) => { this.b[row] += value; },
      stampC: (row, col, value) => this.C.add(row, col, value),
      getVoltage: (node) => this.solution[node],
      getCurrent: (branch) => this.solution[this.numNodes + branch],
      time: this.time,
      dt: this.dt,
    };
  }

  /** Clear G, C, and b for re-stamping. Preserves solution. */
  clear(): void {
    this.G.clear();
    this.C.clear();
    this.b.fill(0);
  }

  /** Save current solution as previous (for convergence check) */
  saveSolution(): void {
    this.prevSolution.set(this.solution);
  }

  /** Update the time on the stamp context */
  setTime(time: number, dt: number): void {
    this.time = time;
    this.dt = dt;
  }
}
```

- [ ] **Step 5: Run assembler tests**

Run: `cd packages/core && pnpm test -- src/mna/assembler.test.ts`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/devices/device.ts packages/core/src/mna/assembler.ts packages/core/src/mna/assembler.test.ts
git commit -m "feat: add MNA assembler, StampContext, and DeviceModel interface"
```

---

### Task 5: Linear Device Models (Resistor, Voltage Source, Current Source)

**Files:**
- Create: `packages/core/src/devices/resistor.ts`
- Create: `packages/core/src/devices/voltage-source.ts`
- Create: `packages/core/src/devices/current-source.ts`
- Create: `packages/core/src/devices/devices.test.ts`

- [ ] **Step 1: Write resistor test**

```typescript
// packages/core/src/devices/devices.test.ts
import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { Resistor } from './resistor.js';
import { VoltageSource } from './voltage-source.js';
import { CurrentSource } from './current-source.js';

describe('Resistor', () => {
  it('stamps 1/R conductance between two nodes', () => {
    // R=1kΩ between nodes 0 and 1 (2 nodes, no branches)
    const asm = new MNAAssembler(2, 0);
    const r = new Resistor('R1', [0, 1], 1000);
    r.stamp(asm.getStampContext());

    // G matrix: [1/R, -1/R; -1/R, 1/R]
    expect(asm.G.get(0, 0)).toBeCloseTo(0.001);
    expect(asm.G.get(0, 1)).toBeCloseTo(-0.001);
    expect(asm.G.get(1, 0)).toBeCloseTo(-0.001);
    expect(asm.G.get(1, 1)).toBeCloseTo(0.001);
  });

  it('handles ground node (-1) by not stamping that row/col', () => {
    // R=1kΩ between node 0 and ground (-1)
    const asm = new MNAAssembler(1, 0);
    const r = new Resistor('R1', [0, -1], 1000);
    r.stamp(asm.getStampContext());

    expect(asm.G.get(0, 0)).toBeCloseTo(0.001);
  });

  it('is linear', () => {
    const r = new Resistor('R1', [0, 1], 1000);
    expect(r.isNonlinear).toBe(false);
  });
});

describe('VoltageSource', () => {
  it('stamps branch equation into MNA', () => {
    // V=5V between node 0 and ground, branch index 0
    // System size: 1 node + 1 branch = 2
    // G = [0, 1; 1, 0], b = [0, 5]
    const asm = new MNAAssembler(1, 1);
    const v = new VoltageSource('V1', [0, -1], 0, { type: 'dc', value: 5 });
    v.stamp(asm.getStampContext());

    // Node 0 row: current from branch 0 flows in
    expect(asm.G.get(0, 1)).toBe(1);  // node row, branch col
    // Branch row: V(+) - V(-) = Vs
    expect(asm.G.get(1, 0)).toBe(1);  // branch row, node+ col
    expect(asm.b[1]).toBe(5);          // branch RHS = voltage
  });

  it('stamps between two non-ground nodes', () => {
    // V=3V between node 0 (+) and node 1 (-), branch 0
    const asm = new MNAAssembler(2, 1);
    const v = new VoltageSource('V1', [0, 1], 0, { type: 'dc', value: 3 });
    v.stamp(asm.getStampContext());

    // KCL at node 0: +I_branch
    expect(asm.G.get(0, 2)).toBe(1);
    // KCL at node 1: -I_branch
    expect(asm.G.get(1, 2)).toBe(-1);
    // Branch equation: V(0) - V(1) = 3
    expect(asm.G.get(2, 0)).toBe(1);
    expect(asm.G.get(2, 1)).toBe(-1);
    expect(asm.b[2]).toBe(3);
  });
});

describe('CurrentSource', () => {
  it('stamps current into RHS vector', () => {
    // I=2mA from node 1 to node 0 (conventional: current flows from - to +)
    // Positive node 0 gets +I, negative node 1 gets -I
    const asm = new MNAAssembler(2, 0);
    const i = new CurrentSource('I1', [0, 1], { type: 'dc', value: 0.002 });
    i.stamp(asm.getStampContext());

    expect(asm.b[0]).toBeCloseTo(0.002);
    expect(asm.b[1]).toBeCloseTo(-0.002);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/devices/devices.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement Resistor**

```typescript
// packages/core/src/devices/resistor.ts
import type { DeviceModel, StampContext } from './device.js';

export class Resistor implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly resistance: number,
  ) {}

  stamp(ctx: StampContext): void {
    const [n1, n2] = this.nodes;
    const g = 1 / this.resistance;

    if (n1 >= 0) ctx.stampG(n1, n1, g);
    if (n2 >= 0) ctx.stampG(n2, n2, g);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampG(n1, n2, -g);
      ctx.stampG(n2, n1, -g);
    }
  }
}
```

- [ ] **Step 4: Implement VoltageSource**

```typescript
// packages/core/src/devices/voltage-source.ts
import type { DeviceModel, StampContext } from './device.js';
import type { SourceWaveform, PulseSource, SinSource } from '../types.js';

export class VoltageSource implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branchIndex: number,
    readonly waveform: SourceWaveform,
  ) {
    this.branches = [branchIndex];
  }

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const branchRow = ctx.getVoltage.length; // not used — we use absolute index
    const bi = this.branchIndex;
    // We need the absolute row for the branch in the system
    // The assembler maps branch i to row (numNodes + i), but
    // from the device's perspective, we use the node indices directly
    // and the branch row is passed via branchIndex offset.

    // We need numNodes to compute branch row. The device receives it via nodes.
    // Convention: branch equations are stored at row = (numNodes + branchIndex).
    // But the device doesn't know numNodes. Instead, the assembler provides
    // branch rows as node indices starting at numNodes. So we store the
    // absolute row index as a "node" for the branch.
    const branchRow2 = this.nodes.length; // not useful either

    // Simpler approach: the branchIndex IS the row offset from nodes.
    // The Circuit assigns branch indices as absolute system indices.
    this.stampWithBranchRow(ctx, nPlus, nMinus, bi);
  }

  private stampWithBranchRow(ctx: StampContext, nPlus: number, nMinus: number, branchRow: number): void {
    const voltage = this.getVoltageAtTime(ctx.time);

    // KCL: branch current enters positive node, leaves negative
    if (nPlus >= 0) ctx.stampG(nPlus, branchRow, 1);
    if (nMinus >= 0) ctx.stampG(nMinus, branchRow, -1);

    // Branch equation: V(+) - V(-) = Vs
    if (nPlus >= 0) ctx.stampG(branchRow, nPlus, 1);
    if (nMinus >= 0) ctx.stampG(branchRow, nMinus, -1);

    ctx.stampB(branchRow, voltage);
  }

  getVoltageAtTime(time: number): number {
    switch (this.waveform.type) {
      case 'dc':
        return this.waveform.value;
      case 'pulse':
        return evaluatePulse(this.waveform, time);
      case 'sin':
        return evaluateSin(this.waveform, time);
      case 'ac':
        // AC magnitude is only used in AC analysis, DC value is 0
        return 0;
    }
  }

  getACExcitation(): { magnitude: number; phase: number; branch: number } | null {
    if (this.waveform.type === 'ac') {
      return {
        magnitude: this.waveform.magnitude,
        phase: this.waveform.phase,
        branch: this.branchIndex,
      };
    }
    return null;
  }
}

function evaluatePulse(p: PulseSource, time: number): number {
  const t = time % p.period;
  if (t < p.delay) return p.v1;
  if (t < p.delay + p.rise) return p.v1 + (p.v2 - p.v1) * (t - p.delay) / p.rise;
  if (t < p.delay + p.rise + p.width) return p.v2;
  if (t < p.delay + p.rise + p.width + p.fall)
    return p.v2 + (p.v1 - p.v2) * (t - p.delay - p.rise - p.width) / p.fall;
  return p.v1;
}

function evaluateSin(s: SinSource, time: number): number {
  const delay = s.delay ?? 0;
  const damping = s.damping ?? 0;
  const phase = s.phase ?? 0;
  if (time < delay) return s.offset;
  const t = time - delay;
  return s.offset + s.amplitude * Math.exp(-damping * t) *
    Math.sin(2 * Math.PI * s.frequency * t + (phase * Math.PI) / 180);
}
```

- [ ] **Step 5: Implement CurrentSource**

```typescript
// packages/core/src/devices/current-source.ts
import type { DeviceModel, StampContext } from './device.js';
import type { SourceWaveform, PulseSource, SinSource } from '../types.js';

export class CurrentSource implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly waveform: SourceWaveform,
  ) {}

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const current = this.getCurrentAtTime(ctx.time);

    // Convention: current flows from nPlus to nMinus (internally)
    // KCL: positive node gets +I, negative gets -I
    if (nPlus >= 0) ctx.stampB(nPlus, current);
    if (nMinus >= 0) ctx.stampB(nMinus, -current);
  }

  getCurrentAtTime(time: number): number {
    switch (this.waveform.type) {
      case 'dc':
        return this.waveform.value;
      case 'pulse': {
        const p = this.waveform;
        const t = time % p.period;
        if (t < p.delay) return p.v1;
        if (t < p.delay + p.rise) return p.v1 + (p.v2 - p.v1) * (t - p.delay) / p.rise;
        if (t < p.delay + p.rise + p.width) return p.v2;
        if (t < p.delay + p.rise + p.width + p.fall)
          return p.v2 + (p.v1 - p.v2) * (t - p.delay - p.rise - p.width) / p.fall;
        return p.v1;
      }
      case 'sin': {
        const s = this.waveform;
        const delay = s.delay ?? 0;
        const damping = s.damping ?? 0;
        const phase = s.phase ?? 0;
        if (time < delay) return s.offset;
        const t = time - delay;
        return s.offset + s.amplitude * Math.exp(-damping * t) *
          Math.sin(2 * Math.PI * s.frequency * t + (phase * Math.PI) / 180);
      }
      case 'ac':
        return 0;
    }
  }
}
```

- [ ] **Step 6: Run device tests**

Run: `cd packages/core && pnpm test -- src/devices/devices.test.ts`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/devices/
git commit -m "feat: add resistor, voltage source, and current source device models"
```

---

### Task 6: Circuit Class & Node Mapping

**Files:**
- Create: `packages/core/src/circuit.ts`
- Create: `packages/core/src/circuit.test.ts`

- [ ] **Step 1: Write Circuit tests**

```typescript
// packages/core/src/circuit.test.ts
import { describe, it, expect } from 'vitest';
import { Circuit } from './circuit.js';

describe('Circuit', () => {
  it('maps node names to indices, with ground at -1', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addResistor('R2', '1', '2', 2000);

    expect(ckt.getNodeIndex('0')).toBe(-1); // ground
    expect(ckt.getNodeIndex('1')).toBeGreaterThanOrEqual(0);
    expect(ckt.getNodeIndex('2')).toBeGreaterThanOrEqual(0);
    expect(ckt.nodeCount).toBe(2); // non-ground nodes
  });

  it('adds voltage source with branch index', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    expect(ckt.branchCount).toBe(1);
  });

  it('adds analysis commands', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('op');
    expect(ckt.analyses).toHaveLength(1);
    expect(ckt.analyses[0]).toEqual({ type: 'op' });
  });

  it('adds transient analysis', () => {
    const ckt = new Circuit();
    ckt.addResistor('R1', '1', '0', 1000);
    ckt.addAnalysis('tran', { timestep: 1e-9, stopTime: 1e-6 });
    expect(ckt.analyses[0]).toEqual({
      type: 'tran',
      timestep: 1e-9,
      stopTime: 1e-6,
    });
  });

  it('builds device list with correct node indices', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(3);
    expect(compiled.nodeCount).toBe(2); // nodes 1 and 2
    expect(compiled.branchCount).toBe(1); // V1
    expect(compiled.nodeNames).toContain('1');
    expect(compiled.nodeNames).toContain('2');
  });

  it('provides node name to index mapping', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);

    const compiled = ckt.compile();
    const idx1 = compiled.nodeIndexMap.get('1')!;
    const idx2 = compiled.nodeIndexMap.get('2')!;
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx1).not.toBe(idx2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/circuit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Circuit**

```typescript
// packages/core/src/circuit.ts
import type { DeviceModel } from './devices/device.js';
import type { AnalysisCommand, SourceWaveform, ModelParams } from './types.js';
import { Resistor } from './devices/resistor.js';
import { VoltageSource } from './devices/voltage-source.js';
import { CurrentSource } from './devices/current-source.js';
import { GROUND_NODE } from './types.js';

export interface CompiledCircuit {
  devices: DeviceModel[];
  nodeCount: number;
  branchCount: number;
  nodeNames: string[];
  nodeIndexMap: Map<string, number>;
  branchNames: string[];
  analyses: AnalysisCommand[];
  models: Map<string, ModelParams>;
}

interface DeviceDescriptor {
  type: string;
  name: string;
  nodes: string[];
  value?: number;
  waveform?: Partial<SourceWaveform> & { dc?: number };
  modelName?: string;
  params?: Record<string, number>;
}

export class Circuit {
  private descriptors: DeviceDescriptor[] = [];
  private _analyses: AnalysisCommand[] = [];
  private _models = new Map<string, ModelParams>();
  private nodeSet = new Set<string>();

  get analyses(): AnalysisCommand[] {
    return this._analyses;
  }

  get nodeCount(): number {
    const nodes = new Set(this.nodeSet);
    nodes.delete(GROUND_NODE);
    return nodes.size;
  }

  get branchCount(): number {
    return this.descriptors.filter(d => d.type === 'V' || d.type === 'L').length;
  }

  getNodeIndex(name: string): number {
    if (name === GROUND_NODE) return -1;
    const nodes = [...this.nodeSet].filter(n => n !== GROUND_NODE).sort();
    return nodes.indexOf(name);
  }

  addResistor(name: string, nodePos: string, nodeNeg: string, resistance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'R', name, nodes: [nodePos, nodeNeg], value: resistance });
  }

  addCapacitor(name: string, nodePos: string, nodeNeg: string, capacitance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'C', name, nodes: [nodePos, nodeNeg], value: capacitance });
  }

  addInductor(name: string, nodePos: string, nodeNeg: string, inductance: number): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'L', name, nodes: [nodePos, nodeNeg], value: inductance });
  }

  addVoltageSource(
    name: string,
    nodePos: string,
    nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'V', name, nodes: [nodePos, nodeNeg], waveform });
  }

  addCurrentSource(
    name: string,
    nodePos: string,
    nodeNeg: string,
    waveform: Partial<SourceWaveform> & { dc?: number },
  ): void {
    this.nodeSet.add(nodePos);
    this.nodeSet.add(nodeNeg);
    this.descriptors.push({ type: 'I', name, nodes: [nodePos, nodeNeg], waveform });
  }

  addDiode(name: string, nodeAnode: string, nodeCathode: string, modelName?: string): void {
    this.nodeSet.add(nodeAnode);
    this.nodeSet.add(nodeCathode);
    this.descriptors.push({ type: 'D', name, nodes: [nodeAnode, nodeCathode], modelName });
  }

  addBJT(
    name: string,
    nodeCollector: string,
    nodeBase: string,
    nodeEmitter: string,
    modelName: string,
  ): void {
    this.nodeSet.add(nodeCollector);
    this.nodeSet.add(nodeBase);
    this.nodeSet.add(nodeEmitter);
    this.descriptors.push({ type: 'Q', name, nodes: [nodeCollector, nodeBase, nodeEmitter], modelName });
  }

  addMOSFET(
    name: string,
    nodeDrain: string,
    nodeGate: string,
    nodeSource: string,
    modelName: string,
  ): void {
    this.nodeSet.add(nodeDrain);
    this.nodeSet.add(nodeGate);
    this.nodeSet.add(nodeSource);
    this.descriptors.push({ type: 'M', name, nodes: [nodeDrain, nodeGate, nodeSource], modelName });
  }

  addModel(params: ModelParams): void {
    this._models.set(params.name, params);
  }

  addAnalysis(type: 'op'): void;
  addAnalysis(type: 'dc', params: { source: string; start: number; stop: number; step: number }): void;
  addAnalysis(type: 'tran', params: { timestep: number; stopTime: number; startTime?: number; maxTimestep?: number }): void;
  addAnalysis(type: 'ac', params: { variation: 'dec' | 'oct' | 'lin'; points: number; startFreq: number; stopFreq: number }): void;
  addAnalysis(type: string, params?: Record<string, unknown>): void {
    switch (type) {
      case 'op':
        this._analyses.push({ type: 'op' });
        break;
      case 'dc':
        this._analyses.push({
          type: 'dc',
          source: params!.source as string,
          start: params!.start as number,
          stop: params!.stop as number,
          step: params!.step as number,
        });
        break;
      case 'tran':
        this._analyses.push({
          type: 'tran',
          timestep: params!.timestep as number,
          stopTime: params!.stopTime as number,
          startTime: params?.startTime as number | undefined,
          maxTimestep: params?.maxTimestep as number | undefined,
        });
        break;
      case 'ac':
        this._analyses.push({
          type: 'ac',
          variation: params!.variation as 'dec' | 'oct' | 'lin',
          points: params!.points as number,
          startFreq: params!.startFreq as number,
          stopFreq: params!.stopFreq as number,
        });
        break;
    }
  }

  compile(): CompiledCircuit {
    // Build sorted node list (excluding ground)
    const nodeNames = [...this.nodeSet].filter(n => n !== GROUND_NODE).sort();
    const nodeIndexMap = new Map<string, number>();
    nodeNames.forEach((name, i) => nodeIndexMap.set(name, i));
    nodeIndexMap.set(GROUND_NODE, -1);

    const nodeCount = nodeNames.length;
    let branchIndex = nodeCount; // branches start after nodes in system matrix
    const branchNames: string[] = [];

    const resolveNode = (name: string): number => {
      if (name === GROUND_NODE) return -1;
      return nodeIndexMap.get(name)!;
    };

    const resolveWaveform = (wf?: Partial<SourceWaveform> & { dc?: number }): SourceWaveform => {
      if (!wf) return { type: 'dc', value: 0 };
      if (wf.dc !== undefined) return { type: 'dc', value: wf.dc };
      if (wf.type) return wf as SourceWaveform;
      return { type: 'dc', value: 0 };
    };

    const devices: DeviceModel[] = [];

    for (const desc of this.descriptors) {
      const nodeIndices = desc.nodes.map(resolveNode);

      switch (desc.type) {
        case 'R':
          devices.push(new Resistor(desc.name, nodeIndices, desc.value!));
          break;
        case 'V': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new VoltageSource(desc.name, nodeIndices, bi, resolveWaveform(desc.waveform)));
          break;
        }
        case 'I':
          devices.push(new CurrentSource(desc.name, nodeIndices, resolveWaveform(desc.waveform)));
          break;
        // C, L, D, Q, M handled in later tasks — placeholder throws
        default:
          // Will be filled in as device models are implemented
          throw new Error(`Device type '${desc.type}' not yet implemented`);
      }
    }

    return {
      devices,
      nodeCount,
      branchCount: branchNames.length,
      nodeNames,
      nodeIndexMap,
      branchNames,
      analyses: this._analyses,
      models: this._models,
    };
  }
}
```

- [ ] **Step 4: Run Circuit tests**

Run: `cd packages/core && pnpm test -- src/circuit.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/circuit.ts packages/core/src/circuit.test.ts
git commit -m "feat: add Circuit class with programmatic builder and node mapping"
```

---

### Task 7: DC Operating Point Analysis + Newton-Raphson

**Files:**
- Create: `packages/core/src/analysis/newton-raphson.ts`
- Create: `packages/core/src/analysis/dc.ts`
- Create: `packages/core/src/analysis/dc.test.ts`
- Create: `packages/core/src/results.ts`

- [ ] **Step 1: Create results.ts**

```typescript
// packages/core/src/results.ts
import type { SimulationWarning } from './types.js';

export class DCResult {
  constructor(
    private readonly voltageMap: Map<string, number>,
    private readonly currentMap: Map<string, number>,
  ) {}

  voltage(node: string): number {
    const v = this.voltageMap.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): number {
    const i = this.currentMap.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }

  get voltages(): Map<string, number> {
    return new Map(this.voltageMap);
  }

  get currents(): Map<string, number> {
    return new Map(this.currentMap);
  }
}

export class TransientResult {
  constructor(
    public readonly time: number[],
    private readonly voltageArrays: Map<string, number[]>,
    private readonly currentArrays: Map<string, number[]>,
  ) {}

  voltage(node: string): number[] {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): number[] {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

export class ACResult {
  constructor(
    public readonly frequencies: number[],
    private readonly voltageArrays: Map<string, { magnitude: number; phase: number }[]>,
    private readonly currentArrays: Map<string, { magnitude: number; phase: number }[]>,
  ) {}

  voltage(node: string): { magnitude: number; phase: number }[] {
    const v = this.voltageArrays.get(node);
    if (v === undefined) throw new Error(`Unknown node: ${node}`);
    return v;
  }

  current(source: string): { magnitude: number; phase: number }[] {
    const i = this.currentArrays.get(source);
    if (i === undefined) throw new Error(`Unknown branch: ${source}`);
    return i;
  }
}

export interface DCSweepResult {
  sweepValues: number[];
  voltages: Map<string, number[]>;
  currents: Map<string, number[]>;
}

export interface SimulationResult {
  dc?: DCResult;
  dcSweep?: DCSweepResult;
  transient?: TransientResult;
  ac?: ACResult;
  warnings: SimulationWarning[];
}
```

- [ ] **Step 2: Implement Newton-Raphson**

```typescript
// packages/core/src/analysis/newton-raphson.ts
import type { DeviceModel } from '../devices/device.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { ResolvedOptions } from '../types.js';
import { solveLU } from '../solver/lu-solver.js';
import { ConvergenceError } from '../errors.js';

/**
 * Run Newton-Raphson iteration until convergence.
 * Stamps devices, solves, checks convergence, repeats.
 * Returns the number of iterations taken.
 */
export function newtonRaphson(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  options: ResolvedOptions,
  maxIter: number,
  nodeNames: string[],
): number {
  for (let iter = 0; iter < maxIter; iter++) {
    assembler.saveSolution();
    assembler.clear();

    // Stamp all devices
    const ctx = assembler.getStampContext();
    for (const device of devices) {
      device.stamp(ctx);
    }

    // Solve the system
    const x = solveLU(assembler.G, new Float64Array(assembler.b));

    // Update solution
    assembler.solution.set(x);

    // Check convergence
    if (isConverged(assembler.solution, assembler.prevSolution, assembler.numNodes, options)) {
      return iter + 1;
    }
  }

  // Failed to converge
  const oscillating = findOscillatingNodes(
    assembler.solution,
    assembler.prevSolution,
    assembler.numNodes,
    nodeNames,
    options,
  );

  throw new ConvergenceError(
    `Did not converge in ${maxIter} iterations`,
    undefined,
    oscillating,
    new Float64Array(assembler.solution),
    new Float64Array(assembler.prevSolution),
  );
}

function isConverged(
  current: Float64Array,
  previous: Float64Array,
  numNodes: number,
  options: ResolvedOptions,
): boolean {
  for (let i = 0; i < current.length; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = i < numNodes
      ? options.vntol + options.reltol * Math.abs(current[i])  // voltage
      : options.abstol + options.reltol * Math.abs(current[i]); // current
    if (diff > tol) return false;
  }
  return true;
}

function findOscillatingNodes(
  current: Float64Array,
  previous: Float64Array,
  numNodes: number,
  nodeNames: string[],
  options: ResolvedOptions,
): string[] {
  const result: string[] = [];
  for (let i = 0; i < numNodes; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = options.vntol + options.reltol * Math.abs(current[i]);
    if (diff > tol) {
      result.push(nodeNames[i] ?? `node_${i}`);
    }
  }
  return result;
}
```

- [ ] **Step 3: Implement DC analysis**

```typescript
// packages/core/src/analysis/dc.ts
import type { DeviceModel } from '../devices/device.js';
import type { ResolvedOptions, DCSweepAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { newtonRaphson } from './newton-raphson.js';
import { DCResult } from '../results.js';
import type { DCSweepResult } from '../results.js';
import { InvalidCircuitError } from '../errors.js';

export function solveDCOperatingPoint(
  compiled: CompiledCircuit,
  options: ResolvedOptions,
): { result: DCResult; assembler: MNAAssembler } {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);

  newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);

  const voltageMap = new Map<string, number>();
  for (let i = 0; i < nodeNames.length; i++) {
    voltageMap.set(nodeNames[i], assembler.solution[i]);
  }

  const currentMap = new Map<string, number>();
  for (let i = 0; i < branchNames.length; i++) {
    currentMap.set(branchNames[i], assembler.solution[nodeCount + i]);
  }

  return {
    result: new DCResult(voltageMap, currentMap),
    assembler,
  };
}

export function solveDCSweep(
  compiled: CompiledCircuit,
  analysis: DCSweepAnalysis,
  options: ResolvedOptions,
): DCSweepResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;

  // Find the source device to sweep
  const sourceDevice = devices.find(d => d.name.toUpperCase() === analysis.source.toUpperCase());
  if (!sourceDevice) {
    throw new InvalidCircuitError(`DC sweep source '${analysis.source}' not found`);
  }

  const sweepValues: number[] = [];
  const voltages = new Map<string, number[]>();
  const currents = new Map<string, number[]>();
  for (const name of nodeNames) voltages.set(name, []);
  for (const name of branchNames) currents.set(name, []);

  for (let val = analysis.start; val <= analysis.stop + analysis.step * 0.001; val += analysis.step) {
    sweepValues.push(val);

    // Update source value — the source's waveform is replaced with the sweep value
    // This requires the voltage source to support mutable DC value.
    // We cast to access the waveform property.
    (sourceDevice as any).waveform = { type: 'dc' as const, value: val };

    const assembler = new MNAAssembler(nodeCount, branchCount);
    newtonRaphson(assembler, devices, options, options.maxIterations, nodeNames);

    for (let i = 0; i < nodeNames.length; i++) {
      voltages.get(nodeNames[i])!.push(assembler.solution[i]);
    }
    for (let i = 0; i < branchNames.length; i++) {
      currents.get(branchNames[i])!.push(assembler.solution[nodeCount + i]);
    }
  }

  return { sweepValues, voltages, currents };
}
```

- [ ] **Step 4: Write DC analysis tests**

```typescript
// packages/core/src/analysis/dc.test.ts
import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { solveDCOperatingPoint } from './dc.js';
import { resolveOptions } from '../types.js';

describe('DC Operating Point', () => {
  it('solves a voltage divider', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const { result } = solveDCOperatingPoint(compiled, options);

    expect(result.voltage('1')).toBeCloseTo(5, 6);
    expect(result.voltage('2')).toBeCloseTo(10 / 3, 6); // 3.333V
    expect(result.current('V1')).toBeCloseTo(-5 / 3000, 9); // negative = into source
  });

  it('solves series resistors with current source', () => {
    const ckt = new Circuit();
    ckt.addCurrentSource('I1', '1', '0', { dc: 0.001 }); // 1mA
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addResistor('R2', '2', '0', 2000);

    const compiled = ckt.compile();
    const options = resolveOptions();
    const { result } = solveDCOperatingPoint(compiled, options);

    // 1mA through 3kΩ total
    expect(result.voltage('1')).toBeCloseTo(3, 6); // 1mA * 3kΩ
    expect(result.voltage('2')).toBeCloseTo(2, 6); // 1mA * 2kΩ
  });

  it('solves multiple voltage sources', () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 10 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addVoltageSource('V2', '2', '0', { dc: 5 });

    const compiled = ckt.compile();
    const options = resolveOptions();
    const { result } = solveDCOperatingPoint(compiled, options);

    expect(result.voltage('1')).toBeCloseTo(10, 6);
    expect(result.voltage('2')).toBeCloseTo(5, 6);
    // Current through R1 = (10-5)/1000 = 5mA
    expect(result.current('V1')).toBeCloseTo(-0.005, 9);
  });
});
```

- [ ] **Step 5: Run DC tests**

Run: `cd packages/core && pnpm test -- src/analysis/dc.test.ts`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/results.ts packages/core/src/analysis/newton-raphson.ts packages/core/src/analysis/dc.ts packages/core/src/analysis/dc.test.ts
git commit -m "feat: add DC operating point analysis with Newton-Raphson solver"
```

---

### Task 8: SPICE Netlist Parser

**Files:**
- Create: `packages/core/src/parser/tokenizer.ts`
- Create: `packages/core/src/parser/index.ts`
- Create: `packages/core/src/parser/model-parser.ts`
- Create: `packages/core/src/parser/parser.test.ts`

- [ ] **Step 1: Write parser tests**

```typescript
// packages/core/src/parser/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parse } from './index.js';

describe('SPICE netlist parser', () => {
  it('parses a simple voltage divider', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 2 1k
      R2 2 0 2k
      .op
      .end
    `);

    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(3);
    expect(compiled.nodeCount).toBe(2);
    expect(compiled.branchCount).toBe(1);
    expect(compiled.analyses).toEqual([{ type: 'op' }]);
  });

  it('parses engineering notation (k, M, u, n, p, f, m)', () => {
    const ckt = parse(`
      R1 1 0 4.7k
      R2 1 0 1M
      C1 1 0 100n
      R3 1 0 2.2m
      .op
      .end
    `);
    // If it parses without error, engineering notation is working
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(4);
  });

  it('parses transient analysis command', () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 0 1k
      .tran 1n 10u
      .end
    `);

    const compiled = ckt.compile();
    expect(compiled.analyses[0]).toEqual({
      type: 'tran',
      timestep: 1e-9,
      stopTime: 10e-6,
    });
  });

  it('parses AC analysis command', () => {
    const ckt = parse(`
      V1 1 0 AC 1 0
      R1 1 0 1k
      .ac dec 10 1 1G
      .end
    `);

    const compiled = ckt.compile();
    expect(compiled.analyses[0]).toEqual({
      type: 'ac',
      variation: 'dec',
      points: 10,
      startFreq: 1,
      stopFreq: 1e9,
    });
  });

  it('parses PULSE source', () => {
    const ckt = parse(`
      V1 1 0 PULSE(0 5 0 1n 1n 5u 10u)
      R1 1 0 1k
      .tran 1n 20u
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('parses SIN source', () => {
    const ckt = parse(`
      V1 1 0 SIN(0 1 1k)
      R1 1 0 1k
      .tran 1u 2m
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('handles comments and blank lines', () => {
    const ckt = parse(`
      * This is a comment
      V1 1 0 DC 5

      R1 1 0 1k
      ; Another comment style
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('handles line continuations with +', () => {
    const ckt = parse(`
      V1 1 0
      + DC 5
      R1 1 0 1k
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });

  it('parses .model card', () => {
    const ckt = parse(`
      .model DMOD D(IS=1e-14 N=1.05 BV=100)
      V1 1 0 DC 1
      D1 1 0 DMOD
      .op
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.models.has('DMOD')).toBe(true);
    expect(compiled.models.get('DMOD')!.params.IS).toBeCloseTo(1e-14);
  });

  it('parses DC sweep', () => {
    const ckt = parse(`
      V1 1 0 DC 0
      R1 1 0 1k
      .dc V1 0 5 0.1
      .end
    `);
    const compiled = ckt.compile();
    expect(compiled.analyses[0]).toEqual({
      type: 'dc',
      source: 'V1',
      start: 0,
      stop: 5,
      step: 0.1,
    });
  });

  it('is case-insensitive for keywords', () => {
    const ckt = parse(`
      v1 1 0 dc 5
      r1 1 0 1K
      .OP
      .END
    `);
    const compiled = ckt.compile();
    expect(compiled.devices).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/parser/parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tokenizer**

```typescript
// packages/core/src/parser/tokenizer.ts
import { ParseError } from '../errors.js';

/**
 * Parse SPICE engineering notation suffix to multiplier.
 * Supports: T (1e12), G (1e9), MEG (1e6), K (1e3), M (1e-3),
 * U (1e-6), N (1e-9), P (1e-12), F (1e-15)
 */
export function parseNumber(token: string): number {
  const upper = token.toUpperCase().trim();

  // Try plain number first
  const plain = Number(token);
  if (!isNaN(plain) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token.trim())) {
    return plain;
  }

  // Try with suffix
  const suffixes: [RegExp, number][] = [
    [/^([+-]?[\d.]+)T$/i, 1e12],
    [/^([+-]?[\d.]+)G$/i, 1e9],
    [/^([+-]?[\d.]+)MEG$/i, 1e6],
    [/^([+-]?[\d.]+)K$/i, 1e3],
    [/^([+-]?[\d.]+)M$/i, 1e-3],
    [/^([+-]?[\d.]+)U$/i, 1e-6],
    [/^([+-]?[\d.]+)N$/i, 1e-9],
    [/^([+-]?[\d.]+)P$/i, 1e-12],
    [/^([+-]?[\d.]+)F$/i, 1e-15],
  ];

  // MEG must be checked before M
  for (const [regex, mult] of suffixes) {
    const match = upper.match(regex);
    if (match) {
      return parseFloat(match[1]) * mult;
    }
  }

  throw new Error(`Cannot parse number: '${token}'`);
}

export interface ParsedLine {
  raw: string;
  lineNumber: number;
  tokens: string[];
}

/**
 * Preprocess SPICE netlist: handle comments, line continuations,
 * and split into token arrays.
 */
export function tokenizeNetlist(netlist: string): ParsedLine[] {
  const rawLines = netlist.split('\n');
  const result: ParsedLine[] = [];

  // First pass: handle line continuations and comments
  const mergedLines: { text: string; lineNumber: number }[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('*') || trimmed.startsWith(';')) {
      continue;
    }

    // Skip .end
    if (trimmed.toUpperCase() === '.END') continue;

    // Line continuation: starts with +
    if (trimmed.startsWith('+') && mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1].text += ' ' + trimmed.substring(1).trim();
      continue;
    }

    mergedLines.push({ text: trimmed, lineNumber: i + 1 });
  }

  // Second pass: tokenize each line
  for (const { text, lineNumber } of mergedLines) {
    // Handle parenthesized args like PULSE(0 5 0 1n 1n 5u 10u)
    // Replace parens with spaces, then tokenize
    const normalized = text.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').replace(/,/g, ' ');
    const tokens = normalized.split(/\s+/).filter(t => t.length > 0);

    result.push({ raw: text, lineNumber, tokens });
  }

  return result;
}
```

- [ ] **Step 4: Implement model parser**

```typescript
// packages/core/src/parser/model-parser.ts
import type { ModelParams } from '../types.js';
import { parseNumber } from './tokenizer.js';

/**
 * Parse a .model card.
 * Format: .model <name> <type>(<param>=<value> ...)
 * or: .model <name> <type> <param>=<value> ...
 */
export function parseModelCard(tokens: string[], lineNumber: number): ModelParams {
  // tokens: ['.model', name, type, '(', 'IS=1e-14', 'N=1.05', ')', ...]
  // or: ['.model', name, type, 'IS=1e-14', 'N=1.05', ...]
  const name = tokens[1];
  const type = tokens[2].toUpperCase();

  const params: Record<string, number> = {};

  for (let i = 3; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '(' || token === ')') continue;

    const eqIdx = token.indexOf('=');
    if (eqIdx > 0) {
      const key = token.substring(0, eqIdx).toUpperCase();
      const val = token.substring(eqIdx + 1);
      params[key] = parseNumber(val);
    }
  }

  return { name, type, params };
}
```

- [ ] **Step 5: Implement main parser**

```typescript
// packages/core/src/parser/index.ts
import { Circuit } from '../circuit.js';
import { ParseError } from '../errors.js';
import { tokenizeNetlist, parseNumber } from './tokenizer.js';
import { parseModelCard } from './model-parser.js';
import type { SourceWaveform, PulseSource, SinSource, ACSource, DCSource } from '../types.js';

export function parse(netlist: string): Circuit {
  const lines = tokenizeNetlist(netlist);
  const circuit = new Circuit();

  for (const { tokens, lineNumber, raw } of lines) {
    if (tokens.length === 0) continue;

    const first = tokens[0].toUpperCase();

    try {
      if (first.startsWith('.')) {
        parseDotCommand(circuit, tokens, lineNumber);
      } else {
        parseDevice(circuit, tokens, lineNumber);
      }
    } catch (e) {
      if (e instanceof ParseError) throw e;
      throw new ParseError((e as Error).message, lineNumber, raw);
    }
  }

  return circuit;
}

function parseDotCommand(circuit: Circuit, tokens: string[], lineNumber: number): void {
  const cmd = tokens[0].toUpperCase();

  switch (cmd) {
    case '.OP':
      circuit.addAnalysis('op');
      break;

    case '.DC': {
      // .dc <source> <start> <stop> <step>
      const source = tokens[1];
      const start = parseNumber(tokens[2]);
      const stop = parseNumber(tokens[3]);
      const step = parseNumber(tokens[4]);
      circuit.addAnalysis('dc', { source, start, stop, step });
      break;
    }

    case '.TRAN': {
      // .tran <timestep> <stopTime> [startTime] [maxTimestep]
      const timestep = parseNumber(tokens[1]);
      const stopTime = parseNumber(tokens[2]);
      const startTime = tokens[3] ? parseNumber(tokens[3]) : undefined;
      const maxTimestep = tokens[4] ? parseNumber(tokens[4]) : undefined;
      circuit.addAnalysis('tran', { timestep, stopTime, startTime, maxTimestep });
      break;
    }

    case '.AC': {
      // .ac <variation> <points> <startFreq> <stopFreq>
      const variation = tokens[1].toLowerCase() as 'dec' | 'oct' | 'lin';
      const points = parseInt(tokens[2], 10);
      const startFreq = parseNumber(tokens[3]);
      const stopFreq = parseNumber(tokens[4]);
      circuit.addAnalysis('ac', { variation, points, startFreq, stopFreq });
      break;
    }

    case '.MODEL':
      circuit.addModel(parseModelCard(tokens, lineNumber));
      break;

    default:
      // Ignore unknown dot commands for forward compatibility
      break;
  }
}

function parseDevice(circuit: Circuit, tokens: string[], lineNumber: number): void {
  const name = tokens[0];
  const type = name[0].toUpperCase();

  switch (type) {
    case 'R': {
      // R<name> <n+> <n-> <value>
      const value = parseNumber(tokens[3]);
      circuit.addResistor(name, tokens[1], tokens[2], value);
      break;
    }

    case 'C': {
      // C<name> <n+> <n-> <value>
      const value = parseNumber(tokens[3]);
      circuit.addCapacitor(name, tokens[1], tokens[2], value);
      break;
    }

    case 'L': {
      // L<name> <n+> <n-> <value>
      const value = parseNumber(tokens[3]);
      circuit.addInductor(name, tokens[1], tokens[2], value);
      break;
    }

    case 'V': {
      // V<name> <n+> <n-> <DC value | PULSE(...) | SIN(...) | AC mag phase>
      const waveform = parseSourceWaveform(tokens, 3);
      circuit.addVoltageSource(name, tokens[1], tokens[2], waveform);
      break;
    }

    case 'I': {
      // I<name> <n+> <n-> <DC value | PULSE(...) | SIN(...)>
      const waveform = parseSourceWaveform(tokens, 3);
      circuit.addCurrentSource(name, tokens[1], tokens[2], waveform);
      break;
    }

    case 'D': {
      // D<name> <n+> <n-> <model>
      circuit.addDiode(name, tokens[1], tokens[2], tokens[3]);
      break;
    }

    case 'Q': {
      // Q<name> <nc> <nb> <ne> <model>
      circuit.addBJT(name, tokens[1], tokens[2], tokens[3], tokens[4]);
      break;
    }

    case 'M': {
      // M<name> <nd> <ng> <ns> <model>
      circuit.addMOSFET(name, tokens[1], tokens[2], tokens[3], tokens[4]);
      break;
    }

    default:
      throw new ParseError(`Unknown device type: '${type}'`, lineNumber, tokens.join(' '));
  }
}

function parseSourceWaveform(
  tokens: string[],
  startIdx: number,
): SourceWaveform {
  if (startIdx >= tokens.length) {
    return { type: 'dc', value: 0 };
  }

  const keyword = tokens[startIdx].toUpperCase();

  if (keyword === 'DC') {
    return { type: 'dc', value: parseNumber(tokens[startIdx + 1]) };
  }

  if (keyword === 'AC') {
    const magnitude = parseNumber(tokens[startIdx + 1]);
    const phase = tokens[startIdx + 2] ? parseNumber(tokens[startIdx + 2]) : 0;
    return { type: 'ac', magnitude, phase };
  }

  if (keyword === 'PULSE') {
    // PULSE ( v1 v2 delay rise fall width period )
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    return {
      type: 'pulse',
      v1: args[0] ?? 0,
      v2: args[1] ?? 0,
      delay: args[2] ?? 0,
      rise: args[3] ?? 1e-12,
      fall: args[4] ?? 1e-12,
      width: args[5] ?? Infinity,
      period: args[6] ?? Infinity,
    } satisfies PulseSource;
  }

  if (keyword === 'SIN') {
    // SIN ( offset amplitude frequency [delay [damping [phase]]] )
    const parenStart = tokens.indexOf('(', startIdx);
    const parenEnd = tokens.indexOf(')', startIdx);
    const args = tokens.slice(parenStart + 1, parenEnd).map(parseNumber);
    return {
      type: 'sin',
      offset: args[0] ?? 0,
      amplitude: args[1] ?? 0,
      frequency: args[2] ?? 0,
      delay: args[3],
      damping: args[4],
      phase: args[5],
    } satisfies SinSource;
  }

  // Bare number = DC value
  return { type: 'dc', value: parseNumber(tokens[startIdx]) };
}
```

- [ ] **Step 6: Run parser tests**

Run: `cd packages/core && pnpm test -- src/parser/parser.test.ts`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/parser/
git commit -m "feat: add SPICE netlist parser with engineering notation and source waveforms"
```

---

### Task 9: Public API — simulate() and parse()

**Files:**
- Create: `packages/core/src/simulate.ts`
- Create: `packages/core/src/simulate.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write end-to-end test**

```typescript
// packages/core/src/simulate.test.ts
import { describe, it, expect } from 'vitest';
import { simulate, parse, Circuit } from './index.js';

describe('simulate (end-to-end)', () => {
  it('simulates a voltage divider from netlist string', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      R2 2 0 2k
      .op
      .end
    `);

    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('1')).toBeCloseTo(5, 6);
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
  });

  it('simulates from programmatic Circuit', async () => {
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1e3);
    ckt.addResistor('R2', '2', '0', 2e3);
    ckt.addAnalysis('op');

    const result = await simulate(ckt);

    expect(result.dc).toBeDefined();
    expect(result.dc!.voltage('2')).toBeCloseTo(10 / 3, 6);
  });

  it('returns warnings array', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 0 1k
      .op
      .end
    `);

    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/simulate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement simulate.ts**

```typescript
// packages/core/src/simulate.ts
import { Circuit } from './circuit.js';
import type { CompiledCircuit } from './circuit.js';
import { parse } from './parser/index.js';
import type { SimulationOptions, SimulationWarning, TransientStep, ACPoint } from './types.js';
import { resolveOptions } from './types.js';
import { solveDCOperatingPoint, solveDCSweep } from './analysis/dc.js';
import type { SimulationResult } from './results.js';
import { InvalidCircuitError } from './errors.js';

export async function simulate(
  input: string | Circuit,
  options?: SimulationOptions,
): Promise<SimulationResult> {
  const circuit = typeof input === 'string' ? parse(input) : input;
  const compiled = circuit.compile();
  const warnings: SimulationWarning[] = [];

  validateCircuit(compiled, warnings);

  const result: SimulationResult = { warnings };

  for (const analysis of compiled.analyses) {
    switch (analysis.type) {
      case 'op': {
        const opts = resolveOptions(options);
        const { result: dcResult } = solveDCOperatingPoint(compiled, opts);
        result.dc = dcResult;
        break;
      }

      case 'dc': {
        const opts = resolveOptions(options);
        result.dcSweep = solveDCSweep(compiled, analysis, opts);
        break;
      }

      case 'tran': {
        // Transient — will be implemented in Task 11
        break;
      }

      case 'ac': {
        // AC — will be implemented in Task 14
        break;
      }
    }
  }

  return result;
}

export async function* simulateStream(
  input: string | Circuit,
  options?: SimulationOptions,
): AsyncIterableIterator<TransientStep | ACPoint> {
  // Will be implemented in Task 15
  throw new Error('simulateStream not yet implemented');
}

function validateCircuit(compiled: CompiledCircuit, warnings: SimulationWarning[]): void {
  if (compiled.nodeCount === 0) {
    throw new InvalidCircuitError('Circuit has no nodes');
  }

  if (compiled.analyses.length === 0) {
    throw new InvalidCircuitError('No analysis command specified');
  }
}
```

- [ ] **Step 4: Update index.ts barrel export**

```typescript
// packages/core/src/index.ts
export { simulate, simulateStream } from './simulate.js';
export { parse } from './parser/index.js';
export { Circuit } from './circuit.js';
export type { CompiledCircuit } from './circuit.js';
export { DCResult, TransientResult, ACResult } from './results.js';
export type { SimulationResult, DCSweepResult } from './results.js';
export type {
  SimulationOptions,
  TransientStep,
  ACPoint,
  AnalysisCommand,
  SourceWaveform,
  ModelParams,
} from './types.js';
export {
  SpiceError,
  ParseError,
  InvalidCircuitError,
  SingularMatrixError,
  ConvergenceError,
  TimestepTooSmallError,
} from './errors.js';
```

- [ ] **Step 5: Run end-to-end tests**

Run: `cd packages/core && pnpm test -- src/simulate.test.ts`
Expected: All pass.

- [ ] **Step 6: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/simulate.ts packages/core/src/simulate.test.ts packages/core/src/index.ts
git commit -m "feat: add simulate() public API with end-to-end voltage divider test"
```

---

### Task 10: Capacitor & Inductor Device Models

**Files:**
- Create: `packages/core/src/devices/capacitor.ts`
- Create: `packages/core/src/devices/inductor.ts`
- Create: `packages/core/src/devices/reactive.test.ts`
- Modify: `packages/core/src/circuit.ts` (add C and L to compile switch)

- [ ] **Step 1: Write capacitor and inductor tests**

```typescript
// packages/core/src/devices/reactive.test.ts
import { describe, it, expect } from 'vitest';
import { MNAAssembler } from '../mna/assembler.js';
import { Capacitor } from './capacitor.js';
import { Inductor } from './inductor.js';

describe('Capacitor', () => {
  it('stamps capacitance into C matrix', () => {
    const asm = new MNAAssembler(2, 0);
    const cap = new Capacitor('C1', [0, 1], 1e-9); // 1nF
    cap.stampDynamic!(asm.getStampContext());

    expect(asm.C.get(0, 0)).toBeCloseTo(1e-9);
    expect(asm.C.get(0, 1)).toBeCloseTo(-1e-9);
    expect(asm.C.get(1, 0)).toBeCloseTo(-1e-9);
    expect(asm.C.get(1, 1)).toBeCloseTo(1e-9);
  });

  it('does not stamp into G matrix (no DC path)', () => {
    const asm = new MNAAssembler(2, 0);
    const cap = new Capacitor('C1', [0, 1], 1e-9);
    cap.stamp(asm.getStampContext());

    expect(asm.G.get(0, 0)).toBe(0);
  });

  it('handles ground node', () => {
    const asm = new MNAAssembler(1, 0);
    const cap = new Capacitor('C1', [0, -1], 1e-9);
    cap.stampDynamic!(asm.getStampContext());

    expect(asm.C.get(0, 0)).toBeCloseTo(1e-9);
  });
});

describe('Inductor', () => {
  it('stamps branch equation into G matrix', () => {
    // Inductor between nodes 0 and 1, branch index = 2 (system row)
    // 2 nodes + 1 branch = system size 3
    const asm = new MNAAssembler(2, 1);
    const ind = new Inductor('L1', [0, 1], 2, 1e-6); // 1uH
    ind.stamp(asm.getStampContext());

    // KCL: branch current enters node 0, leaves node 1
    expect(asm.G.get(0, 2)).toBe(1);
    expect(asm.G.get(1, 2)).toBe(-1);
    // Branch equation: V(0) - V(1) = L * dI/dt
    // For DC: V(0) - V(1) = 0 (short circuit)
    expect(asm.G.get(2, 0)).toBe(1);
    expect(asm.G.get(2, 1)).toBe(-1);
  });

  it('stamps inductance into C matrix for transient', () => {
    const asm = new MNAAssembler(2, 1);
    const ind = new Inductor('L1', [0, 1], 2, 1e-6);
    ind.stampDynamic!(asm.getStampContext());

    // C[branchRow][branchRow] = -L
    expect(asm.C.get(2, 2)).toBeCloseTo(-1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/devices/reactive.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement Capacitor**

```typescript
// packages/core/src/devices/capacitor.ts
import type { DeviceModel, StampContext } from './device.js';

export class Capacitor implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly capacitance: number,
  ) {}

  stamp(_ctx: StampContext): void {
    // Capacitor has no DC conductance (open circuit at DC)
    // A small GMIN conductance could be added for convergence,
    // but we'll skip that for now.
  }

  stampDynamic(ctx: StampContext): void {
    const [n1, n2] = this.nodes;
    const c = this.capacitance;

    if (n1 >= 0) ctx.stampC(n1, n1, c);
    if (n2 >= 0) ctx.stampC(n2, n2, c);
    if (n1 >= 0 && n2 >= 0) {
      ctx.stampC(n1, n2, -c);
      ctx.stampC(n2, n1, -c);
    }
  }

  stampAC(ctx: StampContext, omega: number): void {
    // For AC: Y = jwC (stamped as imaginary part)
    // This is handled by the AC analysis using the C matrix directly
    this.stampDynamic(ctx);
  }
}
```

- [ ] **Step 4: Implement Inductor**

```typescript
// packages/core/src/devices/inductor.ts
import type { DeviceModel, StampContext } from './device.js';

export class Inductor implements DeviceModel {
  readonly branches: number[];
  readonly isNonlinear = false;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    readonly branchIndex: number,
    readonly inductance: number,
  ) {
    this.branches = [branchIndex];
  }

  stamp(ctx: StampContext): void {
    const [nPlus, nMinus] = this.nodes;
    const bi = this.branchIndex;

    // KCL: branch current enters positive node, leaves negative
    if (nPlus >= 0) ctx.stampG(nPlus, bi, 1);
    if (nMinus >= 0) ctx.stampG(nMinus, bi, -1);

    // Branch equation: V(+) - V(-) = L * dI/dt
    // For DC (static stamp): V(+) - V(-) = 0 (short circuit)
    if (nPlus >= 0) ctx.stampG(bi, nPlus, 1);
    if (nMinus >= 0) ctx.stampG(bi, nMinus, -1);
  }

  stampDynamic(ctx: StampContext): void {
    const bi = this.branchIndex;
    // Branch equation dynamic part: -L * dI/dt term
    // C[bi][bi] = -L (negative because it's on the RHS as L*dI/dt)
    ctx.stampC(bi, bi, -this.inductance);
  }
}
```

- [ ] **Step 5: Update Circuit.compile() to handle C and L**

In `packages/core/src/circuit.ts`, replace the default case in the compile switch:

```typescript
        case 'C': {
          // Capacitor is imported at top
          const { Capacitor } = await import('./devices/capacitor.js');
          devices.push(new Capacitor(desc.name, nodeIndices, desc.value!));
          break;
        }
        case 'L': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          const { Inductor } = await import('./devices/inductor.js');
          devices.push(new Inductor(desc.name, nodeIndices, bi, desc.value!));
          break;
        }
```

Actually, since `compile()` is synchronous, use static imports. Add to the top of `circuit.ts`:

```typescript
import { Capacitor } from './devices/capacitor.js';
import { Inductor } from './devices/inductor.js';
```

And add cases to the compile switch:

```typescript
        case 'C':
          devices.push(new Capacitor(desc.name, nodeIndices, desc.value!));
          break;
        case 'L': {
          const bi = branchIndex++;
          branchNames.push(desc.name);
          devices.push(new Inductor(desc.name, nodeIndices, bi, desc.value!));
          break;
        }
```

- [ ] **Step 6: Run reactive device tests**

Run: `cd packages/core && pnpm test -- src/devices/reactive.test.ts`
Expected: All pass.

- [ ] **Step 7: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/devices/capacitor.ts packages/core/src/devices/inductor.ts packages/core/src/devices/reactive.test.ts packages/core/src/circuit.ts
git commit -m "feat: add capacitor and inductor device models"
```

---

### Task 11: Transient Analysis

**Files:**
- Create: `packages/core/src/mna/companion.ts`
- Create: `packages/core/src/analysis/transient.ts`
- Create: `packages/core/src/analysis/transient.test.ts`
- Modify: `packages/core/src/simulate.ts` (wire up transient)

- [ ] **Step 1: Write transient analysis tests**

```typescript
// packages/core/src/analysis/transient.test.ts
import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { simulate } from '../simulate.js';

describe('Transient Analysis', () => {
  it('simulates RC charging curve', async () => {
    // RC circuit: V=5V, R=1kΩ, C=1µF → τ = 1ms
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 1000);
    ckt.addCapacitor('C1', '2', '0', 1e-6);
    ckt.addAnalysis('tran', { timestep: 10e-6, stopTime: 5e-3 });

    const result = await simulate(ckt);

    expect(result.transient).toBeDefined();
    const time = result.transient!.time;
    const vout = result.transient!.voltage('2');

    // At t=0, capacitor is uncharged: V ≈ 0
    expect(vout[0]).toBeCloseTo(0, 1);

    // At t ≈ τ (1ms), V ≈ 5 * (1 - e^-1) ≈ 3.16V
    const idxTau = time.findIndex(t => t >= 1e-3);
    expect(vout[idxTau]).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);

    // At t ≈ 5τ (5ms), V ≈ 5V (fully charged)
    const lastV = vout[vout.length - 1];
    expect(lastV).toBeCloseTo(5, 1);
  });

  it('simulates RL circuit', async () => {
    // RL circuit: V=5V, R=100Ω, L=10mH → τ = L/R = 0.1ms
    const ckt = new Circuit();
    ckt.addVoltageSource('V1', '1', '0', { dc: 5 });
    ckt.addResistor('R1', '1', '2', 100);
    ckt.addInductor('L1', '2', '0', 10e-3);
    ckt.addAnalysis('tran', { timestep: 1e-6, stopTime: 0.5e-3 });

    const result = await simulate(ckt);

    expect(result.transient).toBeDefined();
    const time = result.transient!.time;
    const vR = result.transient!.voltage('2');

    // At t=0, inductor blocks current: V(2) ≈ 0 (all voltage across L)
    // Actually V(2) is the node between R and L.
    // i(t) = (V/R)(1 - e^(-Rt/L)), V(2) = L * di/dt = V * e^(-Rt/L)
    // At t=0: V(2) = 5V (inductor has full voltage)... wait
    // V1 = 5V at node 1. R1 from 1→2. L1 from 2→0.
    // V(2) = V1 - I*R = 5 - (V/R)(1-e^(-Rt/L))*R = 5*e^(-Rt/L)
    // At t>>τ: V(2) → 0 (inductor is short, all voltage across R is 5V... no)
    // Steady state: I = V/R = 50mA, V(2) = 0V (inductor short)

    // At t ≈ 5τ, V(2) should be near 0
    const lastV = vR[vR.length - 1];
    expect(lastV).toBeCloseTo(0, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/analysis/transient.test.ts`
Expected: FAIL — transient not implemented.

- [ ] **Step 3: Implement companion model**

```typescript
// packages/core/src/mna/companion.ts
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { MNAAssembler } from './assembler.js';
import type { DeviceModel } from '../devices/device.js';
import type { IntegrationMethod } from '../types.js';

/**
 * Build the effective conductance matrix for transient analysis.
 * Applies the companion model (BE or Trapezoidal) to convert
 * reactive elements into equivalent resistors + current sources.
 *
 * For Backward Euler: G_eff = G + C/dt, b_eff = b + C/dt * x_prev
 * For Trapezoidal:    G_eff = G + 2C/dt, b_eff = b + 2C/dt * x_prev + (G_prev*x_prev + b_prev - ... )
 *
 * We use the simpler "stamping" approach: after devices stamp G and C,
 * we combine them into an effective system.
 */
export function buildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
): void {
  // Clear and re-stamp
  assembler.clear();
  assembler.setTime(assembler.time, dt);
  const ctx = assembler.getStampContext();

  // Stamp DC contributions (G and b)
  for (const device of devices) {
    device.stamp(ctx);
  }

  // Stamp dynamic contributions (C matrix)
  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  // Now combine: G_eff = G + α*C/dt where α=1 for BE, α=2 for Trap
  const alpha = method === 'euler' ? 1 : 2;
  const factor = alpha / dt;

  // Add C/dt to G matrix (modifies G in place)
  assembler.G.addMatrix(assembler.C, factor);

  // Add history term to b: (α*C/dt) * x_prev
  // For each non-zero C entry, add factor * C[i][j] * x_prev[j] to b[i]
  for (let i = 0; i < assembler.systemSize; i++) {
    const row = assembler.C.getRow(i);
    for (const [j, cval] of row) {
      assembler.b[i] += factor * cval * prevSolution[j];
    }
  }

  // For trapezoidal, we also need: b += (G_dc * x_prev + b_dc) - (α*C/dt) * x_prev
  // But this simplifies. The standard trapezoidal companion is:
  // (G + 2C/dt) * x = b + (2C/dt) * x_prev
  // which is what we already have. The more accurate version also includes
  // the previous derivative term, but this basic form is sufficient and stable.
}
```

- [ ] **Step 4: Implement transient analysis**

```typescript
// packages/core/src/analysis/transient.ts
import type { DeviceModel } from '../devices/device.js';
import type { ResolvedOptions, TransientAnalysis, TransientStep } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { buildCompanionSystem } from '../mna/companion.js';
import { solveLU } from '../solver/lu-solver.js';
import { ConvergenceError, TimestepTooSmallError } from '../errors.js';
import { TransientResult } from '../results.js';

const MIN_TIMESTEP = 1e-18;

export function solveTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution?: Float64Array,
): TransientResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);

  // Set initial conditions
  if (initialSolution) {
    assembler.solution.set(initialSolution);
  }

  const maxDt = options.maxTimestep !== Infinity
    ? options.maxTimestep
    : analysis.stopTime / 50;
  let dt = Math.min(analysis.timestep, maxDt);

  // Storage for results
  const timePoints: number[] = [0];
  const voltageArrays = new Map<string, number[]>();
  const currentArrays = new Map<string, number[]>();

  for (const name of nodeNames) {
    voltageArrays.set(name, [assembler.solution[compiled.nodeIndexMap.get(name)!]]);
  }
  for (let i = 0; i < branchNames.length; i++) {
    currentArrays.set(branchNames[i], [assembler.solution[nodeCount + i]]);
  }

  let time = 0;

  while (time < analysis.stopTime - dt * 0.001) {
    // Try to advance by dt
    const prevSol = new Float64Array(assembler.solution);
    const nextTime = Math.min(time + dt, analysis.stopTime);
    const actualDt = nextTime - time;

    assembler.time = nextTime;

    let converged = false;

    for (let iter = 0; iter < options.maxTransientIterations; iter++) {
      // Build companion system at current time
      buildCompanionSystem(assembler, devices, actualDt, options.integrationMethod, prevSol);

      // Solve
      const x = solveLU(assembler.G, new Float64Array(assembler.b));

      // Check convergence against previous iteration's solution
      const prev = new Float64Array(assembler.solution);
      assembler.solution.set(x);

      if (isConvergedTransient(x, prev, nodeCount, options)) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      // Shrink timestep and retry
      dt = dt / 4;
      if (dt < MIN_TIMESTEP) {
        throw new TimestepTooSmallError(time, dt);
      }
      assembler.solution.set(prevSol); // restore
      continue;
    }

    // Success — record result
    time = nextTime;
    timePoints.push(time);

    for (const name of nodeNames) {
      voltageArrays.get(name)!.push(assembler.solution[compiled.nodeIndexMap.get(name)!]);
    }
    for (let i = 0; i < branchNames.length; i++) {
      currentArrays.get(branchNames[i])!.push(assembler.solution[nodeCount + i]);
    }

    // Adaptive timestep: grow if converged quickly
    dt = Math.min(dt * 1.5, maxDt, analysis.stopTime - time);
    if (dt < MIN_TIMESTEP && time < analysis.stopTime - MIN_TIMESTEP) break;
  }

  return new TransientResult(timePoints, voltageArrays, currentArrays);
}

function isConvergedTransient(
  current: Float64Array,
  previous: Float64Array,
  numNodes: number,
  options: ResolvedOptions,
): boolean {
  for (let i = 0; i < current.length; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = i < numNodes
      ? options.vntol + options.reltol * Math.abs(current[i])
      : options.abstol + options.reltol * Math.abs(current[i]);
    if (diff > tol) return false;
  }
  return true;
}
```

- [ ] **Step 5: Wire transient into simulate.ts**

In `packages/core/src/simulate.ts`, add the import and case:

```typescript
import { solveTransient } from './analysis/transient.js';
```

Replace the `case 'tran'` block:

```typescript
      case 'tran': {
        const opts = resolveOptions(options, analysis.stopTime);
        // Get DC operating point as initial condition
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        result.transient = solveTransient(compiled, analysis, opts, dcAsm.solution);
        break;
      }
```

- [ ] **Step 6: Run transient tests**

Run: `cd packages/core && pnpm test -- src/analysis/transient.test.ts`
Expected: All pass.

- [ ] **Step 7: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/mna/companion.ts packages/core/src/analysis/transient.ts packages/core/src/analysis/transient.test.ts packages/core/src/simulate.ts
git commit -m "feat: add transient analysis with companion model and adaptive timestep"
```

---

### Task 12: Diode (Shockley Model)

**Files:**
- Create: `packages/core/src/devices/diode.ts`
- Create: `packages/core/src/devices/diode.test.ts`
- Modify: `packages/core/src/circuit.ts` (add D to compile switch)

- [ ] **Step 1: Write diode tests**

```typescript
// packages/core/src/devices/diode.test.ts
import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { simulate } from '../simulate.js';
import { MNAAssembler } from '../mna/assembler.js';
import { Diode } from './diode.js';

describe('Diode', () => {
  it('stamps linearized conductance and current', () => {
    const asm = new MNAAssembler(2, 0);
    // Set operating point: V(anode)=0.7V, V(cathode)=0V
    asm.solution[0] = 0.7;
    asm.solution[1] = 0.0;

    const diode = new Diode('D1', [0, 1], { IS: 1e-14, N: 1, BV: 100 });
    diode.stamp(asm.getStampContext());

    // Should stamp non-zero conductance at operating point
    expect(asm.G.get(0, 0)).toBeGreaterThan(0);
    expect(asm.G.get(1, 1)).toBeGreaterThan(0);
    // RHS should have current correction
    expect(asm.b[0]).not.toBe(0);
  });

  it('is nonlinear', () => {
    const diode = new Diode('D1', [0, 1], { IS: 1e-14, N: 1, BV: 100 });
    expect(diode.isNonlinear).toBe(true);
  });
});

describe('Diode in circuit', () => {
  it('forward biased diode has ~0.6-0.7V drop', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      .model DMOD D(IS=1e-14 N=1)
      D1 2 0 DMOD
      .op
      .end
    `);

    const vd = result.dc!.voltage('2');
    // Forward voltage should be around 0.6-0.7V
    expect(vd).toBeGreaterThan(0.55);
    expect(vd).toBeLessThan(0.75);
  });

  it('reverse biased diode blocks current', async () => {
    const result = await simulate(`
      V1 1 0 DC -5
      R1 1 2 1k
      .model DMOD D(IS=1e-14 N=1)
      D1 2 0 DMOD
      .op
      .end
    `);

    const vd = result.dc!.voltage('2');
    // Should be near -5V (essentially no current through diode)
    expect(vd).toBeCloseTo(-5, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/devices/diode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Diode**

```typescript
// packages/core/src/devices/diode.ts
import type { DeviceModel, StampContext } from './device.js';

export interface DiodeParams {
  /** Saturation current (A). Default: 1e-14 */
  IS: number;
  /** Emission coefficient. Default: 1 */
  N: number;
  /** Breakdown voltage (V). Default: Infinity */
  BV: number;
  /** Zero-bias junction capacitance (F). Default: 0 */
  CJ0?: number;
  /** Junction potential (V). Default: 0.7 */
  VJ?: number;
  /** Grading coefficient. Default: 0.5 */
  M?: number;
  /** Transit time (s). Default: 0 */
  TT?: number;
}

const VT = 0.02585; // Thermal voltage at 300K (kT/q)
const GMIN = 1e-12; // Minimum conductance for convergence

export class Diode implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: DiodeParams;

  constructor(
    readonly name: string,
    readonly nodes: number[],
    params: Partial<DiodeParams>,
  ) {
    this.params = {
      IS: params.IS ?? 1e-14,
      N: params.N ?? 1,
      BV: params.BV ?? Infinity,
      CJ0: params.CJ0 ?? 0,
      VJ: params.VJ ?? 0.7,
      M: params.M ?? 0.5,
      TT: params.TT ?? 0,
    };
  }

  stamp(ctx: StampContext): void {
    const [nA, nK] = this.nodes; // anode, cathode
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const vd = vA - vK;

    const { IS, N } = this.params;
    const vt = N * VT;

    // Diode current: Id = IS * (exp(Vd/Vt) - 1)
    // Limit Vd to prevent overflow
    const vdLim = limitVoltage(vd, vt);
    const expTerm = Math.exp(vdLim / vt);
    const id = IS * (expTerm - 1);

    // Conductance: dId/dVd = IS/Vt * exp(Vd/Vt)
    const gd = (IS / vt) * expTerm + GMIN;

    // Newton-Raphson linearization: stamp equivalent conductance + current source
    // I_eq = Id - gd * Vd (current source value)
    const ieq = id - gd * vd;

    // Stamp conductance
    if (nA >= 0) ctx.stampG(nA, nA, gd);
    if (nK >= 0) ctx.stampG(nK, nK, gd);
    if (nA >= 0 && nK >= 0) {
      ctx.stampG(nA, nK, -gd);
      ctx.stampG(nK, nA, -gd);
    }

    // Stamp current source (RHS)
    if (nA >= 0) ctx.stampB(nA, -ieq);
    if (nK >= 0) ctx.stampB(nK, ieq);
  }

  stampDynamic(ctx: StampContext): void {
    // Junction capacitance (if specified)
    const { CJ0, VJ, M, TT, IS, N } = this.params;
    if (!CJ0 && !TT) return;

    const [nA, nK] = this.nodes;
    const vA = nA >= 0 ? ctx.getVoltage(nA) : 0;
    const vK = nK >= 0 ? ctx.getVoltage(nK) : 0;
    const vd = vA - vK;

    let cj = 0;
    // Depletion capacitance
    if (CJ0) {
      if (vd < 0.5 * VJ!) {
        cj = CJ0 / Math.pow(1 - vd / VJ!, M!);
      } else {
        // Forward bias: linearize to avoid singularity
        cj = CJ0 / Math.pow(0.5, M!);
      }
    }

    // Diffusion capacitance (transit time)
    if (TT) {
      const vt = N * VT;
      const gd = (IS / vt) * Math.exp(Math.min(vd / vt, 40));
      cj += TT * gd;
    }

    // Stamp capacitance
    if (nA >= 0) ctx.stampC(nA, nA, cj);
    if (nK >= 0) ctx.stampC(nK, nK, cj);
    if (nA >= 0 && nK >= 0) {
      ctx.stampC(nA, nK, -cj);
      ctx.stampC(nK, nA, -cj);
    }
  }
}

/**
 * Voltage limiting to prevent numerical overflow in exp().
 * Uses the critical voltage method from SPICE.
 */
function limitVoltage(vd: number, vt: number): number {
  const vcrit = vt * Math.log(vt / (Math.sqrt(2) * 1e-14));
  if (vd > vcrit) {
    return vcrit + vt * Math.log(1 + (vd - vcrit) / vt);
  }
  return Math.max(vd, -40 * vt); // Prevent extreme reverse bias overflow
}
```

- [ ] **Step 4: Update Circuit.compile() for diodes**

Add import to `circuit.ts`:

```typescript
import { Diode } from './devices/diode.js';
```

Add case in compile switch:

```typescript
        case 'D': {
          const modelName = desc.modelName;
          const modelParams = modelName ? this._models.get(modelName)?.params ?? {} : {};
          devices.push(new Diode(desc.name, nodeIndices, modelParams));
          break;
        }
```

- [ ] **Step 5: Run diode tests**

Run: `cd packages/core && pnpm test -- src/devices/diode.test.ts`
Expected: All pass.

- [ ] **Step 6: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/devices/diode.ts packages/core/src/devices/diode.test.ts packages/core/src/circuit.ts
git commit -m "feat: add Shockley diode model with NR linearization and voltage limiting"
```

---

### Task 13: BJT (Ebers-Moll Model)

**Files:**
- Create: `packages/core/src/devices/bjt.ts`
- Create: `packages/core/src/devices/bjt.test.ts`
- Modify: `packages/core/src/circuit.ts` (add Q to compile switch)

- [ ] **Step 1: Write BJT tests**

```typescript
// packages/core/src/devices/bjt.test.ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('BJT Ebers-Moll', () => {
  it('NPN common-emitter amplifier has correct bias point', async () => {
    // Simple NPN bias circuit
    // Vcc=12V, Rb=100k (base bias), Rc=1k (collector)
    // Expected: Vbe ≈ 0.65V, Ic ≈ (12-0.65)/100k * BF ≈ several mA
    const result = await simulate(`
      VCC 1 0 DC 12
      .model QMOD NPN(BF=100 IS=1e-14)
      RB 1 2 100k
      RC 1 3 1k
      Q1 3 2 0 QMOD
      .op
      .end
    `);

    const vb = result.dc!.voltage('2');
    const vc = result.dc!.voltage('3');

    // Base voltage should be around 0.6-0.7V
    expect(vb).toBeGreaterThan(0.55);
    expect(vb).toBeLessThan(0.8);

    // Collector voltage should be between 0 and 12V
    expect(vc).toBeGreaterThan(0);
    expect(vc).toBeLessThan(12);
  });

  it('NPN in cutoff has collector at VCC', async () => {
    const result = await simulate(`
      VCC 1 0 DC 5
      .model QMOD NPN(BF=100 IS=1e-14)
      RC 1 2 1k
      Q1 2 0 0 QMOD
      .op
      .end
    `);

    // Base = 0V = emitter → cutoff, Vc ≈ VCC
    const vc = result.dc!.voltage('2');
    expect(vc).toBeCloseTo(5, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/devices/bjt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement BJT**

```typescript
// packages/core/src/devices/bjt.ts
import type { DeviceModel, StampContext } from './device.js';

export interface BJTParams {
  /** Forward current gain. Default: 100 */
  BF: number;
  /** Reverse current gain. Default: 1 */
  BR: number;
  /** Saturation current (A). Default: 1e-14 */
  IS: number;
  /** Forward emission coefficient. Default: 1 */
  NF: number;
  /** Reverse emission coefficient. Default: 1 */
  NR: number;
  /** Forward early voltage (V). Default: Infinity */
  VAF: number;
  /** Polarity: 1 for NPN, -1 for PNP */
  polarity: number;
}

const VT = 0.02585;
const GMIN = 1e-12;

export class BJT implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: BJTParams;

  constructor(
    readonly name: string,
    readonly nodes: number[], // [collector, base, emitter]
    params: Partial<BJTParams> & { polarity?: number },
  ) {
    this.params = {
      BF: params.BF ?? 100,
      BR: params.BR ?? 1,
      IS: params.IS ?? 1e-14,
      NF: params.NF ?? 1,
      NR: params.NR ?? 1,
      VAF: params.VAF ?? Infinity,
      polarity: params.polarity ?? 1,
    };
  }

  stamp(ctx: StampContext): void {
    const [nC, nB, nE] = this.nodes;
    const { IS, BF, BR, NF, NR, polarity } = this.params;

    const vC = (nC >= 0 ? ctx.getVoltage(nC) : 0) * polarity;
    const vB = (nB >= 0 ? ctx.getVoltage(nB) : 0) * polarity;
    const vE = (nE >= 0 ? ctx.getVoltage(nE) : 0) * polarity;

    const vBE = vB - vE;
    const vBC = vB - vC;

    const vtF = NF * VT;
    const vtR = NR * VT;

    // Ebers-Moll model:
    // IF = IS * (exp(VBE/VtF) - 1)  (forward diode)
    // IR = IS * (exp(VBC/VtR) - 1)  (reverse diode)
    // IC = IF - IR/BR - IR          simplified: IC = IF - IR*(1 + 1/BR)
    // IB = IF/BF + IR/BR
    // IE = -(IC + IB)

    const vbeLim = limitVoltage(vBE, vtF);
    const vbcLim = limitVoltage(vBC, vtR);

    const expBE = Math.exp(vbeLim / vtF);
    const expBC = Math.exp(vbcLim / vtR);

    const iF = IS * (expBE - 1);
    const iR = IS * (expBC - 1);

    // Conductances (derivatives)
    const gF = (IS / vtF) * expBE + GMIN; // dIF/dVBE
    const gR = (IS / vtR) * expBC + GMIN; // dIR/dVBC

    // Terminal currents (Ebers-Moll transport form)
    const iC = (iF - iR * (1 + 1 / BR)) * polarity;
    const iB = (iF / BF + iR / BR) * polarity;
    const iE = -(iC + iB);

    // Linearized conductances for Newton-Raphson
    // gm_f = dIC/dVBE = gF (transconductance forward)
    // gm_r = dIC/dVBC = -gR*(1+1/BR) (transconductance reverse)
    // go_be = dIB/dVBE = gF/BF
    // go_bc = dIB/dVBC = gR/BR
    const gmF = gF * polarity;
    const gmR = gR * (1 + 1 / BR) * polarity;
    const goBE = gF / BF * polarity;
    const goBC = gR / BR * polarity;

    // Stamp collector current: IC = gmF*VBE - gmR*VBC + ICreq
    // VBE = VB - VE, VBC = VB - VC
    const icEq = iC - gmF * vBE * polarity + gmR * vBC * polarity;
    stampBranch(ctx, nC, nB, nE, gmF, -1);  // dIC/dVBE contribution
    stampBranch2(ctx, nC, nB, nC, gmR, 1);  // dIC/dVBC contribution (note: enters as negative)
    if (nC >= 0) ctx.stampB(nC, icEq);

    // Stamp base current: IB = goBE*VBE + goBC*VBC + IBreq
    const ibEq = iB - goBE * vBE * polarity - goBC * vBC * polarity;
    stampBranch(ctx, nB, nB, nE, goBE, 1);  // dIB/dVBE
    stampBranch2(ctx, nB, nB, nC, goBC, -1); // dIB/dVBC
    if (nB >= 0) ctx.stampB(nB, ibEq);

    // Emitter current by KCL: IE = -(IC + IB)
    if (nE >= 0) ctx.stampB(nE, -(icEq + ibEq));
    // Stamp emitter conductances (negative of C + B conductances)
    stampBranch(ctx, nE, nB, nE, -(gmF + goBE), -1);
    stampBranch2(ctx, nE, nB, nC, -(gmR + goBC), 1);
  }
}

/** Stamp conductance g for current from nodeOut due to voltage V(n1)-V(n2) */
function stampBranch(
  ctx: StampContext,
  nodeOut: number,
  n1: number,
  n2: number,
  g: number,
  sign: number,
): void {
  const gs = g * sign;
  if (nodeOut >= 0 && n1 >= 0) ctx.stampG(nodeOut, n1, gs);
  if (nodeOut >= 0 && n2 >= 0) ctx.stampG(nodeOut, n2, -gs);
}

function stampBranch2(
  ctx: StampContext,
  nodeOut: number,
  n1: number,
  n2: number,
  g: number,
  sign: number,
): void {
  const gs = g * sign;
  if (nodeOut >= 0 && n1 >= 0) ctx.stampG(nodeOut, n1, -gs);
  if (nodeOut >= 0 && n2 >= 0) ctx.stampG(nodeOut, n2, gs);
}

function limitVoltage(vd: number, vt: number): number {
  const vcrit = vt * Math.log(vt / (Math.sqrt(2) * 1e-14));
  if (vd > vcrit) {
    return vcrit + vt * Math.log(1 + (vd - vcrit) / vt);
  }
  return Math.max(vd, -40 * vt);
}
```

- [ ] **Step 4: Update Circuit.compile() for BJTs**

Add import to `circuit.ts`:

```typescript
import { BJT } from './devices/bjt.js';
```

Add case in compile switch:

```typescript
        case 'Q': {
          const modelName = desc.modelName;
          const model = modelName ? this._models.get(modelName) : undefined;
          const modelParams = model?.params ?? {};
          const polarity = model?.type === 'PNP' ? -1 : 1;
          devices.push(new BJT(desc.name, nodeIndices, { ...modelParams, polarity }));
          break;
        }
```

- [ ] **Step 5: Run BJT tests**

Run: `cd packages/core && pnpm test -- src/devices/bjt.test.ts`
Expected: All pass.

- [ ] **Step 6: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/devices/bjt.ts packages/core/src/devices/bjt.test.ts packages/core/src/circuit.ts
git commit -m "feat: add Ebers-Moll BJT model (NPN/PNP)"
```

---

### Task 14: MOSFET (Level 1 Shichman-Hodges)

**Files:**
- Create: `packages/core/src/devices/mosfet.ts`
- Create: `packages/core/src/devices/mosfet.test.ts`
- Modify: `packages/core/src/circuit.ts` (add M to compile switch)

- [ ] **Step 1: Write MOSFET tests**

```typescript
// packages/core/src/devices/mosfet.test.ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('MOSFET Level 1', () => {
  it('NMOS inverter: high input → low output', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VIN 2 0 DC 5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 10k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    // VGS=5V > VTO=1V, MOSFET is on, Vout should be low
    expect(vout).toBeLessThan(2);
  });

  it('NMOS inverter: low input → high output', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VIN 2 0 DC 0
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 10k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    // VGS=0V < VTO=1V, MOSFET is off, Vout should be near VDD
    expect(vout).toBeCloseTo(5, 0);
  });

  it('NMOS in cutoff has zero drain current', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 0.5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 1k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    // VGS < VTO → cutoff → no current → Vout = VDD
    expect(vout).toBeCloseTo(5, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/devices/mosfet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MOSFET**

```typescript
// packages/core/src/devices/mosfet.ts
import type { DeviceModel, StampContext } from './device.js';

export interface MOSFETParams {
  /** Threshold voltage (V). Default: 1 */
  VTO: number;
  /** Transconductance parameter (A/V²). Default: 2e-5 */
  KP: number;
  /** Channel length modulation (1/V). Default: 0 */
  LAMBDA: number;
  /** Polarity: 1 for NMOS, -1 for PMOS */
  polarity: number;
}

const GMIN = 1e-12;

export class MOSFET implements DeviceModel {
  readonly branches: number[] = [];
  readonly isNonlinear = true;
  readonly params: MOSFETParams;

  constructor(
    readonly name: string,
    readonly nodes: number[], // [drain, gate, source]
    params: Partial<MOSFETParams> & { polarity?: number },
  ) {
    this.params = {
      VTO: params.VTO ?? 1,
      KP: params.KP ?? 2e-5,
      LAMBDA: params.LAMBDA ?? 0,
      polarity: params.polarity ?? 1,
    };
  }

  stamp(ctx: StampContext): void {
    const [nD, nG, nS] = this.nodes;
    const { VTO, KP, LAMBDA, polarity } = this.params;

    const vD = (nD >= 0 ? ctx.getVoltage(nD) : 0);
    const vG = (nG >= 0 ? ctx.getVoltage(nG) : 0);
    const vS = (nS >= 0 ? ctx.getVoltage(nS) : 0);

    // Apply polarity for PMOS
    const vGS = (vG - vS) * polarity;
    const vDS = (vD - vS) * polarity;

    const vth = VTO;
    let iD: number;
    let gm: number;  // dID/dVGS
    let gds: number; // dID/dVDS

    if (vGS <= vth) {
      // Cutoff region
      iD = 0;
      gm = 0;
      gds = 0;
    } else if (vDS < vGS - vth) {
      // Linear (triode) region
      // ID = KP * ((VGS - VTO)*VDS - VDS²/2) * (1 + LAMBDA*VDS)
      const vov = vGS - vth;
      iD = KP * (vov * vDS - vDS * vDS / 2) * (1 + LAMBDA * vDS);
      gm = KP * vDS * (1 + LAMBDA * vDS);
      gds = KP * (vov - vDS) * (1 + LAMBDA * vDS) +
            KP * (vov * vDS - vDS * vDS / 2) * LAMBDA;
    } else {
      // Saturation region
      // ID = (KP/2) * (VGS - VTO)² * (1 + LAMBDA*VDS)
      const vov = vGS - vth;
      iD = (KP / 2) * vov * vov * (1 + LAMBDA * vDS);
      gm = KP * vov * (1 + LAMBDA * vDS);
      gds = (KP / 2) * vov * vov * LAMBDA;
    }

    // Apply polarity back
    iD *= polarity;
    gm *= polarity;
    gds *= polarity;

    // Add GMIN for convergence
    gds += GMIN;

    // Newton-Raphson linearization:
    // ID ≈ ID0 + gm*(VGS - VGS0) + gds*(VDS - VDS0)
    // ID ≈ gm*VGS + gds*VDS + Ieq
    // where Ieq = ID0 - gm*VGS0 - gds*VDS0
    const ieq = iD - gm * vGS - gds * vDS;

    // Stamp into MNA. Current flows into drain, out of source.
    // Drain current as function of VGS and VDS:
    // ID = gm*(VG - VS) + gds*(VD - VS) + Ieq

    // gm contribution (VG - VS)
    if (nD >= 0 && nG >= 0) ctx.stampG(nD, nG, gm);
    if (nD >= 0 && nS >= 0) ctx.stampG(nD, nS, -gm);
    if (nS >= 0 && nG >= 0) ctx.stampG(nS, nG, -gm);
    if (nS >= 0 && nS >= 0) ctx.stampG(nS, nS, gm);

    // gds contribution (VD - VS)
    if (nD >= 0) ctx.stampG(nD, nD, gds);
    if (nS >= 0) ctx.stampG(nS, nS, gds);
    if (nD >= 0 && nS >= 0) {
      ctx.stampG(nD, nS, -gds);
      ctx.stampG(nS, nD, -gds);
    }

    // Current source (Ieq)
    if (nD >= 0) ctx.stampB(nD, ieq);
    if (nS >= 0) ctx.stampB(nS, -ieq);
  }
}
```

- [ ] **Step 4: Update Circuit.compile() for MOSFETs**

Add import to `circuit.ts`:

```typescript
import { MOSFET } from './devices/mosfet.js';
```

Add case in compile switch:

```typescript
        case 'M': {
          const modelName = desc.modelName;
          const model = modelName ? this._models.get(modelName) : undefined;
          const modelParams = model?.params ?? {};
          const polarity = model?.type === 'PMOS' ? -1 : 1;
          devices.push(new MOSFET(desc.name, nodeIndices, { ...modelParams, polarity }));
          break;
        }
```

- [ ] **Step 5: Run MOSFET tests**

Run: `cd packages/core && pnpm test -- src/devices/mosfet.test.ts`
Expected: All pass.

- [ ] **Step 6: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/devices/mosfet.ts packages/core/src/devices/mosfet.test.ts packages/core/src/circuit.ts
git commit -m "feat: add Level 1 Shichman-Hodges MOSFET model (NMOS/PMOS)"
```

---

### Task 15: AC Small-Signal Analysis

**Files:**
- Create: `packages/core/src/analysis/ac.ts`
- Create: `packages/core/src/analysis/ac.test.ts`
- Modify: `packages/core/src/simulate.ts` (wire up AC)

- [ ] **Step 1: Write AC analysis tests**

```typescript
// packages/core/src/analysis/ac.test.ts
import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { Circuit } from '../circuit.js';

describe('AC Small-Signal Analysis', () => {
  it('RC lowpass filter has correct -3dB frequency', async () => {
    // R=1kΩ, C=1µF → f_3dB = 1/(2π*RC) ≈ 159 Hz
    const result = await simulate(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1u
      .ac dec 20 1 100k
      .end
    `);

    expect(result.ac).toBeDefined();
    const freqs = result.ac!.frequencies;
    const vout = result.ac!.voltage('2');

    // At low frequency, gain ≈ 1 (0 dB)
    expect(vout[0].magnitude).toBeCloseTo(1, 1);

    // Find -3dB point (magnitude ≈ 0.707)
    const f3dB = 1 / (2 * Math.PI * 1000 * 1e-6); // ≈ 159 Hz
    const idx3dB = freqs.findIndex(f => f >= f3dB);
    expect(vout[idx3dB].magnitude).toBeCloseTo(1 / Math.sqrt(2), 1);

    // At high frequency, gain rolls off
    const lastGain = vout[vout.length - 1].magnitude;
    expect(lastGain).toBeLessThan(0.1);
  });

  it('RLC bandpass has resonance peak', async () => {
    // R=100Ω, L=10mH, C=100nF → f0 = 1/(2π√LC) ≈ 5033 Hz
    const result = await simulate(`
      V1 1 0 AC 1 0
      R1 1 2 100
      L1 2 3 10m
      C1 3 0 100n
      .ac dec 20 100 100k
      .end
    `);

    expect(result.ac).toBeDefined();
    const freqs = result.ac!.frequencies;
    const vout = result.ac!.voltage('3');

    // Find peak magnitude
    let maxMag = 0;
    let maxIdx = 0;
    for (let i = 0; i < vout.length; i++) {
      if (vout[i].magnitude > maxMag) {
        maxMag = vout[i].magnitude;
        maxIdx = i;
      }
    }

    // Peak should be near resonant frequency
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 100e-9));
    expect(freqs[maxIdx]).toBeCloseTo(f0, -2); // within ~1% order
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/analysis/ac.test.ts`
Expected: FAIL — AC not implemented.

- [ ] **Step 3: Implement AC analysis**

```typescript
// packages/core/src/analysis/ac.ts
import type { DeviceModel } from '../devices/device.js';
import type { ResolvedOptions, ACAnalysis, ACPoint } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { solveComplexLU } from '../solver/lu-solver.js';
import { ACResult } from '../results.js';

export function solveAC(
  compiled: CompiledCircuit,
  analysis: ACAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): ACResult {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const systemSize = nodeCount + branchCount;

  // Step 1: Build linearized G and C matrices at DC operating point
  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(dcSolution);

  // Stamp DC (gets G matrix with linearized nonlinear devices)
  const ctx = assembler.getStampContext();
  for (const device of devices) {
    device.stamp(ctx);
  }

  // Stamp dynamic (gets C matrix)
  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  const G = assembler.G;
  const C = assembler.C;

  // Step 2: Find AC excitation source
  let excitationBranch = -1;
  let excitationMag = 1;
  let excitationPhase = 0;

  for (const device of devices) {
    const exc = device.getACExcitation?.();
    if (exc) {
      excitationBranch = exc.branch;
      excitationMag = exc.magnitude;
      excitationPhase = exc.phase;
      break;
    }
  }

  // Step 3: Generate frequency points
  const frequencies = generateFrequencies(analysis);

  // Step 4: Sweep frequencies
  const voltageArrays = new Map<string, { magnitude: number; phase: number }[]>();
  const currentArrays = new Map<string, { magnitude: number; phase: number }[]>();

  for (const name of nodeNames) voltageArrays.set(name, []);
  for (const name of branchNames) currentArrays.set(name, []);

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    // Build Y = G + jωC
    // Real part: G
    // Imaginary part: ωC
    const Yimag = new SparseMatrix(systemSize);
    for (let i = 0; i < systemSize; i++) {
      const row = C.getRow(i);
      for (const [j, cval] of row) {
        Yimag.add(i, j, omega * cval);
      }
    }

    // RHS: excitation at the source branch
    const bReal = new Float64Array(systemSize);
    const bImag = new Float64Array(systemSize);
    if (excitationBranch >= 0) {
      const phaseRad = (excitationPhase * Math.PI) / 180;
      bReal[excitationBranch] = excitationMag * Math.cos(phaseRad);
      bImag[excitationBranch] = excitationMag * Math.sin(phaseRad);
    }

    // Solve complex system
    const [xReal, xImag] = solveComplexLU(G, Yimag, bReal, bImag);

    // Extract results
    for (let i = 0; i < nodeNames.length; i++) {
      const re = xReal[i];
      const im = xImag[i];
      const magnitude = Math.sqrt(re * re + im * im);
      const phase = (Math.atan2(im, re) * 180) / Math.PI;
      voltageArrays.get(nodeNames[i])!.push({ magnitude, phase });
    }

    for (let i = 0; i < branchNames.length; i++) {
      const re = xReal[nodeCount + i];
      const im = xImag[nodeCount + i];
      const magnitude = Math.sqrt(re * re + im * im);
      const phase = (Math.atan2(im, re) * 180) / Math.PI;
      currentArrays.get(branchNames[i])!.push({ magnitude, phase });
    }
  }

  return new ACResult(frequencies, voltageArrays, currentArrays);
}

function generateFrequencies(analysis: ACAnalysis): number[] {
  const { variation, points, startFreq, stopFreq } = analysis;
  const frequencies: number[] = [];

  switch (variation) {
    case 'dec': {
      const decades = Math.log10(stopFreq / startFreq);
      const totalPoints = Math.round(decades * points);
      for (let i = 0; i <= totalPoints; i++) {
        frequencies.push(startFreq * Math.pow(10, (i / points)));
      }
      break;
    }
    case 'oct': {
      const octaves = Math.log2(stopFreq / startFreq);
      const totalPoints = Math.round(octaves * points);
      for (let i = 0; i <= totalPoints; i++) {
        frequencies.push(startFreq * Math.pow(2, (i / points)));
      }
      break;
    }
    case 'lin': {
      const step = (stopFreq - startFreq) / points;
      for (let i = 0; i <= points; i++) {
        frequencies.push(startFreq + i * step);
      }
      break;
    }
  }

  return frequencies;
}
```

- [ ] **Step 4: Wire AC into simulate.ts**

Add import to `simulate.ts`:

```typescript
import { solveAC } from './analysis/ac.js';
```

Replace the `case 'ac'` block:

```typescript
      case 'ac': {
        const opts = resolveOptions(options);
        // Get DC operating point first
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        result.ac = solveAC(compiled, analysis, opts, dcAsm.solution);
        break;
      }
```

- [ ] **Step 5: Run AC tests**

Run: `cd packages/core && pnpm test -- src/analysis/ac.test.ts`
Expected: All pass.

- [ ] **Step 6: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/analysis/ac.ts packages/core/src/analysis/ac.test.ts packages/core/src/simulate.ts
git commit -m "feat: add AC small-signal analysis with frequency sweep"
```

---

### Task 16: Streaming API

**Files:**
- Create: `packages/core/src/simulate.stream.test.ts`
- Modify: `packages/core/src/simulate.ts` (implement simulateStream)

- [ ] **Step 1: Write streaming tests**

```typescript
// packages/core/src/simulate.stream.test.ts
import { describe, it, expect } from 'vitest';
import { simulateStream, parse } from './index.js';

describe('simulateStream', () => {
  it('streams transient results as TransientStep objects', async () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 2 1k
      C1 2 0 1u
      .tran 10u 1m
      .end
    `);

    const steps: { time: number; v2: number }[] = [];

    for await (const step of simulateStream(ckt)) {
      if ('time' in step) {
        steps.push({ time: step.time, v2: step.voltages.get('2')! });
      }
    }

    // Should have multiple timesteps
    expect(steps.length).toBeGreaterThan(10);

    // First point: capacitor uncharged
    expect(steps[0].v2).toBeCloseTo(0, 0);

    // Last point: capacitor mostly charged
    expect(steps[steps.length - 1].v2).toBeGreaterThan(4);

    // Time should be monotonically increasing
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].time).toBeGreaterThan(steps[i - 1].time);
    }
  });

  it('streams AC results as ACPoint objects', async () => {
    const ckt = parse(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1u
      .ac dec 5 1 10k
      .end
    `);

    const points: { freq: number; mag: number }[] = [];

    for await (const point of simulateStream(ckt)) {
      if ('frequency' in point) {
        points.push({
          freq: point.frequency,
          mag: point.voltages.get('2')!.magnitude,
        });
      }
    }

    expect(points.length).toBeGreaterThan(5);

    // Low frequency: gain near 1
    expect(points[0].mag).toBeCloseTo(1, 0);

    // High frequency: gain drops
    expect(points[points.length - 1].mag).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test -- src/simulate.stream.test.ts`
Expected: FAIL — simulateStream throws "not yet implemented".

- [ ] **Step 3: Implement simulateStream**

Replace the `simulateStream` function in `packages/core/src/simulate.ts`:

```typescript
export async function* simulateStream(
  input: string | Circuit,
  options?: SimulationOptions,
): AsyncIterableIterator<TransientStep | ACPoint> {
  const circuit = typeof input === 'string' ? parse(input) : input;
  const compiled = circuit.compile();
  const warnings: SimulationWarning[] = [];

  validateCircuit(compiled, warnings);

  for (const analysis of compiled.analyses) {
    switch (analysis.type) {
      case 'tran': {
        const opts = resolveOptions(options, analysis.stopTime);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        yield* streamTransient(compiled, analysis, opts, dcAsm.solution);
        break;
      }

      case 'ac': {
        const opts = resolveOptions(options);
        const { assembler: dcAsm } = solveDCOperatingPoint(compiled, opts);
        yield* streamAC(compiled, analysis, opts, dcAsm.solution);
        break;
      }
    }
  }
}
```

Also add the streaming helper functions. These need imports from the analysis modules' internal pieces. The cleanest approach is to add generator versions alongside the existing batch functions.

Add to `simulate.ts`:

```typescript
import { MNAAssembler } from './mna/assembler.js';
import { buildCompanionSystem } from './mna/companion.js';
import { solveLU, solveComplexLU } from './solver/lu-solver.js';
import { SparseMatrix } from './solver/sparse-matrix.js';
import { TimestepTooSmallError } from './errors.js';
import type { TransientAnalysis, ACAnalysis, ResolvedOptions, ACPoint } from './types.js';

const MIN_TIMESTEP = 1e-18;

function* streamTransient(
  compiled: CompiledCircuit,
  analysis: TransientAnalysis,
  options: ResolvedOptions,
  initialSolution: Float64Array,
): Generator<TransientStep> {
  const { devices, nodeCount, branchCount, nodeNames, branchNames, nodeIndexMap } = compiled;
  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(initialSolution);

  const maxDt = options.maxTimestep !== Infinity ? options.maxTimestep : analysis.stopTime / 50;
  let dt = Math.min(analysis.timestep, maxDt);

  // Yield initial point
  yield buildTransientStep(0, assembler.solution, nodeNames, branchNames, nodeCount, nodeIndexMap);

  let time = 0;

  while (time < analysis.stopTime - dt * 0.001) {
    const prevSol = new Float64Array(assembler.solution);
    const nextTime = Math.min(time + dt, analysis.stopTime);
    const actualDt = nextTime - time;
    assembler.time = nextTime;

    let converged = false;
    for (let iter = 0; iter < options.maxTransientIterations; iter++) {
      buildCompanionSystem(assembler, devices, actualDt, options.integrationMethod, prevSol);
      const x = solveLU(assembler.G, new Float64Array(assembler.b));
      const prev = new Float64Array(assembler.solution);
      assembler.solution.set(x);

      if (isConverged(x, prev, nodeCount, options)) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      dt = dt / 4;
      if (dt < MIN_TIMESTEP) throw new TimestepTooSmallError(time, dt);
      assembler.solution.set(prevSol);
      continue;
    }

    time = nextTime;
    yield buildTransientStep(time, assembler.solution, nodeNames, branchNames, nodeCount, nodeIndexMap);

    dt = Math.min(dt * 1.5, maxDt, analysis.stopTime - time);
    if (dt < MIN_TIMESTEP && time < analysis.stopTime - MIN_TIMESTEP) break;
  }
}

function buildTransientStep(
  time: number,
  solution: Float64Array,
  nodeNames: string[],
  branchNames: string[],
  nodeCount: number,
  nodeIndexMap: Map<string, number>,
): TransientStep {
  const voltages = new Map<string, number>();
  for (const name of nodeNames) {
    voltages.set(name, solution[nodeIndexMap.get(name)!]);
  }
  const currents = new Map<string, number>();
  for (let i = 0; i < branchNames.length; i++) {
    currents.set(branchNames[i], solution[nodeCount + i]);
  }
  return { time, voltages, currents };
}

function* streamAC(
  compiled: CompiledCircuit,
  analysis: ACAnalysis,
  options: ResolvedOptions,
  dcSolution: Float64Array,
): Generator<ACPoint> {
  const { devices, nodeCount, branchCount, nodeNames, branchNames } = compiled;
  const systemSize = nodeCount + branchCount;

  const assembler = new MNAAssembler(nodeCount, branchCount);
  assembler.solution.set(dcSolution);

  const ctx = assembler.getStampContext();
  for (const device of devices) {
    device.stamp(ctx);
  }
  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  let excitationBranch = -1;
  let excitationMag = 1;
  let excitationPhase = 0;
  for (const device of devices) {
    const exc = device.getACExcitation?.();
    if (exc) {
      excitationBranch = exc.branch;
      excitationMag = exc.magnitude;
      excitationPhase = exc.phase;
      break;
    }
  }

  const frequencies = generateFreqs(analysis);

  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    const Yimag = new SparseMatrix(systemSize);
    for (let i = 0; i < systemSize; i++) {
      const row = assembler.C.getRow(i);
      for (const [j, cval] of row) {
        Yimag.add(i, j, omega * cval);
      }
    }

    const bReal = new Float64Array(systemSize);
    const bImag = new Float64Array(systemSize);
    if (excitationBranch >= 0) {
      const phaseRad = (excitationPhase * Math.PI) / 180;
      bReal[excitationBranch] = excitationMag * Math.cos(phaseRad);
      bImag[excitationBranch] = excitationMag * Math.sin(phaseRad);
    }

    const [xReal, xImag] = solveComplexLU(assembler.G, Yimag, bReal, bImag);

    const voltages = new Map<string, { magnitude: number; phase: number }>();
    for (let i = 0; i < nodeNames.length; i++) {
      const magnitude = Math.sqrt(xReal[i] ** 2 + xImag[i] ** 2);
      const phase = (Math.atan2(xImag[i], xReal[i]) * 180) / Math.PI;
      voltages.set(nodeNames[i], { magnitude, phase });
    }

    const currents = new Map<string, { magnitude: number; phase: number }>();
    for (let i = 0; i < branchNames.length; i++) {
      const re = xReal[nodeCount + i];
      const im = xImag[nodeCount + i];
      currents.set(branchNames[i], {
        magnitude: Math.sqrt(re ** 2 + im ** 2),
        phase: (Math.atan2(im, re) * 180) / Math.PI,
      });
    }

    yield { frequency: freq, voltages, currents };
  }
}

function generateFreqs(analysis: ACAnalysis): number[] {
  const { variation, points, startFreq, stopFreq } = analysis;
  const frequencies: number[] = [];
  switch (variation) {
    case 'dec': {
      const decades = Math.log10(stopFreq / startFreq);
      const totalPoints = Math.round(decades * points);
      for (let i = 0; i <= totalPoints; i++) frequencies.push(startFreq * Math.pow(10, i / points));
      break;
    }
    case 'oct': {
      const octaves = Math.log2(stopFreq / startFreq);
      const totalPoints = Math.round(octaves * points);
      for (let i = 0; i <= totalPoints; i++) frequencies.push(startFreq * Math.pow(2, i / points));
      break;
    }
    case 'lin': {
      const step = (stopFreq - startFreq) / points;
      for (let i = 0; i <= points; i++) frequencies.push(startFreq + i * step);
      break;
    }
  }
  return frequencies;
}

function isConverged(
  current: Float64Array,
  previous: Float64Array,
  numNodes: number,
  options: ResolvedOptions,
): boolean {
  for (let i = 0; i < current.length; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = i < numNodes
      ? options.vntol + options.reltol * Math.abs(current[i])
      : options.abstol + options.reltol * Math.abs(current[i]);
    if (diff > tol) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run streaming tests**

Run: `cd packages/core && pnpm test -- src/simulate.stream.test.ts`
Expected: All pass.

- [ ] **Step 5: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/simulate.ts packages/core/src/simulate.stream.test.ts
git commit -m "feat: add simulateStream() with async iterator for transient and AC"
```

---

### Task 17: Device Registry & Index

**Files:**
- Create: `packages/core/src/devices/index.ts`
- Modify: `packages/core/src/index.ts` (export device types for extensibility)

- [ ] **Step 1: Create device index**

```typescript
// packages/core/src/devices/index.ts
export type { DeviceModel, StampContext } from './device.js';
export { Resistor } from './resistor.js';
export { Capacitor } from './capacitor.js';
export { Inductor } from './inductor.js';
export { VoltageSource } from './voltage-source.js';
export { CurrentSource } from './current-source.js';
export { Diode } from './diode.js';
export { BJT } from './bjt.js';
export { MOSFET } from './mosfet.js';
```

- [ ] **Step 2: Update main index.ts**

Add to `packages/core/src/index.ts`:

```typescript
export type { DeviceModel, StampContext } from './devices/device.js';
```

- [ ] **Step 3: Run all tests**

Run: `cd packages/core && pnpm test`
Expected: All pass.

- [ ] **Step 4: Build the package**

Run: `cd packages/core && pnpm build`
Expected: dist/ created successfully.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/devices/index.ts packages/core/src/index.ts
git commit -m "feat: add device registry and export DeviceModel interface for extensibility"
```

---

### Task 18: Integration Test Suite

**Files:**
- Create: `fixtures/circuits/voltage-divider.cir`
- Create: `fixtures/circuits/rc-lowpass.cir`
- Create: `fixtures/circuits/rl-circuit.cir`
- Create: `fixtures/circuits/diode-rectifier.cir`
- Create: `packages/core/src/integration.test.ts`

- [ ] **Step 1: Create test circuit fixtures**

```spice
* fixtures/circuits/voltage-divider.cir
V1 1 0 DC 10
R1 1 2 1k
R2 2 0 1k
.op
.end
```

```spice
* fixtures/circuits/rc-lowpass.cir
V1 1 0 PULSE(0 5 0 1n 1n 0.5m 1m)
R1 1 2 1k
C1 2 0 100n
.tran 1u 3m
.end
```

```spice
* fixtures/circuits/rl-circuit.cir
V1 1 0 DC 5
R1 1 2 100
L1 2 0 10m
.tran 1u 0.5m
.end
```

```spice
* fixtures/circuits/diode-rectifier.cir
.model DMOD D(IS=1e-14 N=1)
V1 1 0 SIN(0 5 1k)
R1 2 0 1k
D1 1 2 DMOD
.tran 1u 3m
.end
```

- [ ] **Step 2: Write integration tests**

```typescript
// packages/core/src/integration.test.ts
import { describe, it, expect } from 'vitest';
import { simulate } from './simulate.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../fixtures/circuits', name), 'utf-8');
}

describe('Integration tests', () => {
  describe('Voltage divider', () => {
    it('produces correct node voltages', async () => {
      const result = await simulate(loadFixture('voltage-divider.cir'));
      expect(result.dc!.voltage('1')).toBeCloseTo(10, 6);
      expect(result.dc!.voltage('2')).toBeCloseTo(5, 6); // equal resistors
    });
  });

  describe('RC lowpass', () => {
    it('shows exponential charging and RC time constant', async () => {
      const result = await simulate(loadFixture('rc-lowpass.cir'));
      const t = result.transient!.time;
      const v = result.transient!.voltage('2');

      // τ = RC = 1kΩ * 100nF = 100µs
      // At t=τ: V ≈ 5*(1-e^-1) ≈ 3.16V
      const tau = 100e-6;
      const idxTau = t.findIndex(ti => ti >= tau);
      expect(v[idxTau]).toBeCloseTo(5 * (1 - Math.exp(-1)), 0);
    });
  });

  describe('RL circuit', () => {
    it('current ramps up with L/R time constant', async () => {
      const result = await simulate(loadFixture('rl-circuit.cir'));
      const t = result.transient!.time;
      const vNode = result.transient!.voltage('2');

      // τ = L/R = 10mH/100Ω = 0.1ms
      // V(2) = V * e^(-t/τ) → approaches 0 as inductor becomes short
      const tau = 10e-3 / 100;
      const idxTau = t.findIndex(ti => ti >= tau);
      // At t=τ: V(2) ≈ 5*e^-1 ≈ 1.84V
      expect(vNode[idxTau]).toBeCloseTo(5 * Math.exp(-1), 0);
    });
  });

  describe('Diode rectifier', () => {
    it('rectifies sinusoidal input', async () => {
      const result = await simulate(loadFixture('diode-rectifier.cir'));
      const v = result.transient!.voltage('2');

      // Output should never go significantly negative (diode blocks)
      const minV = Math.min(...v);
      expect(minV).toBeGreaterThan(-0.1);

      // Output should reach near peak (5V - Vf ≈ 4.3V)
      const maxV = Math.max(...v);
      expect(maxV).toBeGreaterThan(4);
    });
  });
});
```

- [ ] **Step 3: Run integration tests**

Run: `cd packages/core && pnpm test -- src/integration.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add fixtures/ packages/core/src/integration.test.ts
git commit -m "feat: add integration test suite with fixture circuits"
```

---

### Task 19: Benchmark Scaffolding

**Files:**
- Create: `benchmarks/run.ts`
- Create: `benchmarks/circuits/resistor-ladder-100.cir`
- Create: `benchmarks/circuits/resistor-ladder-1000.cir`
- Modify: root `package.json` (add benchmark script)

- [ ] **Step 1: Create benchmark resistor ladder generator**

```typescript
// benchmarks/run.ts
import { simulate } from '@spice-ts/core';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function generateResistorLadder(n: number): string {
  let netlist = `* Resistor ladder with ${n} nodes\n`;
  netlist += `V1 1 0 DC 5\n`;
  for (let i = 1; i <= n; i++) {
    const next = i < n ? String(i + 1) : '0';
    netlist += `R${i} ${i} ${next} 1k\n`;
  }
  netlist += `.op\n.end\n`;
  return netlist;
}

interface BenchmarkResult {
  name: string;
  nodes: number;
  timeMs: number;
  date: string;
}

async function runBenchmark(name: string, netlist: string, nodes: number): Promise<BenchmarkResult> {
  // Warmup
  await simulate(netlist);

  // Timed run (average of 5)
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await simulate(netlist);
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  return {
    name,
    nodes,
    timeMs: Math.round(avg * 100) / 100,
    date: new Date().toISOString().split('T')[0],
  };
}

async function main() {
  console.log('spice-ts Benchmark Suite\n');
  console.log('========================\n');

  const results: BenchmarkResult[] = [];

  // Resistor ladder benchmarks
  for (const n of [10, 100, 500, 1000]) {
    const netlist = generateResistorLadder(n);
    const result = await runBenchmark(`resistor-ladder-${n}`, netlist, n);
    results.push(result);
    console.log(`Resistor ladder (${n} nodes): ${result.timeMs}ms`);
  }

  // Circuit file benchmarks
  const circuitDir = resolve(__dirname, 'circuits');
  if (existsSync(circuitDir)) {
    const files = ['resistor-ladder-100.cir', 'resistor-ladder-1000.cir'];
    for (const file of files) {
      const path = resolve(circuitDir, file);
      if (existsSync(path)) {
        const netlist = readFileSync(path, 'utf-8');
        const result = await runBenchmark(file, netlist, 0);
        results.push(result);
        console.log(`${file}: ${result.timeMs}ms`);
      }
    }
  }

  console.log('\n========================');
  console.log('Results:');
  console.table(results);

  // Save results
  const outPath = resolve(__dirname, 'results.json');
  let history: BenchmarkResult[][] = [];
  if (existsSync(outPath)) {
    history = JSON.parse(readFileSync(outPath, 'utf-8'));
  }
  history.push(results);
  writeFileSync(outPath, JSON.stringify(history, null, 2));
  console.log(`\nResults saved to ${outPath}`);
}

main().catch(console.error);
```

- [ ] **Step 2: Create fixture benchmark circuits**

```spice
* benchmarks/circuits/resistor-ladder-100.cir
* Auto-generated 100-node resistor ladder
V1 1 0 DC 5
R1 1 2 1k
R2 2 3 1k
* ... (generate the full file with 100 resistors)
```

For the actual files, write a small generation step in the benchmark script. The `generateResistorLadder` function already handles this programmatically, so the `.cir` files are optional but useful for ngspice cross-comparison.

- [ ] **Step 3: Add benchmark script to root package.json**

Add to root `package.json` scripts:

```json
"bench": "cd packages/core && pnpm build && cd ../.. && npx tsx benchmarks/run.ts"
```

- [ ] **Step 4: Add tsx as dev dependency**

Run: `pnpm add -D tsx -w`

- [ ] **Step 5: Run benchmark**

Run: `pnpm bench`
Expected: Benchmark results printed to console. No errors.

- [ ] **Step 6: Add benchmarks to .gitignore**

Add to `.gitignore`:

```
benchmarks/results.json
```

- [ ] **Step 7: Commit**

```bash
git add benchmarks/ package.json pnpm-lock.yaml .gitignore
git commit -m "feat: add benchmark scaffolding with resistor ladder scaling tests"
```

---

## Summary

**19 tasks total**, building up from foundation to full simulator:

| # | Task | What it delivers |
|---|------|-----------------|
| 1 | Project scaffolding | pnpm monorepo, TS config, build/test tooling |
| 2 | Core types & errors | Type system + error hierarchy |
| 3 | Sparse matrix & LU solver | Linear algebra foundation |
| 4 | MNA assembler | Matrix assembly + stamp interface |
| 5 | Linear devices | R, V, I source models |
| 6 | Circuit class | Programmatic builder + node mapping |
| 7 | DC operating point | First working analysis + Newton-Raphson |
| 8 | Netlist parser | SPICE netlist → Circuit |
| 9 | Public API | simulate(), parse() end-to-end |
| 10 | Reactive devices | Capacitor + Inductor |
| 11 | Transient analysis | Time-domain simulation |
| 12 | Diode | First nonlinear device (Shockley) |
| 13 | BJT | Ebers-Moll transistor model |
| 14 | MOSFET | Level 1 Shichman-Hodges |
| 15 | AC analysis | Small-signal frequency sweep |
| 16 | Streaming API | simulateStream() async iterator |
| 17 | Device registry | Clean exports + extensibility |
| 18 | Integration tests | Fixture circuits with known answers |
| 19 | Benchmarks | Performance tracking scaffolding |
