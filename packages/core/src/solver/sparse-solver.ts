import type { CscMatrix } from './csc-matrix.js';

export interface SparseSolver {
  /** Analyze sparsity pattern — call once per circuit topology */
  analyzePattern(A: CscMatrix): void;

  /** Numeric factorization — call each Newton step (same pattern, new values) */
  factorize(A: CscMatrix): void;

  /** Solve Ax = b, returns solution vector */
  solve(b: Float64Array): Float64Array;
}
