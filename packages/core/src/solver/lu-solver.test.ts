import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { solveLU } from './lu-solver.js';

describe('solveLU', () => {
  it('solves a 2x2 system', () => {
    const A = new SparseMatrix(2);
    A.add(0, 0, 2); A.add(0, 1, 1);
    A.add(1, 0, 1); A.add(1, 1, 3);
    const b = new Float64Array([5, 7]);
    const x = solveLU(A, b);
    expect(x[0]).toBeCloseTo(1.6, 10);
    expect(x[1]).toBeCloseTo(1.8, 10);
  });

  it('solves a 3x3 system', () => {
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
    const A = new SparseMatrix(2);
    A.add(0, 1, 1);
    A.add(1, 0, 1);
    const b = new Float64Array([3, 2]);
    const x = solveLU(A, b);
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('solves sparse system (many zeros)', () => {
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
