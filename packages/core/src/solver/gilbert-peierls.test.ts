import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc } from './csc-matrix.js';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';
import { SingularMatrixError } from '../errors.js';

/** Stamp a row-major side×side resistor grid (1 mS edges, 1 mS to ground per node). */
function stampGrid(matrix: SparseMatrix, side: number): void {
  const g = 1e-3;
  const index = (row: number, col: number) => row * side + col;
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const i = index(row, col);
      matrix.add(i, i, g);
      const neighbours: number[] = [];
      if (col + 1 < side) neighbours.push(index(row, col + 1));
      if (row + 1 < side) neighbours.push(index(row + 1, col));
      for (const j of neighbours) {
        matrix.add(i, i, g); matrix.add(j, j, g);
        matrix.add(i, j, -g); matrix.add(j, i, -g);
      }
    }
  }
}

/** Grid system with a known solution x[i] = 1 + (i mod 7). */
function gridSystem(side: number) {
  const n = side * side;
  const matrix = new SparseMatrix(n);
  stampGrid(matrix, side);
  const { csc } = toCsc(matrix);
  const expected = new Float64Array(n);
  for (let i = 0; i < n; i++) expected[i] = 1 + (i % 7);
  const b = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    for (let p = csc.colPtr[j]; p < csc.colPtr[j + 1]; p++) {
      b[csc.rowIdx[p]] += csc.values[p] * expected[j];
    }
  }
  return { csc, b, expected };
}

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

    it('throws a typed error with structural node identity on a singular pivot', () => {
      const m2 = new SparseMatrix(2);
      m2.add(0, 0, 1); m2.add(0, 1, 2);
      m2.add(1, 0, 1); m2.add(1, 1, 2);
      const { csc } = toCsc(m2);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc, [
        { kind: 'node', name: 'in' },
        { kind: 'node', name: 'floating' },
      ]);

      let thrown: unknown;
      try {
        solver.factorize(csc);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(SingularMatrixError);
      expect(thrown).toMatchObject({
        involvedNodes: ['floating'],
        involvedBranches: [],
        pivotIndex: 1,
      });
    });

    it('rejects a selected pivot below the absolute singularity threshold', () => {
      const matrix = new SparseMatrix(2);
      matrix.add(0, 0, 2e-19);
      matrix.add(1, 0, 1e-18);
      matrix.add(1, 1, 1);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc, [
        { kind: 'node', name: 'tiny' },
        { kind: 'node', name: 'stable' },
      ]);

      let thrown: unknown;
      try {
        solver.factorize(csc);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(SingularMatrixError);
      expect(thrown).toMatchObject({
        involvedNodes: ['tiny'],
        involvedBranches: [],
        pivotIndex: 0,
      });
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
    it('matches exact 2x2 solutions and singular classification exhaustively', () => {
      const coefficients = [-1, 0, 1];
      const expected = [2, -3] as const;

      for (const a of coefficients) {
        for (const b of coefficients) {
          for (const c of coefficients) {
            for (const d of coefficients) {
              const matrix = new SparseMatrix(2);
              matrix.touch(0, 0); matrix.touch(0, 1);
              matrix.touch(1, 0); matrix.touch(1, 1);
              matrix.add(0, 0, a); matrix.add(0, 1, b);
              matrix.add(1, 0, c); matrix.add(1, 1, d);
              const { csc } = toCsc(matrix);
              const solver = new GilbertPeierlsSolver();
              solver.analyzePattern(csc);

              if (a * d - b * c === 0) {
                expect(() => solver.factorize(csc)).toThrow(SingularMatrixError);
                continue;
              }

              solver.factorize(csc);
              const solution = solver.solve(new Float64Array([
                a * expected[0] + b * expected[1],
                c * expected[0] + d * expected[1],
              ]));
              expect(Array.from(solution)).toEqual(expected);
            }
          }
        }
      }
    });

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

    it('grows numeric factors when row pivoting exceeds the symbolic row-order estimate', () => {
      const matrix = new SparseMatrix(3);
      matrix.add(0, 2, -1);
      matrix.add(1, 1, -1);
      matrix.add(1, 2, -1);
      matrix.add(2, 0, -1);
      matrix.add(2, 1, -1);
      matrix.add(2, 2, -1);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);

      const solution = solver.solve(new Float64Array([-3, -5, -6]));

      expect(Array.from(solution)).toEqual([1, 2, 3]);
    });

    it('does not retain duplicate row-index workspaces for numeric factors', () => {
      const matrix = new SparseMatrix(3);
      matrix.add(0, 2, -1);
      matrix.add(1, 1, -1);
      matrix.add(1, 2, -1);
      matrix.add(2, 0, -1);
      matrix.add(2, 1, -1);
      matrix.add(2, 2, -1);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);

      const storage = solver as unknown as {
        lTempOrigRows?: Int32Array;
        pivotOrigRow?: Int32Array;
      };
      expect(storage.lTempOrigRows).toBeUndefined();
      expect(storage.pivotOrigRow).toBeUndefined();

      solver.factorize(csc);
      expect(Array.from(solver.solve(new Float64Array([-3, -5, -6])))).toEqual([1, 2, 3]);
    });

    it('eliminates fill that activates a structurally-zero pivot row', () => {
      const matrix = new SparseMatrix(3);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) matrix.touch(row, col);
      }
      matrix.add(0, 0, 1);
      matrix.add(0, 1, -1);
      matrix.add(0, 2, -1);
      matrix.add(1, 0, -1);
      matrix.add(1, 1, -1);
      matrix.add(2, 0, -1);
      matrix.add(2, 1, -1);
      matrix.add(2, 2, -1);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);

      const solution = solver.solve(new Float64Array([-4, -3, -6]));

      expect(Array.from(solution)).toEqual([1, 2, 3]);
    });

    it('solves the upper-triangular matrix stamped by the VCCS/R/I repro deck', () => {
      const matrix = new SparseMatrix(2);
      matrix.add(0, 0, 1e-3);
      matrix.add(0, 1, -1e-3);
      matrix.add(1, 1, 1e-3);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);

      const solution = solver.solve(new Float64Array([1e-3, 0]));

      expect(solution[0]).toBeCloseTo(1, 12);
      expect(solution[1]).toBeCloseTo(0, 12);
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

    it('skips a redundant full workspace clear after successful factorization', () => {
      const matrix = new SparseMatrix(2);
      matrix.add(0, 0, 2); matrix.add(0, 1, 1);
      matrix.add(1, 0, 1); matrix.add(1, 1, 3);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);

      const storage = solver as unknown as { workspace: Float64Array };
      const originalFill = storage.workspace.fill;
      let fillCalls = 0;
      Object.defineProperty(storage.workspace, 'fill', {
        value(value: number): Float64Array {
          fillCalls++;
          return originalFill.call(this, value);
        },
      });

      solver.factorize(csc);

      expect(fillCalls).toBe(0);
      expect(Array.from(solver.solve(new Float64Array([5, 7])))).toEqual([1.6, 1.8]);
    });

    it('reuses the caller-owned RHS as the solve output workspace', () => {
      const matrix = new SparseMatrix(2);
      matrix.add(0, 0, 2); matrix.add(0, 1, 1);
      matrix.add(1, 0, 1); matrix.add(1, 1, 3);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);
      solver.factorize(csc);
      const rhs = new Float64Array([5, 7]);

      const solution = solver.solve(rhs);

      expect(solution).toBe(rhs);
      expect(solution[0]).toBeCloseTo(1.6, 10);
      expect(solution[1]).toBeCloseTo(1.8, 10);
    });

    it('reuses the numeric factor workspace for repeated solves', () => {
      const matrix = new SparseMatrix(2);
      matrix.add(0, 0, 2); matrix.add(0, 1, 1);
      matrix.add(1, 0, 1); matrix.add(1, 1, 3);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);

      const storage = solver as unknown as { workY?: Float64Array };
      expect(storage.workY).toBeUndefined();

      solver.factorize(csc);
      expect(Array.from(solver.solve(new Float64Array([5, 7])))).toEqual([1.6, 1.8]);
      expect(Array.from(solver.solve(new Float64Array([8, 9])))).toEqual([3, 2]);
    });

    it('does not retain a separate U-diagonal index workspace', () => {
      const matrix = new SparseMatrix(3);
      matrix.add(0, 0, 1); matrix.add(0, 1, 2); matrix.add(0, 2, 3);
      matrix.add(1, 0, 4); matrix.add(1, 1, 5); matrix.add(1, 2, 6);
      matrix.add(2, 0, 7); matrix.add(2, 1, 8);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);

      const storage = solver as unknown as { uDiagIdx?: Int32Array };
      expect(storage.uDiagIdx).toBeUndefined();

      solver.factorize(csc);
      expect(Array.from(solver.solve(new Float64Array([14, 32, 23])))).toEqual([1, 2, 3]);
    });

    it('uses pivot state to track active factor columns', () => {
      const matrix = new SparseMatrix(3);
      matrix.add(0, 0, 1); matrix.add(0, 1, -1); matrix.add(0, 2, -1);
      matrix.add(1, 0, -1); matrix.add(1, 1, -1);
      matrix.add(2, 0, -1); matrix.add(2, 1, -1); matrix.add(2, 2, -1);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc);

      const storage = solver as unknown as { activeFlag?: Int32Array };
      expect(storage.activeFlag).toBeUndefined();

      solver.factorize(csc);
      expect(Array.from(solver.solve(new Float64Array([-4, -3, -6])))).toEqual([1, 2, 3]);
    });

    it('recovers its numeric workspace after a singular value change', () => {
      const singular = new SparseMatrix(2);
      singular.touch(0, 0); singular.touch(0, 1);
      singular.touch(1, 0); singular.touch(1, 1);
      singular.add(0, 0, 1); singular.add(0, 1, 2);
      singular.add(1, 0, 1); singular.add(1, 1, 2);
      const { csc: singularCsc } = toCsc(singular);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(singularCsc);

      const initial = new SparseMatrix(2);
      initial.add(0, 0, 2); initial.add(0, 1, 1);
      initial.add(1, 0, 1); initial.add(1, 1, 3);
      const { csc: initialCsc } = toCsc(initial);
      solver.factorize(initialCsc);
      expect(() => solver.factorize(singularCsc)).toThrow(SingularMatrixError);
      expect(() => solver.solve(new Float64Array([5, 7]))).toThrow(/factorize/);

      const recovered = new SparseMatrix(2);
      recovered.add(0, 0, 2); recovered.add(0, 1, 1);
      recovered.add(1, 0, 1); recovered.add(1, 1, 3);
      const { csc: recoveredCsc } = toCsc(recovered);
      solver.factorize(recoveredCsc);

      const solution = solver.solve(new Float64Array([5, 7]));
      expect(solution[0]).toBeCloseTo(1.6, 10);
      expect(solution[1]).toBeCloseTo(1.8, 10);
    });

    it('keeps 2-D grid fill near n·log n with the fill-reducing column ordering (#444)', () => {
      // Row-major 2-D Laplacian: natural order fills to the bandwidth (side),
      // so nnz(L+U) grows like 2·n·side. A minimum-degree ordering keeps it
      // near O(n·log n).
      const side = 40;
      const n = side * side;
      const { csc, b, expected } = gridSystem(side);

      const natural = new GilbertPeierlsSolver({ ordering: 'natural' });
      natural.analyzePattern(csc);
      natural.factorize(csc);
      const naturalNnz = natural.factorNonzeros();

      const ordered = new GilbertPeierlsSolver();
      ordered.analyzePattern(csc);
      ordered.factorize(csc);
      const orderedNnz = ordered.factorNonzeros();

      expect(naturalNnz).toBeGreaterThan(n * side);
      // SuperLU's MMD on A+Aᵀ reaches 38 342 here (2.26·n·log₂n).
      expect(orderedNnz).toBeLessThan(3 * n * Math.log2(n));
      expect(orderedNnz).toBeLessThan(naturalNnz / 3);

      const x = ordered.solve(b.slice());
      for (let i = 0; i < n; i++) expect(x[i]).toBeCloseTo(expected[i], 9);
    });

    it('reports singular pivots by original column under the column ordering', () => {
      // A star (hub plus three leaves) is reordered by minimum degree, so
      // elimination step and original column differ.
      // Column 'b' is structurally present but numerically empty.
      const matrix = new SparseMatrix(4);
      matrix.add(0, 0, 3); matrix.add(0, 1, -1); matrix.touch(0, 2); matrix.add(0, 3, -1);
      matrix.add(1, 0, -1); matrix.add(1, 1, 1);
      matrix.add(2, 0, -1); matrix.add(2, 1, 1); matrix.touch(1, 2); matrix.touch(2, 2);
      matrix.add(3, 0, -1); matrix.add(3, 3, 1);
      const { csc } = toCsc(matrix);
      const solver = new GilbertPeierlsSolver();
      solver.analyzePattern(csc, [
        { kind: 'node', name: 'hub' },
        { kind: 'node', name: 'a' },
        { kind: 'node', name: 'b' },
        { kind: 'branch', name: 'v1' },
      ]);

      let thrown: unknown;
      try {
        solver.factorize(csc);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(SingularMatrixError);
      // Column 'b' is numerically empty; the other three columns are
      // independent, so it is the failing column under any elimination order.
      expect(thrown).toMatchObject({ involvedNodes: ['b'], involvedBranches: [], pivotIndex: 2 });
    });

    it('matches the natural-order solution on a nonsymmetric MNA-like system', () => {
      // Grid plus a voltage-source branch (zero diagonal) forces off-diagonal
      // row pivoting through the permuted order.
      const side = 12;
      const n = side * side;
      const matrix = new SparseMatrix(n + 1);
      stampGrid(matrix, side);
      matrix.add(0, n, 1);
      matrix.add(n, 0, 1);
      matrix.touch(n, n);
      const { csc } = toCsc(matrix);
      const rhs = new Float64Array(n + 1);
      rhs[n] = 1;
      rhs[n - 1] = -1e-3;

      const natural = new GilbertPeierlsSolver({ ordering: 'natural' });
      natural.analyzePattern(csc);
      natural.factorize(csc);
      const reference = natural.solve(rhs.slice());

      const ordered = new GilbertPeierlsSolver();
      ordered.analyzePattern(csc);
      ordered.factorize(csc);
      const x = ordered.solve(rhs.slice());
      for (let i = 0; i <= n; i++) expect(x[i]).toBeCloseTo(reference[i], 10);
    });

    it('raises SingularMatrixError instead of returning a non-finite solution', () => {
      // Upper bidiagonal "gain chain": every pivot is 1, but x[k] = 1e3^(n-1-k)
      // overflows. A long CMOS inverter chain under gmin stepping produces
      // exactly this shape (issue #428 deck at 20k stages).
      const n = 200;
      const matrix = new SparseMatrix(n);
      for (let i = 0; i < n; i++) {
        matrix.add(i, i, 1);
        if (i + 1 < n) matrix.add(i, i + 1, -1e3);
      }
      const { csc } = toCsc(matrix);
      for (const ordering of ['natural', 'amd'] as const) {
        const solver = new GilbertPeierlsSolver({ ordering });
        solver.analyzePattern(csc);
        solver.factorize(csc);
        const rhs = new Float64Array(n);
        rhs[n - 1] = 1;
        expect(() => solver.solve(rhs), ordering).toThrow(SingularMatrixError);
      }
    });

    it('replaces reusable workspaces when the analyzed topology changes', () => {
      const solver = new GilbertPeierlsSolver();
      const one = new SparseMatrix(1);
      one.add(0, 0, 2);
      const { csc: oneCsc } = toCsc(one);
      solver.analyzePattern(oneCsc);
      solver.factorize(oneCsc);
      expect(Array.from(solver.solve(new Float64Array([6])))).toEqual([3]);

      const two = new SparseMatrix(2);
      two.add(0, 0, 3); two.add(0, 1, -1);
      two.add(1, 0, -1); two.add(1, 1, 3);
      const { csc: twoCsc } = toCsc(two);
      solver.analyzePattern(twoCsc);
      solver.factorize(twoCsc);

      const solution = solver.solve(new Float64Array([2, 6]));
      expect(solution[0]).toBeCloseTo(1.5, 10);
      expect(solution[1]).toBeCloseTo(2.5, 10);
    });
  });
});
