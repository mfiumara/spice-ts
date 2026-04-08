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
    expect(a.get(0, 0)).toBe(2);
    expect(a.get(1, 1)).toBe(1.5);
  });
});
