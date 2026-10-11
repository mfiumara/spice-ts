import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc, type CscMatrix } from './csc-matrix.js';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';
import { SingularMatrixError } from '../errors.js';

/** Issue #486: skip the numeric factorization when A is bit-identical to the last factorized A. */

function ladder(n: number): CscMatrix {
  const m = new SparseMatrix(n);
  for (let i = 0; i < n; i++) {
    m.add(i, i, 2 + i * 1e-3);
    if (i + 1 < n) {
      m.add(i, i + 1, -1);
      m.add(i + 1, i, -1);
    }
  }
  return toCsc(m).csc;
}

function rhs(n: number): Float64Array {
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.sin(i + 1);
  return b;
}

function freshSolve(A: CscMatrix, b: Float64Array): Float64Array {
  const solver = new GilbertPeierlsSolver();
  solver.analyzePattern(A);
  solver.factorize(A);
  return solver.solve(new Float64Array(b));
}

describe('GilbertPeierlsSolver numeric factor reuse', () => {
  it('reuses the factors when the values are bit-identical, including an in-place rewrite', () => {
    const A = ladder(50);
    const b = rhs(50);
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(A);
    solver.factorize(A);
    const first = solver.solve(new Float64Array(b));
    expect(solver.numericFactorizations).toBe(1);

    // The assembler clears and re-stamps the same array every Newton iteration.
    const copy = new Float64Array(A.values);
    A.values.fill(0);
    A.values.set(copy);
    solver.factorize(A);
    expect(solver.numericFactorizations).toBe(1);
    const second = solver.solve(new Float64Array(b));
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it('refactorizes when any value changes and the solution matches a fresh solver bit for bit', () => {
    const A = ladder(50);
    const b = rhs(50);
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(A);
    solver.factorize(A);
    solver.solve(new Float64Array(b));

    const last = A.colPtr[A.size] - 1;
    A.values[last] += 1e-15;
    solver.factorize(A);
    expect(solver.numericFactorizations).toBe(2);
    const reused = solver.solve(new Float64Array(b));
    expect(Array.from(reused)).toEqual(Array.from(freshSolve(A, b)));
  });

  it('treats a signed-zero flip as a change', () => {
    // [[2, 0], [1, 3]] with the (0, 1) structural entry stored explicitly.
    const csc: CscMatrix = {
      size: 2,
      colPtr: Int32Array.from([0, 2, 4]),
      rowIdx: Int32Array.from([0, 1, 0, 1]),
      values: Float64Array.from([2, 1, 0, 3]),
    };
    const zero = 2;
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(csc);
    csc.values[zero] = 0;
    solver.factorize(csc);
    csc.values[zero] = -0;
    solver.factorize(csc);
    expect(solver.numericFactorizations).toBe(2);
  });

  it('does not reuse after a failed factorization', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 1); m.add(0, 1, 1); m.add(1, 0, 1); m.add(1, 1, 1);
    const { csc } = toCsc(m);
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(csc);
    expect(() => solver.factorize(csc)).toThrow(SingularMatrixError);
    expect(() => solver.factorize(csc)).toThrow(SingularMatrixError);
    expect(() => solver.solve(new Float64Array(2))).toThrow(/factorize/);
  });

  it('does not reuse across analyzePattern or a different pattern', () => {
    const A = ladder(20);
    const solver = new GilbertPeierlsSolver();
    solver.analyzePattern(A);
    solver.factorize(A);
    solver.analyzePattern(A);
    solver.factorize(A);
    expect(solver.numericFactorizations).toBe(2);

    // Same values array, different structure arrays: never trust the cache.
    const B: CscMatrix = {
      size: A.size,
      colPtr: new Int32Array(A.colPtr),
      rowIdx: new Int32Array(A.rowIdx),
      values: A.values,
    };
    solver.factorize(B);
    expect(solver.numericFactorizations).toBe(3);
  });
});
