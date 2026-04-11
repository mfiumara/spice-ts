import { SparseMatrix } from './sparse-matrix.js';
import { toCsc } from './csc-matrix.js';
import { createSparseSolver } from './sparse-solver.js';

/**
 * Solve Ax = b using sparse LU decomposition (Gilbert-Peierls).
 * Drop-in replacement for the previous dense O(n³) solver.
 */
export function solveLU(A: SparseMatrix, b: Float64Array): Float64Array {
  const n = A.size;
  if (b.length !== n) {
    throw new Error(`Dimension mismatch: matrix is ${n}x${n}, b has length ${b.length}`);
  }

  const { csc } = toCsc(A);
  const solver = createSparseSolver();
  solver.analyzePattern(csc);
  solver.factorize(csc);
  return solver.solve(b);
}

/**
 * Solve a complex system (G + jwC)x = b for AC analysis.
 * Returns [real_part, imag_part] of solution.
 */
export function solveComplexLU(
  Areal: SparseMatrix,
  Aimag: SparseMatrix,
  bReal: Float64Array,
  bImag: Float64Array,
): [Float64Array, Float64Array] {
  const n = Areal.size;
  const N = 2 * n;
  const A = new SparseMatrix(N);

  for (let i = 0; i < n; i++) {
    for (const [j, val] of Areal.getRow(i)) {
      A.add(i, j, val);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Aimag.getRow(i)) {
      A.add(i, j + n, -val);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Aimag.getRow(i)) {
      A.add(i + n, j, val);
    }
  }
  for (let i = 0; i < n; i++) {
    for (const [j, val] of Areal.getRow(i)) {
      A.add(i + n, j + n, val);
    }
  }

  const b = new Float64Array(N);
  b.set(bReal, 0);
  b.set(bImag, n);

  const x = solveLU(A, b);
  return [x.slice(0, n), x.slice(n)];
}
