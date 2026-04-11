import { describe, it, expect } from 'vitest';
import { SparseMatrix } from './sparse-matrix.js';
import { toCsc } from './csc-matrix.js';
import { ComplexSparseSolver } from './complex-sparse-solver.js';

describe('ComplexSparseSolver', () => {
  it('solves a 2x2 complex system', () => {
    // (G + jωC)x = b where G = [[2, 1], [1, 3]], C = [[1, 0], [0, 1]], ω = 1
    // So A = [[2+j, 1], [1, 3+j]]
    const G = new SparseMatrix(2);
    G.add(0, 0, 2); G.add(0, 1, 1);
    G.add(1, 0, 1); G.add(1, 1, 3);
    const C = new SparseMatrix(2);
    C.add(0, 0, 1); C.add(1, 1, 1);

    const gCsc = toCsc(G).csc;
    const cCsc = toCsc(C).csc;

    const solver = new ComplexSparseSolver();
    solver.analyzePattern(gCsc, cCsc);
    solver.factorize(gCsc, cCsc, 1.0); // omega = 1

    // b = [1+0j, 0+0j]
    const [xRe, xIm] = solver.solve(
      new Float64Array([1, 0]),
      new Float64Array([0, 0]),
    );

    // Verify: A * x = b (multiply back)
    // A = [[2+j, 1], [1, 3+j]]
    // b0 = (2+j)*x0 + 1*x1 should = 1+0j
    // b1 = 1*x0 + (3+j)*x1 should = 0+0j
    const b0re = 2 * xRe[0] - 1 * xIm[0] + xRe[1];
    const b0im = 1 * xRe[0] + 2 * xIm[0] + xIm[1];
    const b1re = xRe[0] + 3 * xRe[1] - 1 * xIm[1];
    const b1im = xIm[0] + 1 * xRe[1] + 3 * xIm[1];

    expect(b0re).toBeCloseTo(1, 10);
    expect(b0im).toBeCloseTo(0, 10);
    expect(b1re).toBeCloseTo(0, 10);
    expect(b1im).toBeCloseTo(0, 10);
  });

  it('reuses pattern across different omega values', () => {
    const G = new SparseMatrix(2);
    G.add(0, 0, 2); G.add(0, 1, 1);
    G.add(1, 0, 1); G.add(1, 1, 3);
    const C = new SparseMatrix(2);
    C.add(0, 0, 1); C.add(1, 1, 1);

    const gCsc = toCsc(G).csc;
    const cCsc = toCsc(C).csc;

    const solver = new ComplexSparseSolver();
    solver.analyzePattern(gCsc, cCsc);

    // Solve at omega=1
    solver.factorize(gCsc, cCsc, 1.0);
    const [x1Re] = solver.solve(new Float64Array([1, 0]), new Float64Array([0, 0]));

    // Solve at omega=10 (reuse pattern)
    solver.factorize(gCsc, cCsc, 10.0);
    const [x2Re] = solver.solve(new Float64Array([1, 0]), new Float64Array([0, 0]));

    // Solutions should be different
    expect(x1Re[0]).not.toBeCloseTo(x2Re[0], 5);
  });

  it('solves a purely imaginary system (G=0)', () => {
    // A = j*omega*C with C = [[1, 0], [0, 2]], omega = 1
    // A = [[j, 0], [0, 2j]]
    // Ax = b => x = A^{-1} b
    // b = [1+0j, 0+2j]
    // x0 = 1/j = -j, x1 = 2j/(2j) = 1
    const G = new SparseMatrix(2);
    // G is all zero but we need diagonal structure for non-singularity check
    // Actually G has no entries - the pattern comes from C only
    const C = new SparseMatrix(2);
    C.add(0, 0, 1); C.add(1, 1, 2);

    const gCsc = toCsc(G).csc;
    const cCsc = toCsc(C).csc;

    const solver = new ComplexSparseSolver();
    solver.analyzePattern(gCsc, cCsc);
    solver.factorize(gCsc, cCsc, 1.0);

    const [xRe, xIm] = solver.solve(
      new Float64Array([1, 0]),
      new Float64Array([0, 2]),
    );

    // x0 = 1/j = -j => (0, -1)
    expect(xRe[0]).toBeCloseTo(0, 10);
    expect(xIm[0]).toBeCloseTo(-1, 10);
    // x1 = 2j/(2j) = 1 => (1, 0)
    expect(xRe[1]).toBeCloseTo(1, 10);
    expect(xIm[1]).toBeCloseTo(0, 10);
  });

  it('solves a 3x3 complex system', () => {
    // G = [[4, -1, 0], [-1, 4, -1], [0, -1, 4]]  (tridiagonal)
    // C = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]       (identity)
    // omega = 2
    // A = G + j*2*C = [[4+2j, -1, 0], [-1, 4+2j, -1], [0, -1, 4+2j]]
    const G = new SparseMatrix(3);
    G.add(0, 0, 4); G.add(0, 1, -1);
    G.add(1, 0, -1); G.add(1, 1, 4); G.add(1, 2, -1);
    G.add(2, 1, -1); G.add(2, 2, 4);
    const C = new SparseMatrix(3);
    C.add(0, 0, 1); C.add(1, 1, 1); C.add(2, 2, 1);

    const gCsc = toCsc(G).csc;
    const cCsc = toCsc(C).csc;

    const solver = new ComplexSparseSolver();
    solver.analyzePattern(gCsc, cCsc);
    solver.factorize(gCsc, cCsc, 2.0);

    const bRe = new Float64Array([1, 0, 0]);
    const bIm = new Float64Array([0, 0, 0]);
    const [xRe, xIm] = solver.solve(bRe, bIm);

    // Verify by multiplying A*x and checking it equals b
    // Row 0: (4+2j)*x0 + (-1)*x1
    const r0re = 4 * xRe[0] - 2 * xIm[0] - xRe[1];
    const r0im = 4 * xIm[0] + 2 * xRe[0] - xIm[1];
    // Row 1: (-1)*x0 + (4+2j)*x1 + (-1)*x2
    const r1re = -xRe[0] + 4 * xRe[1] - 2 * xIm[1] - xRe[2];
    const r1im = -xIm[0] + 4 * xIm[1] + 2 * xRe[1] - xIm[2];
    // Row 2: (-1)*x1 + (4+2j)*x2
    const r2re = -xRe[1] + 4 * xRe[2] - 2 * xIm[2];
    const r2im = -xIm[1] + 4 * xIm[2] + 2 * xRe[2];

    expect(r0re).toBeCloseTo(1, 10);
    expect(r0im).toBeCloseTo(0, 10);
    expect(r1re).toBeCloseTo(0, 10);
    expect(r1im).toBeCloseTo(0, 10);
    expect(r2re).toBeCloseTo(0, 10);
    expect(r2im).toBeCloseTo(0, 10);
  });

  it('handles complex RHS', () => {
    const G = new SparseMatrix(2);
    G.add(0, 0, 1); G.add(1, 1, 1);
    const C = new SparseMatrix(2);
    C.add(0, 0, 1); C.add(1, 1, 1);

    const gCsc = toCsc(G).csc;
    const cCsc = toCsc(C).csc;

    const solver = new ComplexSparseSolver();
    solver.analyzePattern(gCsc, cCsc);
    solver.factorize(gCsc, cCsc, 1.0);

    // A = [[1+j, 0], [0, 1+j]], b = [1+j, 2+2j]
    // x = b/A => x0 = (1+j)/(1+j) = 1, x1 = (2+2j)/(1+j) = 2
    const [xRe, xIm] = solver.solve(
      new Float64Array([1, 2]),
      new Float64Array([1, 2]),
    );

    expect(xRe[0]).toBeCloseTo(1, 10);
    expect(xIm[0]).toBeCloseTo(0, 10);
    expect(xRe[1]).toBeCloseTo(2, 10);
    expect(xIm[1]).toBeCloseTo(0, 10);
  });
});
