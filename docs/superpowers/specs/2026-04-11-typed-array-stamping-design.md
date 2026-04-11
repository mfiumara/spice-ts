# Typed-Array Stamping Optimization

**Date:** 2026-04-11
**Status:** Draft

## Summary

Replace the Map-of-Maps stamping path with direct typed-array writes into pre-allocated CSC buffers. After circuit topology is known (first NR iteration), devices stamp directly into `Float64Array` slots via pre-computed index lookups. Eliminates Map overhead, CSC conversion, and GC pressure from the hot loop.

## Goals

- **Performance**: Eliminate Map-of-Maps overhead from Newton-Raphson inner loop — targeting 2-4x speedup on transient/AC to match or beat eecircuit-WASM
- **Zero allocation**: No object creation, no Map operations, no CSC conversion per NR iteration after the first
- **Backward compatible**: Device `stamp()` methods unchanged, `StampContext` interface unchanged

## Non-Goals

- Changing device model implementations
- Changing the `SparseSolver` interface
- Changing the CSC matrix format
- Optimizing the first NR iteration (topology discovery)

---

## Architecture

### Two-Phase Stamping

**Phase 1 — Topology Discovery (first NR iteration):**

Use the existing Map-of-Maps path to discover all `(row, col)` positions that devices stamp. Build the CSC structure (colPtr, rowIdx) and position lookup tables from this. This runs once per simulation.

**Phase 2 — Fast Path (iterations 2+):**

Devices stamp directly into `Float64Array` CSC value buffers via pre-computed index lookups. No Maps, no conversion, no allocation.

```
Phase 1 (once):
  Map-based stamp → discover positions → build CSC structure + lookup tables

Phase 2 (every subsequent iteration):
  gValues.fill(0) → device.stamp() via array[idx] += val → factorize(csc)
```

### Shared CSC Structure for G and C

Both G and C use the same CSC column structure (colPtr, rowIdx) built from the union of all stamp positions across both matrices. C's value array has zeros at positions where only G stamps. This enables:

```typescript
// Companion model: G_eff = G + C/dt
for (let i = 0; i < nnz; i++) gValues[i] += factor * cValues[i];
```

No index mapping, no Map iteration — a single tight loop over typed arrays.

---

## MNAAssembler Changes

### New Fields

```typescript
class MNAAssembler {
  // Existing (kept for Phase 1)
  public readonly G: SparseMatrix;
  public readonly C: SparseMatrix;
  public readonly b: Float64Array;
  public readonly solution: Float64Array;
  public readonly prevSolution: Float64Array;

  // New: fast-path typed-array stamping (populated after first iteration)
  private gValues: Float64Array | null = null;
  private cValues: Float64Array | null = null;
  private cscColPtr: Int32Array | null = null;
  private cscRowIdx: Int32Array | null = null;
  private posMap: Int32Array | null = null;  // (row * n + col) → CSC index
  private fastPath = false;
}
```

### Position Lookup

`posMap` is an `Int32Array` of size `n * n` where `posMap[row * n + col]` gives the CSC values index for that position, or `-1` if the position is not in the sparsity pattern. For n ≤ 1000, this is at most 4MB — acceptable for the performance gain.

For larger circuits (n > 1000), a `Map<number, number>` fallback can be used, but this is well beyond the current target range.

### StampContext Fast Path

```typescript
getStampContext(): StampContext {
  if (this.fastPath) {
    const gv = this.gValues!;
    const cv = this.cValues!;
    const pm = this.posMap!;
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
  // ... existing Map-based path for Phase 1
}
```

### Topology Lock-in

After the first NR iteration completes stamping:

1. Build CSC structure from the union of G and C Map-of-Maps positions
2. Build `posMap` lookup table
3. Allocate `gValues` and `cValues` arrays
4. Set `fastPath = true`
5. All subsequent `clear()` calls do `gValues.fill(0); cValues.fill(0); b.fill(0)` instead of `G.clear(); C.clear()`

### CscMatrix Access

```typescript
getCscMatrix(): CscMatrix {
  return {
    size: this.systemSize,
    colPtr: this.cscColPtr!,
    rowIdx: this.cscRowIdx!,
    values: this.gValues!,  // direct reference, no copy
  };
}
```

The solver factorizes this directly — no `toCsc`, no `updateCscValues`.

---

## Companion Model Changes

`buildCompanionSystem` in `mna/companion.ts` currently iterates Map entries for `G.addMatrix(C, factor)` and `C.getRow(i)` for RHS terms. With typed arrays:

### Euler: `G_eff = G + C/dt`

```typescript
const gv = assembler.gValues!;
const cv = assembler.cValues!;
const factor = 1 / dt;
for (let i = 0; i < gv.length; i++) gv[i] += factor * cv[i];
```

### RHS: `b_eff += (C/dt) * x(n)`

Sparse matrix-vector multiply using CSC structure directly:

```typescript
const colPtr = assembler.cscColPtr!;
const rowIdx = assembler.cscRowIdx!;
for (let j = 0; j < n; j++) {
  const xj = prevSolution[j];
  for (let p = colPtr[j]; p < colPtr[j + 1]; p++) {
    assembler.b[rowIdx[p]] += factor * cv[p] * xj;
  }
}
```

### Trapezoidal

Same pattern — typed-array loops replace Map iteration for all G*x(n) and C-based terms.

---

## Analysis Loop Simplification

### Newton-Raphson (after topology lock-in)

```typescript
for (let iter = 0; iter < maxIter; iter++) {
  assembler.saveSolution();
  assembler.clearFast();              // gValues.fill(0), cValues.fill(0), b.fill(0)

  const ctx = assembler.getStampContext();  // returns fast-path context
  for (const device of devices) device.stamp(ctx);
  // GMIN
  for (let i = 0; i < assembler.numNodes; i++) {
    assembler.stampGDiag(i, options.gmin);  // gValues[diagIdx[i]] += gmin
  }

  if (!patternAnalyzed) {
    solver.analyzePattern(assembler.getCscMatrix());
    patternAnalyzed = true;
  }
  solver.factorize(assembler.getCscMatrix());
  const x = solver.solve(new Float64Array(assembler.b));
  assembler.solution.set(x);
  // ... convergence check
}
```

No `toCsc`, no `updateCscValues`, no `countNnz`, no `ScatterMap`. The CSC matrix is always up-to-date because devices stamp directly into it.

### Transient and AC

Same simplification — the companion model works on typed arrays, the solver reads the CSC directly.

---

## File Changes

All changes within `packages/core/src/`:

```
mna/
  assembler.ts        (modify — add typed-array fields, fast-path StampContext,
                       topology lock-in, getCscMatrix())
  companion.ts        (modify — typed-array companion arithmetic)

analysis/
  newton-raphson.ts   (simplify — remove toCsc/updateCscValues/countNnz)
  transient.ts        (simplify — same)
  ac.ts               (simplify — same)

simulate.ts           (simplify — streaming paths)

solver/
  csc-matrix.ts       (keep toCsc for initial build; updateCscValues/countNnz become unused hot-path code)
```

No new files. `SparseMatrix` stays for Phase 1 topology discovery.

---

## Testing

- **All existing tests pass** — functional behavior identical, only internal representation changes
- **Benchmark validation** — `pnpm bench:compare` shows transient/AC improvement
- **No new unit tests** — the optimization is internal, validated by circuit-level correctness tests

The correctness contract: same devices, same stamp values, same positions → same CSC matrix → same solution. The optimization changes HOW values reach the CSC array, not WHAT values.

---

## Expected Impact

| Analysis | Current bottleneck | After optimization |
|---|---|---|
| DC (.op) | Already fast (sparse LU) | Marginal improvement |
| Transient | Map stamping + CSC conversion per NR iter | 2-4x faster (typed-array stamp + no conversion) |
| AC | Map stamping + CSC conversion per frequency | 2-4x faster |
| Nonlinear | Map stamping dominates small-circuit time | Significant improvement |
