import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc, updateCscValues, type CscMatrix } from './csc-matrix.js';

describe('toCsc', () => {
  it('converts an empty matrix', () => {
    const m = new SparseMatrix(3);
    const { csc } = toCsc(m);
    expect(csc.size).toBe(3);
    expect(Array.from(csc.colPtr)).toEqual([0, 0, 0, 0]);
    expect(csc.rowIdx.length).toBe(0);
    expect(csc.values.length).toBe(0);
  });

  it('converts a diagonal matrix', () => {
    const m = new SparseMatrix(3);
    m.add(0, 0, 2);
    m.add(1, 1, 3);
    m.add(2, 2, 5);
    const { csc } = toCsc(m);
    expect(Array.from(csc.colPtr)).toEqual([0, 1, 2, 3]);
    expect(Array.from(csc.rowIdx)).toEqual([0, 1, 2]);
    expect(Array.from(csc.values)).toEqual([2, 3, 5]);
  });

  it('converts a dense 2x2 matrix', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 1); m.add(0, 1, 2);
    m.add(1, 0, 3); m.add(1, 1, 4);
    const { csc } = toCsc(m);
    expect(Array.from(csc.colPtr)).toEqual([0, 2, 4]);
    expect(Array.from(csc.rowIdx)).toEqual([0, 1, 0, 1]);
    expect(Array.from(csc.values)).toEqual([1, 3, 2, 4]);
  });

  it('sorts row indices within each column', () => {
    const m = new SparseMatrix(3);
    m.add(2, 0, 9);
    m.add(0, 0, 1);
    const { csc } = toCsc(m);
    const col0Rows = Array.from(csc.rowIdx.slice(csc.colPtr[0], csc.colPtr[1]));
    expect(col0Rows).toEqual([0, 2]);
    const col0Vals = Array.from(csc.values.slice(csc.colPtr[0], csc.colPtr[1]));
    expect(col0Vals).toEqual([1, 9]);
  });

  it('returns a scatter map for value-only updates', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 1); m.add(0, 1, 2);
    m.add(1, 0, 3); m.add(1, 1, 4);
    const { csc, scatter } = toCsc(m);
    expect(scatter.get(0 * 2 + 0)).toBe(0);
    expect(scatter.get(1 * 2 + 0)).toBe(1);
    expect(scatter.get(0 * 2 + 1)).toBe(2);
    expect(scatter.get(1 * 2 + 1)).toBe(3);
  });
});

describe('updateCscValues', () => {
  it('updates values in-place using scatter map', () => {
    const m = new SparseMatrix(2);
    m.add(0, 0, 1); m.add(0, 1, 2);
    m.add(1, 0, 3); m.add(1, 1, 4);
    const { csc, scatter } = toCsc(m);

    const m2 = new SparseMatrix(2);
    m2.add(0, 0, 10); m2.add(0, 1, 20);
    m2.add(1, 0, 30); m2.add(1, 1, 40);

    updateCscValues(csc, m2, scatter);
    expect(Array.from(csc.values)).toEqual([10, 30, 20, 40]);
  });
});
