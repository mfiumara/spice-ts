# Typed-Array Stamping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Map-of-Maps stamping with direct typed-array writes into pre-allocated CSC buffers, eliminating per-iteration Map overhead and CSC conversion from the Newton-Raphson hot loop.

**Architecture:** After the first NR iteration discovers circuit topology via the existing Map-of-Maps path, `MNAAssembler.lockTopology()` builds CSC structure + position lookup tables. All subsequent iterations stamp directly into `Float64Array` CSC value buffers. The companion model operates on the same typed arrays. The solver reads the CSC matrix directly — no `toCsc`/`updateCscValues` step.

**Tech Stack:** TypeScript, Float64Array, Int32Array, vitest

---

## File Structure

```
packages/core/src/
  mna/
    assembler.ts        (modify — add typed-array fields, lockTopology, fast-path StampContext)
    companion.ts        (modify — typed-array companion arithmetic when fastPath active)
  analysis/
    newton-raphson.ts   (modify — use lockTopology + getCscMatrix, remove toCsc/updateCscValues)
    transient.ts        (modify — same pattern as NR)
    ac.ts               (modify — pre-built combined CSC, typed-array frequency updates)
  simulate.ts           (modify — streaming paths match analysis changes)
```

No new files. No changes to device implementations or StampContext interface.

---

### Task 1: Add Typed-Array Stamping Infrastructure to MNAAssembler

**Files:**
- Modify: `packages/core/src/mna/assembler.ts`
- Test: `packages/core/src/mna/assembler.test.ts`

- [ ] **Step 1: Run existing assembler tests to establish baseline**

Run: `cd packages/core && npx vitest run src/mna/assembler.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 2: Add typed-array fields and lockTopology method**

In `packages/core/src/mna/assembler.ts`, add imports and new fields/methods to the `MNAAssembler` class. The full replacement of the file:

```typescript
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { toCsc, type CscMatrix } from '../solver/csc-matrix.js';
import type { StampContext } from '../devices/device.js';

export class MNAAssembler {
  public readonly G: SparseMatrix;
  public readonly C: SparseMatrix;
  public readonly b: Float64Array;
  public readonly solution: Float64Array;
  public readonly prevSolution: Float64Array;
  public readonly systemSize: number;
  public time = 0;
  public dt = 0;
  public sourceScale = 1;

  // Fast-path typed-array stamping (populated by lockTopology)
  private _gValues: Float64Array | null = null;
  private _cValues: Float64Array | null = null;
  private _colPtr: Int32Array | null = null;
  private _rowIdx: Int32Array | null = null;
  private _posMap: Int32Array | null = null;
  private _diagIdx: Int32Array | null = null;
  private _fastPath = false;

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

  /**
   * Lock the sparsity topology after the first stamp pass.
   * Builds CSC structure and position lookup from the union of
   * G and C non-zero positions. All subsequent stamps go through
   * typed-array fast path.
   */
  lockTopology(): void {
    const n = this.systemSize;

    // Build union of G and C positions
    const union = new SparseMatrix(n);
    for (let i = 0; i < n; i++) {
      for (const [j, val] of this.G.getRow(i)) {
        union.add(i, j, val);
      }
      for (const [j, val] of this.C.getRow(i)) {
        if (union.get(i, j) === 0) {
          union.add(i, j, 1); // placeholder to mark position
        }
      }
    }

    // Build CSC from union
    const { csc, scatter } = toCsc(union);
    this._colPtr = csc.colPtr;
    this._rowIdx = csc.rowIdx;
    this._gValues = new Float64Array(csc.values.length);
    this._cValues = new Float64Array(csc.values.length);

    // Build flat posMap: (row * n + col) → CSC index
    this._posMap = new Int32Array(n * n).fill(-1);
    for (const [key, idx] of scatter) {
      this._posMap[key] = idx;
    }

    // Cache diagonal positions for GMIN stamping
    this._diagIdx = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      this._diagIdx[i] = this._posMap[i * n + i];
    }

    // Copy current G and C values into typed arrays
    for (let i = 0; i < n; i++) {
      for (const [j, val] of this.G.getRow(i)) {
        this._gValues[this._posMap[i * n + j]] = val;
      }
      for (const [j, val] of this.C.getRow(i)) {
        this._cValues[this._posMap[i * n + j]] = val;
      }
    }

    this._fastPath = true;
  }

  get isFastPath(): boolean {
    return this._fastPath;
  }

  get gValues(): Float64Array {
    return this._gValues!;
  }

  get cValues(): Float64Array {
    return this._cValues!;
  }

  get colPtr(): Int32Array {
    return this._colPtr!;
  }

  get rowIdx(): Int32Array {
    return this._rowIdx!;
  }

  get diagIdx(): Int32Array {
    return this._diagIdx!;
  }

  getCscMatrix(): CscMatrix {
    return {
      size: this.systemSize,
      colPtr: this._colPtr!,
      rowIdx: this._rowIdx!,
      values: this._gValues!,
    };
  }

  getStampContext(): StampContext {
    if (this._fastPath) {
      const gv = this._gValues!;
      const cv = this._cValues!;
      const pm = this._posMap!;
      const n = this.systemSize;
      return {
        stampG: (row, col, value) => { gv[pm[row * n + col]] += value; },
        stampB: (row, value) => { this.b[row] += value; },
        stampC: (row, col, value) => { cv[pm[row * n + col]] += value; },
        getVoltage: (node) => this.solution[node],
        getCurrent: (branch) => this.solution[this.numNodes + branch],
        time: this.time,
        dt: this.dt,
        numNodes: this.numNodes,
        sourceScale: this.sourceScale,
      };
    }
    return {
      stampG: (row, col, value) => this.G.add(row, col, value),
      stampB: (row, value) => { this.b[row] += value; },
      stampC: (row, col, value) => this.C.add(row, col, value),
      getVoltage: (node) => this.solution[node],
      getCurrent: (branch) => this.solution[this.numNodes + branch],
      time: this.time,
      dt: this.dt,
      numNodes: this.numNodes,
      sourceScale: this.sourceScale,
    };
  }

  clear(): void {
    if (this._fastPath) {
      this._gValues!.fill(0);
      this._cValues!.fill(0);
      this.b.fill(0);
    } else {
      this.G.clear();
      this.C.clear();
      this.b.fill(0);
    }
  }

  saveSolution(): void {
    this.prevSolution.set(this.solution);
  }

  setTime(time: number, dt: number): void {
    this.time = time;
    this.dt = dt;
  }
}
```

- [ ] **Step 3: Run existing assembler tests**

Run: `cd packages/core && npx vitest run src/mna/assembler.test.ts`
Expected: PASS — existing tests use Map-based path (lockTopology not called)

- [ ] **Step 4: Add tests for lockTopology and fast-path stamping**

Append to `packages/core/src/mna/assembler.test.ts`:

```typescript
  it('lockTopology enables fast-path stamping', () => {
    const asm = new MNAAssembler(2, 0);
    // Phase 1: Map-based stamp to discover topology
    const ctx1 = asm.getStampContext();
    ctx1.stampG(0, 0, 1); ctx1.stampG(0, 1, -1);
    ctx1.stampG(1, 0, -1); ctx1.stampG(1, 1, 1);
    ctx1.stampC(0, 0, 0.5);

    asm.lockTopology();
    expect(asm.isFastPath).toBe(true);

    // Phase 2: fast-path stamp
    asm.clear();
    const ctx2 = asm.getStampContext();
    ctx2.stampG(0, 0, 2); ctx2.stampG(0, 1, -2);
    ctx2.stampG(1, 0, -2); ctx2.stampG(1, 1, 2);

    const csc = asm.getCscMatrix();
    // Verify CSC values match what was stamped
    expect(csc.size).toBe(2);
    // gValues should contain the stamped values
    expect(asm.gValues[asm.diagIdx[0]]).toBe(2);
    expect(asm.gValues[asm.diagIdx[1]]).toBe(2);
  });

  it('getCscMatrix returns valid CSC with fast-path values', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 3); ctx.stampG(0, 1, 1);
    ctx.stampG(1, 0, 1); ctx.stampG(1, 1, 3);

    asm.lockTopology();
    const csc = asm.getCscMatrix();
    expect(csc.size).toBe(2);
    expect(csc.colPtr.length).toBe(3);
    // Values should match what was stamped before lockTopology
    const vals = Array.from(csc.values);
    expect(vals).toContain(3);
    expect(vals).toContain(1);
  });

  it('clear resets gValues and cValues when fast-path active', () => {
    const asm = new MNAAssembler(2, 0);
    const ctx = asm.getStampContext();
    ctx.stampG(0, 0, 5);
    ctx.stampC(0, 0, 1);

    asm.lockTopology();
    expect(asm.gValues[asm.diagIdx[0]]).toBe(5);

    asm.clear();
    expect(asm.gValues[asm.diagIdx[0]]).toBe(0);
    expect(asm.cValues[asm.diagIdx[0]]).toBe(0);
  });
```

- [ ] **Step 5: Run tests**

Run: `cd packages/core && npx vitest run src/mna/assembler.test.ts`
Expected: all tests PASS (4 old + 3 new)

- [ ] **Step 6: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL 293 tests PASS (lockTopology not called by any analysis yet)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/mna/assembler.ts packages/core/src/mna/assembler.test.ts
git commit -m "feat: add typed-array stamping infrastructure to MNAAssembler"
```

---

### Task 2: Wire Newton-Raphson to Use Fast Path

**Files:**
- Modify: `packages/core/src/analysis/newton-raphson.ts`

- [ ] **Step 1: Run DC tests to establish baseline**

Run: `cd packages/core && npx vitest run src/analysis/dc.test.ts src/analysis/dc-sweep.test.ts`
Expected: PASS

- [ ] **Step 2: Replace newton-raphson.ts with fast-path implementation**

```typescript
import type { DeviceModel } from '../devices/device.js';
import type { MNAAssembler } from '../mna/assembler.js';
import type { ResolvedOptions } from '../types.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { ConvergenceError } from '../errors.js';

export function newtonRaphson(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  options: ResolvedOptions,
  maxIter: number,
  nodeNames: string[],
): number {
  const solver = createSparseSolver();
  let patternAnalyzed = false;

  for (let iter = 0; iter < maxIter; iter++) {
    assembler.saveSolution();
    assembler.clear();

    const ctx = assembler.getStampContext();
    for (const device of devices) {
      device.stamp(ctx);
    }

    if (!assembler.isFastPath) {
      // First iteration: Map-based stamp. Add GMIN via Map, then lock topology.
      for (let i = 0; i < assembler.numNodes; i++) {
        assembler.G.add(i, i, options.gmin);
      }
      assembler.lockTopology();
    } else {
      // Fast path: GMIN via direct array write
      const gv = assembler.gValues;
      const diag = assembler.diagIdx;
      for (let i = 0; i < assembler.numNodes; i++) {
        gv[diag[i]] += options.gmin;
      }
    }

    if (!patternAnalyzed) {
      solver.analyzePattern(assembler.getCscMatrix());
      patternAnalyzed = true;
    }
    solver.factorize(assembler.getCscMatrix());
    const x = solver.solve(new Float64Array(assembler.b));
    assembler.solution.set(x);

    if (isConverged(assembler.solution, assembler.prevSolution, assembler.numNodes, options)) {
      return iter + 1;
    }
  }

  const oscillating = findOscillatingNodes(
    assembler.solution, assembler.prevSolution,
    assembler.numNodes, nodeNames, options,
  );

  throw new ConvergenceError(
    `Did not converge in ${maxIter} iterations`,
    undefined, oscillating,
    new Float64Array(assembler.solution),
    new Float64Array(assembler.prevSolution),
  );
}

function isConverged(
  current: Float64Array, previous: Float64Array,
  numNodes: number, options: ResolvedOptions,
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

function findOscillatingNodes(
  current: Float64Array, previous: Float64Array,
  numNodes: number, nodeNames: string[], options: ResolvedOptions,
): string[] {
  const result: string[] = [];
  for (let i = 0; i < numNodes; i++) {
    const diff = Math.abs(current[i] - previous[i]);
    const tol = options.vntol + options.reltol * Math.abs(current[i]);
    if (diff > tol) result.push(nodeNames[i] ?? `node_${i}`);
  }
  return result;
}
```

Note: `toCsc`, `updateCscValues`, `countNnz`, `ScatterMap` imports are all removed. The assembler's `getCscMatrix()` provides the CSC directly.

- [ ] **Step 3: Run DC tests**

Run: `cd packages/core && npx vitest run src/analysis/dc.test.ts src/analysis/dc-sweep.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL tests PASS

Note: Transient/AC tests may still pass because they have their own solve paths that haven't changed yet. If any fail, it means the NR path shared by DC is broken — debug from there.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/analysis/newton-raphson.ts
git commit -m "perf: wire Newton-Raphson to typed-array fast path"
```

---

### Task 3: Update Companion Model for Typed Arrays

**Files:**
- Modify: `packages/core/src/mna/companion.ts`

- [ ] **Step 1: Run transient tests to establish baseline**

Run: `cd packages/core && npx vitest run src/analysis/transient.test.ts`
Expected: PASS

- [ ] **Step 2: Replace companion.ts with dual-path implementation**

```typescript
import { MNAAssembler } from './assembler.js';
import type { DeviceModel } from '../devices/device.js';
import type { IntegrationMethod } from '../types.js';

/**
 * Build the effective conductance matrix for transient analysis.
 *
 * Backward Euler: (G + C/dt) * x(n+1) = b(n+1) + (C/dt) * x(n)
 * Trapezoidal:    (G + 2C/dt) * x(n+1) = b(n+1) + b(n) + (2C/dt - G) * x(n)
 */
export function buildCompanionSystem(
  assembler: MNAAssembler,
  devices: DeviceModel[],
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
  gmin = 1e-12,
): void {
  // Clear and re-stamp at current time
  assembler.clear();
  const ctx = assembler.getStampContext();

  for (const device of devices) {
    device.stamp(ctx);
  }

  for (const device of devices) {
    device.stampDynamic?.(ctx);
  }

  if (assembler.isFastPath) {
    _buildCompanionFast(assembler, dt, method, prevSolution, prevB, gmin);
  } else {
    _buildCompanionSlow(assembler, dt, method, prevSolution, prevB, gmin);
  }
}

/**
 * Fast path: typed-array arithmetic on pre-allocated CSC buffers.
 */
function _buildCompanionFast(
  assembler: MNAAssembler,
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
  gmin = 1e-12,
): void {
  const gv = assembler.gValues;
  const cv = assembler.cValues;
  const colPtr = assembler.colPtr;
  const rowIdx = assembler.rowIdx;
  const diag = assembler.diagIdx;
  const n = assembler.systemSize;
  const nnz = gv.length;

  // Add GMIN to diagonal
  for (let i = 0; i < assembler.numNodes; i++) {
    gv[diag[i]] += gmin;
  }

  if (method === 'euler') {
    // G_eff = G + C/dt
    const factor = 1 / dt;
    for (let i = 0; i < nnz; i++) gv[i] += factor * cv[i];

    // b_eff += (C/dt) * x(n) — CSC SpMV
    for (let j = 0; j < n; j++) {
      const xj = prevSolution[j];
      if (xj === 0) continue;
      for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
        assembler.b[rowIdx[p]] += factor * cv[p] * xj;
      }
    }
  } else {
    // Trapezoidal: G_eff = G + 2C/dt
    // b_eff = b(n+1) + b(n) + (2C/dt)*x(n) - G*x(n)
    const factor = 2 / dt;

    // Save b(n+1) before modification
    const bCurrent = new Float64Array(assembler.b);

    // Compute G*x(n) — CSC SpMV on gValues BEFORE modifying G
    const Gx = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const xj = prevSolution[j];
      if (xj === 0) continue;
      for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
        Gx[rowIdx[p]] += gv[p] * xj;
      }
    }

    // Modify G: G_eff = G + 2C/dt
    for (let i = 0; i < nnz; i++) gv[i] += factor * cv[i];

    // Build b_eff = b(n+1) + (2C/dt)*x(n) - G*x(n) + b(n)
    assembler.b.fill(0);
    for (let i = 0; i < n; i++) {
      assembler.b[i] = bCurrent[i];

      // Subtract G*x(n)
      assembler.b[i] -= Gx[i];

      // Add b(n)
      if (prevB) {
        assembler.b[i] += prevB[i];
      }
    }

    // Add (2C/dt)*x(n) — CSC SpMV
    for (let j = 0; j < n; j++) {
      const xj = prevSolution[j];
      if (xj === 0) continue;
      for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
        assembler.b[rowIdx[p]] += factor * cv[p] * xj;
      }
    }
  }
}

/**
 * Slow path: Map-of-Maps (used before lockTopology or on first iteration).
 */
function _buildCompanionSlow(
  assembler: MNAAssembler,
  dt: number,
  method: IntegrationMethod,
  prevSolution: Float64Array,
  prevB?: Float64Array,
  gmin = 1e-12,
): void {
  // Add GMIN to all node diagonals for numerical stability
  for (let i = 0; i < assembler.numNodes; i++) {
    assembler.G.add(i, i, gmin);
  }

  if (method === 'euler') {
    const factor = 1 / dt;
    assembler.G.addMatrix(assembler.C, factor);

    for (let i = 0; i < assembler.systemSize; i++) {
      const row = assembler.C.getRow(i);
      for (const [j, cval] of row) {
        assembler.b[i] += factor * cval * prevSolution[j];
      }
    }
  } else {
    const factor = 2 / dt;
    const bCurrent = new Float64Array(assembler.b);
    const Gx = new Float64Array(assembler.systemSize);
    for (let i = 0; i < assembler.systemSize; i++) {
      const row = assembler.G.getRow(i);
      for (const [j, gval] of row) {
        Gx[i] += gval * prevSolution[j];
      }
    }
    assembler.G.addMatrix(assembler.C, factor);
    assembler.b.fill(0);
    for (let i = 0; i < assembler.systemSize; i++) {
      assembler.b[i] = bCurrent[i];
      const row = assembler.C.getRow(i);
      for (const [j, cval] of row) {
        assembler.b[i] += factor * cval * prevSolution[j];
      }
      assembler.b[i] -= Gx[i];
      if (prevB) {
        assembler.b[i] += prevB[i];
      }
    }
  }
}
```

- [ ] **Step 3: Run transient tests**

Run: `cd packages/core && npx vitest run src/analysis/transient.test.ts`
Expected: PASS (companion slow path still used since transient hasn't been wired yet)

- [ ] **Step 4: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/mna/companion.ts
git commit -m "perf: add typed-array fast path to companion model"
```

---

### Task 4: Wire Transient Analysis to Use Fast Path

**Files:**
- Modify: `packages/core/src/analysis/transient.ts`

- [ ] **Step 1: Run transient tests to establish baseline**

Run: `cd packages/core && npx vitest run src/analysis/transient.test.ts`
Expected: PASS

- [ ] **Step 2: Update transient.ts**

The transient analysis has its own NR-like inner loop. Lock topology after the first companion system build. Replace the CSC conversion logic with direct `getCscMatrix()`.

Key changes:
- Remove `toCsc`, `updateCscValues`, `countNnz`, `ScatterMap`, `CscMatrix` imports
- Add: import nothing new (assembler provides getCscMatrix)
- Before the `while` loop: create solver, set `patternAnalyzed = false`
- Inside the inner NR loop, after `buildCompanionSystem`:
  - If `!assembler.isFastPath`: call `assembler.lockTopology()`
  - If `!patternAnalyzed`: call `solver.analyzePattern(assembler.getCscMatrix())`, set true
  - Call `solver.factorize(assembler.getCscMatrix())`
  - Call `solver.solve(...)`
- Remove all toCsc/updateCscValues/countNnz/scatter/prevNnz logic

The full updated imports and inner loop structure:

```typescript
import type { ResolvedOptions, TransientAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { buildCompanionSystem } from '../mna/companion.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { TimestepTooSmallError } from '../errors.js';
import { TransientResult } from '../results.js';
```

Inside `solveTransient`, before the while loop:
```typescript
  const solver = createSparseSolver();
  let patternAnalyzed = false;
```

Inside the inner for loop, replace the CSC conversion + solve block with:
```typescript
      if (!assembler.isFastPath) {
        assembler.lockTopology();
      }
      if (!patternAnalyzed) {
        solver.analyzePattern(assembler.getCscMatrix());
        patternAnalyzed = true;
      }
      solver.factorize(assembler.getCscMatrix());
      const x = solver.solve(new Float64Array(assembler.b));
```

Also update the trapezoidal `prevB` re-stamp section (after convergence) — it calls `assembler.clear()` + re-stamp, which now uses the fast path automatically.

- [ ] **Step 3: Run transient tests**

Run: `cd packages/core && npx vitest run src/analysis/transient.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/analysis/transient.ts
git commit -m "perf: wire transient analysis to typed-array fast path"
```

---

### Task 5: Wire AC Analysis to Use Fast Path

**Files:**
- Modify: `packages/core/src/analysis/ac.ts`

- [ ] **Step 1: Run AC tests to establish baseline**

Run: `cd packages/core && npx vitest run src/analysis/ac.test.ts`
Expected: PASS

- [ ] **Step 2: Update ac.ts**

AC analysis builds a combined 2n×2n matrix `[G, -ωC; ωC, G]`. The topology of this combined matrix is fixed (G and C patterns don't change across frequencies). Build the CSC structure once and update values per frequency.

Key approach:
1. After stamping at DC operating point, build the 2n×2n CSC structure from G and C patterns
2. Pre-compute index mappings: for each G entry (i,j), know where it maps in the combined matrix (4 blocks); for each C entry (i,j), know the 2 blocks
3. Per frequency: zero the combined values, fill from G values + ω×C values using the mappings, factorize, solve

Since this is more complex than the NR/transient cases, use a pragmatic approach: build a `SparseMatrix` once to discover the combined pattern, convert to CSC, then per-frequency just update the CSC values array directly via the scatter map.

```typescript
import type { ResolvedOptions, ACAnalysis } from '../types.js';
import type { CompiledCircuit } from '../circuit.js';
import { MNAAssembler } from '../mna/assembler.js';
import { SparseMatrix } from '../solver/sparse-matrix.js';
import { toCsc, type CscMatrix } from '../solver/csc-matrix.js';
import { createSparseSolver } from '../solver/sparse-solver.js';
import { ACResult } from '../results.js';
```

Before the frequency loop:
```typescript
  // Build the combined 2n×2n pattern once (using omega=1 as a representative)
  const N = 2 * systemSize;
  const patternMatrix = new SparseMatrix(N);
  for (let i = 0; i < systemSize; i++) {
    for (const [j, val] of G.getRow(i)) {
      patternMatrix.add(i, j, val);
      patternMatrix.add(i + systemSize, j + systemSize, val);
    }
  }
  for (let i = 0; i < systemSize; i++) {
    const row = C.getRow(i);
    for (const [j, cval] of row) {
      patternMatrix.add(i, j + systemSize, -cval);
      patternMatrix.add(i + systemSize, j, cval);
    }
  }
  const { csc: combinedCsc, scatter: combinedScatter } = toCsc(patternMatrix);

  // Build index arrays: for each G/C entry, store the CSC indices it maps to
  const gIdxTopLeft: { src: number; dst: number }[] = [];
  const gIdxBotRight: { src: number; dst: number }[] = [];
  const cIdxTopRight: { src: number; dst: number }[] = [];
  const cIdxBotLeft: { src: number; dst: number }[] = [];
  for (let i = 0; i < systemSize; i++) {
    for (const [j] of G.getRow(i)) {
      gIdxTopLeft.push({ src: i * systemSize + j, dst: combinedScatter.get(i * N + j)! });
      gIdxBotRight.push({ src: i * systemSize + j, dst: combinedScatter.get((i + systemSize) * N + (j + systemSize))! });
    }
    for (const [j] of C.getRow(i)) {
      cIdxTopRight.push({ src: i * systemSize + j, dst: combinedScatter.get(i * N + (j + systemSize))! });
      cIdxBotLeft.push({ src: i * systemSize + j, dst: combinedScatter.get((i + systemSize) * N + j)! });
    }
  }

  const solver = createSparseSolver();
  solver.analyzePattern(combinedCsc);
```

Per frequency:
```typescript
  for (const freq of frequencies) {
    const omega = 2 * Math.PI * freq;

    // Zero and fill combined CSC values
    combinedCsc.values.fill(0);
    for (const { src, dst } of gIdxTopLeft) {
      // Need to get G value — use assembler Map since AC only stamps once
      (combinedCsc.values as Float64Array)[dst] = G.get(Math.floor(src / systemSize), src % systemSize);
    }
    for (const { src, dst } of gIdxBotRight) {
      (combinedCsc.values as Float64Array)[dst] = G.get(Math.floor(src / systemSize), src % systemSize);
    }
    for (const { src, dst } of cIdxTopRight) {
      const cval = C.get(Math.floor(src / systemSize), src % systemSize);
      (combinedCsc.values as Float64Array)[dst] = -omega * cval;
    }
    for (const { src, dst } of cIdxBotLeft) {
      const cval = C.get(Math.floor(src / systemSize), src % systemSize);
      (combinedCsc.values as Float64Array)[dst] = omega * cval;
    }

    solver.factorize(combinedCsc);
    // ... RHS + solve + extract results (unchanged)
  }
```

This eliminates the per-frequency `new SparseMatrix(N)` + `toCsc` + Map iteration. The G/C values are read from Maps (stamped once at DC OP), but the index arrays make the combined matrix fill O(nnz) with no Map iteration in the hot loop.

- [ ] **Step 3: Run AC tests**

Run: `cd packages/core && npx vitest run src/analysis/ac.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/analysis/ac.ts
git commit -m "perf: pre-build combined CSC structure for AC frequency sweep"
```

---

### Task 6: Wire simulate.ts Streaming Paths

**Files:**
- Modify: `packages/core/src/simulate.ts`

- [ ] **Step 1: Run streaming tests to establish baseline**

Run: `cd packages/core && npx vitest run src/simulate.stream.test.ts`
Expected: PASS

- [ ] **Step 2: Update streamTransient in simulate.ts**

Apply the same changes as Task 4 (transient.ts) to the `streamTransient` generator in simulate.ts:
- Remove `toCsc`, `updateCscValues`, `countNnz` imports (keep `toCsc` if `streamAC` still needs it for combined matrix pattern)
- Replace CSC conversion logic in the inner NR loop with `assembler.lockTopology()` + `assembler.getCscMatrix()`
- Same pattern: lock after first stamp, analyzePattern once, factorize each iteration

- [ ] **Step 3: Update streamAC in simulate.ts**

Apply the same changes as Task 5 (ac.ts) to the `streamAC` generator:
- Build combined CSC pattern once before frequency loop
- Per frequency: fill combined values via index arrays, factorize, solve

- [ ] **Step 4: Clean up unused imports**

After all changes, remove any unused imports from simulate.ts (`updateCscValues`, `countNnz`, `ScatterMap`, etc.). Keep `SparseMatrix` if streamAC still uses it for building the combined pattern.

- [ ] **Step 5: Run streaming tests and full suite**

Run: `cd packages/core && npx vitest run src/simulate.stream.test.ts && npx vitest run`
Expected: ALL tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/simulate.ts
git commit -m "perf: wire streaming transient and AC to typed-array fast path"
```

---

### Task 7: Regression Verification and Benchmarks

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: ALL tests PASS

- [ ] **Step 2: Run type checker**

Run: `cd packages/core && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build and run 3-way benchmark comparison**

Run: `cd packages/core && pnpm build && cd ../.. && npx tsx benchmarks/comparison.ts`

Record the results. Compare against the pre-optimization baseline:
- Transient RC chain 10/50/100: expect 2-4x improvement
- Nonlinear CMOS inv / ring osc: expect significant improvement
- DC: expect similar or slight improvement
- AC: expect improvement from eliminating per-frequency SparseMatrix allocation

- [ ] **Step 4: Commit any final cleanup**

```bash
git commit -m "chore: typed-array stamping optimization complete"
```
