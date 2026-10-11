import { describe, expect, it } from 'vitest';
import { amdOrdering } from './amd-ordering.js';
import { toCsc } from './csc-matrix.js';
import { SparseMatrix } from './sparse-matrix.js';

function expectPermutation(order: Int32Array, n: number): void {
  expect(order.length).toBe(n);
  expect(Array.from(order).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
}

describe('amdOrdering', () => {
  it('returns an empty ordering for an empty matrix', () => {
    expect(amdOrdering({ size: 0, colPtr: new Int32Array(1), rowIdx: new Int32Array(0), values: new Float64Array(0) }).length)
      .toBe(0);
  });

  it('keeps the natural order of a fill-free tridiagonal pattern', () => {
    const n = 12;
    const matrix = new SparseMatrix(n);
    for (let i = 0; i < n; i++) {
      matrix.add(i, i, 2);
      if (i > 0) matrix.add(i, i - 1, -1);
      if (i + 1 < n) matrix.add(i, i + 1, -1);
    }
    expect(Array.from(amdOrdering(toCsc(matrix).csc))).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it('defers a star centre until it is no denser than a leaf', () => {
    const n = 6;
    const matrix = new SparseMatrix(n);
    for (let i = 0; i < n; i++) matrix.add(i, i, 1);
    for (let leaf = 1; leaf < n; leaf++) {
      matrix.add(0, leaf, -1);
      matrix.add(leaf, 0, -1);
    }
    const order = amdOrdering(toCsc(matrix).csc);
    expectPermutation(order, n);
    // With one leaf left, centre and leaf both have degree 1.
    expect(Array.from(order).indexOf(0)).toBeGreaterThanOrEqual(n - 2);
  });

  it('uses the symmetric pattern of a structurally unsymmetric matrix', () => {
    // Only A[i][i+1] is present (gain chain); Aᵀ supplies the other side.
    const n = 8;
    const matrix = new SparseMatrix(n);
    for (let i = 0; i < n; i++) {
      matrix.add(i, i, 1);
      if (i + 1 < n) matrix.add(i, i + 1, 5);
    }
    expect(Array.from(amdOrdering(toCsc(matrix).csc))).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it('orders dense rows last and still returns a full permutation', () => {
    // A supply rail touching every other variable exceeds the dense threshold.
    const n = 400;
    const rail = 7;
    const matrix = new SparseMatrix(n);
    for (let i = 0; i < n; i++) {
      matrix.add(i, i, 4);
      if (i + 1 < n) { matrix.add(i, i + 1, -1); matrix.add(i + 1, i, -1); }
      if (i !== rail) { matrix.add(rail, i, -1); matrix.add(i, rail, -1); }
    }
    const order = amdOrdering(toCsc(matrix).csc);
    expectPermutation(order, n);
    expect(order[n - 1]).toBe(rail);
  });

  it('returns a valid permutation for disconnected and isolated variables', () => {
    const matrix = new SparseMatrix(5);
    matrix.add(0, 0, 1);
    matrix.add(3, 4, 1); matrix.add(4, 3, 1);
    matrix.touch(1, 1);
    const order = amdOrdering(toCsc(matrix).csc);
    expectPermutation(order, 5);
  });
});
