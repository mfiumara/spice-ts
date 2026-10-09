import type { CscMatrix } from './csc-matrix.js';
import { GilbertPeierlsSolver } from './gilbert-peierls.js';
import type { MatrixVariableIdentity } from '../errors.js';

export interface SparseSolver {
  /** Analyze sparsity pattern — call once per circuit topology */
  analyzePattern(A: CscMatrix, variables?: readonly MatrixVariableIdentity[]): void;

  /** Numeric factorization — call each Newton step (same pattern, new values) */
  factorize(A: CscMatrix): void;

  /** Solve Ax = b, returns solution vector */
  solve(b: Float64Array): Float64Array;

  /** Returns true if {@link analyzePattern} has been called. */
  isPatternAnalyzed(): boolean;
}

/** Create a new sparse LU solver instance (Gilbert-Peierls algorithm). */
export function createSparseSolver(): SparseSolver {
  return new GilbertPeierlsSolver();
}
