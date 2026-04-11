# Sparse LU Solver with Gilbert-Peierls Factorization

**Date:** 2026-04-11
**Status:** Draft
**ROADMAP ref:** Issue #8 — Sparse LU solver (replace dense O(n³))

## Summary

Replace the dense O(n³) LU solver with a sparse Gilbert-Peierls implementation, backed by a CSC (Compressed Sparse Column) matrix format. The solver splits work into a **symbolic phase** (once per circuit topology) and a **numeric phase** (every Newton-Raphson step), exploiting the fact that SPICE matrix sparsity patterns are fixed within a simulation. A `SparseSolver` interface provides the abstraction boundary for a future KLU WASM plugin.

## Goals

- **Performance**: O(nnz of L+U) per solve instead of O(n³) — enables 50–300+ node circuits
- **WASM-ready**: `SparseSolver` interface designed so a KLU WASM plugin is a drop-in replacement
- **Zero regression**: all existing tests pass with identical results
- **Zero dependency**: pure TypeScript, no external libraries

## Non-Goals

- KLU WASM plugin (future work — separate spec)
- Changing the assembly path (Map-of-Maps stamping stays as-is)
- Fill-reducing reordering (AMD/nested dissection — future optimization)
- Direct CSC stamping (eliminating Map-of-Maps entirely — future optimization)

---

## Architecture

### Three-Layer Design

```
Assembly (unchanged)          Compute representation       Solver
────────────────────          ─────────────────────        ──────────
SparseMatrix                  CscMatrix                    SparseSolver (interface)
Map-of-Maps                   typed arrays                   ├── GilbertPeierlsSolver (TS)
Good for incremental   ──▶   colPtr/rowIdx/values    ──▶    └── KluWasmSolver (future)
stamping                      Good for factorization
```

The existing `SparseMatrix` (Map-of-Maps) remains the assembly format — devices stamp into it via `StampContext`. Before each solve, it is converted to `CscMatrix` (typed arrays). The `SparseSolver` operates exclusively on `CscMatrix`.

### Key Insight: Pattern Reuse

In Newton-Raphson iteration, the MNA matrix `G` is cleared and re-stamped every step. The sparsity pattern (which positions are non-zero) never changes — same devices, same topology. Only the values change as nonlinear devices update their linearizations.

This means:
- **Symbolic factorization** (DFS to predict fill-in): runs **once** per simulation
- **Numeric factorization** (compute L and U values): runs **every Newton step**

For AC analysis, `G` and `C` are both fixed at the DC operating point. The combined 2n×2n real matrix has a fixed pattern across all frequency points — symbolic once, numeric per frequency.

---

## CscMatrix Storage Format

Compressed Sparse Column — the industry standard for sparse direct solvers.

```typescript
interface CscMatrix {
  readonly size: number;          // n×n dimension
  readonly colPtr: Int32Array;    // length n+1; entries for column j at indices colPtr[j]..colPtr[j+1]-1
  readonly rowIdx: Int32Array;    // length nnz; row index of each non-zero
  readonly values: Float64Array;  // length nnz; corresponding values
}
```

### Example

```
Matrix:              CSC representation:
[2  0  1]            colPtr = [0, 2, 3, 5]
[0  3  0]            rowIdx = [0, 2, 1, 0, 2]
[4  0  5]            values = [2, 4, 3, 1, 5]
```

### Conversion from Map-of-Maps

`toCsc(sparse: SparseMatrix): { csc: CscMatrix, scatter: ScatterMap }` — iterate by column, count nnz per column, build typed arrays. O(nnz).

### ScatterMap for Value-Only Updates

On the first conversion, we build a `ScatterMap` — maps `(row, col)` to CSC array index. On subsequent Newton-Raphson iterations, instead of rebuilding CSC from scratch, we zero the values array and scatter new values into their pre-computed CSC positions. O(nnz) with no structural allocation.

```typescript
type ScatterMap = Map<number, number>;  // (row * size + col) → CSC index
// Encoding safe for size ≤ 46340 (sqrt(2^31)); well beyond target range of ≤ 300 nodes
```

---

## SparseSolver Interface

```typescript
interface SparseSolver {
  /** Analyze sparsity pattern — call once per circuit topology */
  analyzePattern(A: CscMatrix): void;

  /** Numeric factorization — call each Newton step (same pattern, new values) */
  factorize(A: CscMatrix): void;

  /** Solve Ax = b, returns solution vector */
  solve(b: Float64Array): Float64Array;
}

/** Factory — returns GilbertPeierlsSolver now, KluWasmSolver later */
function createSparseSolver(): SparseSolver;
```

Three methods, stateful. The solver holds the symbolic structure and numeric factors internally. The interface is intentionally minimal — a KLU WASM plugin implements these three methods and nothing else.

---

## Gilbert-Peierls Algorithm

### Symbolic Phase (`analyzePattern`)

For each column j = 0..n-1:
1. DFS through the existing non-zero structure of A to compute the "reach" — which rows will have non-zeros in L[:,j] and U[j,:] after fill-in
2. Record the topological ordering for the numeric phase

Output: pre-sized `Int32Array`/`Float64Array` for L and U factors, plus a row permutation array for pivoting. Complexity: O(nnz of L+U).

### Numeric Phase (`factorize`)

For each column j in topological order:
1. Sparse triangular solve: scatter column j of A into a dense work vector, then subtract contributions from earlier columns of L using the symbolic structure
2. Apply threshold pivoting: if `|diag| < threshold × |max_in_column|`, swap rows
3. Scale L column by 1/pivot, store U row values

Uses the pre-allocated structure from the symbolic phase — **no allocation**. Complexity: O(nnz of L+U).

### Solve Phase (`solve`)

1. Forward substitution: Ly = Pb (sparse, using CSC structure of L)
2. Backward substitution: Ux = y (sparse, using CSC structure of U)

Complexity: O(nnz of L+U).

### Pivoting Strategy

Full partial pivoting would invalidate the symbolic factorization. Threshold pivoting is the standard compromise:
- Within each column's symbolic pattern, check if `|diag| < threshold × |max_in_column|`
- If so, swap the diagonal row with the maximum row
- The symbolic structure is computed as a superset that accommodates possible row swaps

In practice, SPICE matrices are near-diagonally-dominant due to GMIN (added to all diagonals). Pivots are rare.

---

## Integration

### Newton-Raphson

No signature change to `newtonRaphson()`. The solver is created inside and reused across iterations:

```typescript
export function newtonRaphson(assembler, devices, options, maxIter, nodeNames): number {
  const solver = createSparseSolver();
  let patternAnalyzed = false;

  for (let iter = 0; iter < maxIter; iter++) {
    assembler.saveSolution();
    assembler.clear();
    // ... stamp devices, add GMIN ...

    const csc = toCsc(assembler.G);
    if (!patternAnalyzed) {
      solver.analyzePattern(csc);
      patternAnalyzed = true;
    }
    solver.factorize(csc);
    const x = solver.solve(new Float64Array(assembler.b));
    assembler.solution.set(x);
    // ... convergence check ...
  }
}
```

First iteration pays for symbolic analysis. Iterations 2+ are numeric-only.

### AC Analysis

The 2n×2n real matrix doubling strategy is kept. Since G and C are fixed per operating point, the combined pattern is identical across all frequency points:

```typescript
// Before frequency sweep:
solver.analyzePattern(combined2n);    // once

// Per frequency:
updateCombinedValues(combined2n, G, C, omega);
solver.factorize(combined2n);
const x = solver.solve(b);
```

Symbolic factorization runs once for the entire AC sweep — major win for sweeps with hundreds of frequency points.

### What Stays the Same

- `SparseMatrix` class — unchanged
- `MNAAssembler` — unchanged
- `StampContext` — unchanged
- All device `stamp()` methods — unchanged
- `solveComplexLU` external signature — unchanged (internally delegates to SparseSolver)

---

## File Organization

All changes within `packages/core/src/solver/`:

```
solver/
  sparse-matrix.ts        (existing — unchanged)
  sparse-matrix.test.ts   (existing — unchanged)
  lu-solver.ts            (existing — solveLU/solveComplexLU become wrappers around SparseSolver)
  lu-solver.test.ts       (existing — tests still pass, now exercising sparse path)
  csc-matrix.ts           (new — CscMatrix type, toCsc(), ScatterMap, updateCscValues)
  csc-matrix.test.ts      (new)
  sparse-solver.ts        (new — SparseSolver interface, createSparseSolver factory)
  gilbert-peierls.ts      (new — GilbertPeierlsSolver implementation)
  gilbert-peierls.test.ts (new)
```

Three new source files, three new test files. One existing file updated (`lu-solver.ts`). One existing file updated (`newton-raphson.ts`).

---

## Testing Strategy

### CscMatrix (`csc-matrix.test.ts`)

- Round-trip: Map-of-Maps → CSC → dense matches original matrix
- Empty matrix, single element, full diagonal
- ScatterMap: value-only update produces correct CSC values
- Column ordering is correct (rowIdx sorted within each column)

### Gilbert-Peierls (`gilbert-peierls.test.ts`)

- Known small systems: 2×2, 3×3, 5×5 — verify solve produces correct x for known Ax = b
- Verify L × U = P × A (factorization correctness)
- Matrix requiring threshold pivot: off-diagonal dominant column still solves correctly
- Singular matrix: throws `SingularMatrixError` (same as current behavior)
- Identity matrix: trivial case works
- Tridiagonal matrix: typical SPICE-like sparsity pattern

### Regression (existing test suites)

All existing tests pass unchanged — DC, transient, AC, DC sweep, BSIM3, subcircuit expansion. These are the real correctness tests. If the sparse solver produces identical results on every existing circuit, it works.

### Benchmarks

Compare old dense vs new sparse on existing benchmark circuits:
- Diff pair (BJT DC)
- RC ladder 5-stage (AC)
- One-stage OTA (DC)
- CMOS inverter (transient)
- Bandpass RLC (AC)

Expect visible improvement on larger circuits, parity or slight overhead on very small ones (n < 10).
