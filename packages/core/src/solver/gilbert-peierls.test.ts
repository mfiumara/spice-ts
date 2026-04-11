import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc } from './csc-matrix.js';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';

describe('GilbertPeierlsSolver', () => {
  describe('analyzePattern', () => {
    it('accepts a diagonal matrix without error', () => {
      const m = new SparseMatrix(3);
      m.add(0, 0, 2); m.add(1, 1, 3); m.add(2, 2, 5);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      expect(() => solver.analyzePattern(csc)).not.toThrow();
    });

    it('accepts a dense 3x3 matrix', () => {
      const m = new SparseMatrix(3);
      m.add(0, 0, 1); m.add(0, 1, 2); m.add(0, 2, 3);
      m.add(1, 0, 4); m.add(1, 1, 5); m.add(1, 2, 6);
      m.add(2, 0, 7); m.add(2, 1, 8); m.add(2, 2, 0);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      expect(() => solver.analyzePattern(csc)).not.toThrow();
    });

    it('accepts a tridiagonal matrix (typical SPICE pattern)', () => {
      const n = 10;
      const m = new SparseMatrix(n);
      for (let i = 0; i < n; i++) {
        m.add(i, i, 4);
        if (i > 0) m.add(i, i - 1, -1);
        if (i < n - 1) m.add(i, i + 1, -1);
      }
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      expect(() => solver.analyzePattern(csc)).not.toThrow();
    });
  });

  describe('factorize', () => {
    it('factorizes a 2x2 system without error', () => {
      const m = new SparseMatrix(2);
      m.add(0, 0, 2); m.add(0, 1, 1);
      m.add(1, 0, 1); m.add(1, 1, 3);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      expect(() => solver.factorize(csc)).not.toThrow();
    });

    it('factorizes a diagonal matrix', () => {
      const m = new SparseMatrix(3);
      m.add(0, 0, 2); m.add(1, 1, 3); m.add(2, 2, 5);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      expect(() => solver.factorize(csc)).not.toThrow();
    });

    it('throws on singular matrix', () => {
      const m2 = new SparseMatrix(2);
      m2.add(0, 0, 1); m2.add(0, 1, 2);
      m2.add(1, 0, 1); m2.add(1, 1, 2);
      const { csc } = toCsc(m2);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      expect(() => solver.factorize(csc)).toThrow(/[Ss]ingular/);
    });

    it('throws if analyzePattern was not called', () => {
      const m = new SparseMatrix(2);
      m.add(0, 0, 1); m.add(1, 1, 1);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      expect(() => solver.factorize(csc)).toThrow(/analyzePattern/);
    });
  });

  describe('solve (end-to-end)', () => {
    it('solves a 2x2 system', () => {
      const m = new SparseMatrix(2);
      m.add(0, 0, 2); m.add(0, 1, 1);
      m.add(1, 0, 1); m.add(1, 1, 3);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);
      const x = solver.solve(new Float64Array([5, 7]));
      expect(x[0]).toBeCloseTo(1.6, 10);
      expect(x[1]).toBeCloseTo(1.8, 10);
    });

    it('solves a 3x3 system', () => {
      const m = new SparseMatrix(3);
      m.add(0, 0, 1); m.add(0, 1, 2); m.add(0, 2, 3);
      m.add(1, 0, 4); m.add(1, 1, 5); m.add(1, 2, 6);
      m.add(2, 0, 7); m.add(2, 1, 8); m.add(2, 2, 0);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);
      const x = solver.solve(new Float64Array([14, 32, 23]));
      expect(x[0]).toBeCloseTo(1, 10);
      expect(x[1]).toBeCloseTo(2, 10);
      expect(x[2]).toBeCloseTo(3, 10);
    });

    it('solves a system requiring pivoting', () => {
      const m = new SparseMatrix(2);
      m.add(0, 1, 1);
      m.add(1, 0, 1);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);
      const x = solver.solve(new Float64Array([3, 2]));
      expect(x[0]).toBeCloseTo(2, 10);
      expect(x[1]).toBeCloseTo(3, 10);
    });

    it('solves a diagonal system', () => {
      const m = new SparseMatrix(3);
      m.add(0, 0, 5); m.add(1, 1, 3); m.add(2, 2, 7);
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);
      const x = solver.solve(new Float64Array([10, 9, 21]));
      expect(x[0]).toBeCloseTo(2, 10);
      expect(x[1]).toBeCloseTo(3, 10);
      expect(x[2]).toBeCloseTo(3, 10);
    });

    it('solves a 10x10 tridiagonal system', () => {
      const n = 10;
      const m = new SparseMatrix(n);
      for (let i = 0; i < n; i++) {
        m.add(i, i, 4);
        if (i > 0) m.add(i, i - 1, -1);
        if (i < n - 1) m.add(i, i + 1, -1);
      }
      const { csc } = toCsc(m);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);

      const expected = new Float64Array(n);
      for (let i = 0; i < n; i++) expected[i] = i + 1;
      const b = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        b[i] = 4 * expected[i];
        if (i > 0) b[i] += -1 * expected[i - 1];
        if (i < n - 1) b[i] += -1 * expected[i + 1];
      }

      const x = solver.solve(b);
      for (let i = 0; i < n; i++) {
        expect(x[i]).toBeCloseTo(expected[i], 8);
      }
    });

    it('re-factorizes with new values (pattern reuse)', () => {
      const m1 = new SparseMatrix(2);
      m1.add(0, 0, 2); m1.add(0, 1, 1);
      m1.add(1, 0, 1); m1.add(1, 1, 3);
      const { csc: csc1 } = toCsc(m1);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc1);
      solver.factorize(csc1);
      const x1 = solver.solve(new Float64Array([5, 7]));
      expect(x1[0]).toBeCloseTo(1.6, 10);

      const m2 = new SparseMatrix(2);
      m2.add(0, 0, 3); m2.add(0, 1, 1);
      m2.add(1, 0, 1); m2.add(1, 1, 4);
      const { csc: csc2 } = toCsc(m2);
      solver.factorize(csc2);
      const x2 = solver.solve(new Float64Array([7, 8]));
      expect(x2[0]).toBeCloseTo(20 / 11, 10);
      expect(x2[1]).toBeCloseTo(17 / 11, 10);
    });
  });
});
