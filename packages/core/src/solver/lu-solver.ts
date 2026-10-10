import { SparseMatrix } from './sparse-matrix.js';
import { toCsc } from './csc-matrix.js';
import { createSparseSolver } from './sparse-solver.js';
import type { MatrixVariableIdentity } from '../errors.js';

/**
 * Solve Ax = b using sparse LU decomposition (Gilbert-Peierls).
 * Drop-in replacement for the previous dense O(n³) solver.
 */
export function solveLU(
  A: SparseMatrix,
  b: Float64Array,
  variables: readonly MatrixVariableIdentity[] = [],
): Float64Array {
  const n = A.size;
  if (b.length !== n) {
    throw new Error(`Dimension mismatch: matrix is ${n}x${n}, b has length ${b.length}`);
  }

  const { csc } = toCsc(A);
  const solver = createSparseSolver();
  solver.analyzePattern(csc, variables);
  solver.factorize(csc);
  return solver.solve(b);
}
