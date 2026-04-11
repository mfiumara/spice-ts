import type { CscMatrix } from './csc-matrix.js';
import type { SparseSolver } from './sparse-solver.js';

/**
 * Gilbert-Peierls sparse LU solver.
 *
 * Implements PA = LU factorization with threshold partial pivoting.
 * The algorithm separates symbolic analysis (sparsity structure prediction)
 * from numeric factorization, allowing the symbolic phase to run once per
 * circuit topology while numeric factorization runs every Newton-Raphson step.
 *
 * All work arrays are pre-allocated in analyzePattern and reused across
 * factorize/solve calls to avoid GC pressure in hot loops.
 *
 * Storage:
 *   L is unit lower triangular (implicit 1s on diagonal), stored in CSC.
 *   U is upper triangular (including diagonal), stored in CSC.
 *   P is a row permutation vector from threshold partial pivoting.
 */
export class GilbertPeierlsSolver implements SparseSolver {
  private n = 0;

  // Pre-allocated L/U structure (CSC format, worst-case sized)
  private lColPtr!: Int32Array;
  private lRows!: Int32Array;
  private lValues!: Float64Array;
  private uColPtr!: Int32Array;
  private uRows!: Int32Array;
  private uValues!: Float64Array;

  // Actual nnz used in L/U (may be less than allocated capacity)
  private lActualNnz = 0;
  private uActualNnz = 0;

  // perm[k] = i means original row i is at elimination position k
  private perm!: Int32Array;

  // Pre-allocated work arrays (reused across calls)
  private denseM!: Float64Array;   // n×n dense matrix for factorization
  private workY!: Float64Array;    // solve workspace
  private uDiagIdx!: Int32Array;   // cached diagonal positions in U

  private analyzed = false;
  private factorized = false;

  private readonly pivotThreshold = 0.1;

  analyzePattern(A: CscMatrix): void {
    const n = A.size;
    this.n = n;

    // Pre-allocate all work arrays once. L and U arrays are sized for
    // worst case (fully dense factors) so pivoting never overflows.
    const maxLNnz = n * (n - 1) / 2;
    const maxUNnz = n * (n + 1) / 2;

    this.lColPtr = new Int32Array(n + 1);
    this.lRows = new Int32Array(maxLNnz);
    this.lValues = new Float64Array(maxLNnz);
    this.uColPtr = new Int32Array(n + 1);
    this.uRows = new Int32Array(maxUNnz);
    this.uValues = new Float64Array(maxUNnz);
    this.perm = new Int32Array(n);
    this.denseM = new Float64Array(n * n);
    this.workY = new Float64Array(n);
    this.uDiagIdx = new Int32Array(n);

    this.analyzed = true;
    this.factorized = false;
  }

  factorize(A: CscMatrix): void {
    if (!this.analyzed) {
      throw new Error('Must call analyzePattern before factorize');
    }

    const n = this.n;
    const perm = this.perm;
    const M = this.denseM;

    // Zero and fill dense matrix (reuse pre-allocated buffer)
    M.fill(0);
    for (let i = 0; i < n; i++) perm[i] = i;

    for (let j = 0; j < n; j++) {
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        M[A.rowIdx[p] * n + j] = A.values[p];
      }
    }

    // LU factorization with threshold partial pivoting (in-place in M)
    for (let k = 0; k < n; k++) {
      let maxVal = 0;
      let maxIdx = k;
      for (let i = k; i < n; i++) {
        const val = Math.abs(M[perm[i] * n + k]);
        if (val > maxVal) {
          maxVal = val;
          maxIdx = i;
        }
      }

      if (maxVal < 1e-18) {
        throw new Error(`Singular matrix at column ${k}`);
      }

      if (maxIdx !== k) {
        const diagVal = Math.abs(M[perm[k] * n + k]);
        if (diagVal < this.pivotThreshold * maxVal) {
          const tmp = perm[k];
          perm[k] = perm[maxIdx];
          perm[maxIdx] = tmp;
        }
      }

      const pivotRow = perm[k];
      const pivotVal = M[pivotRow * n + k];

      if (Math.abs(pivotVal) < 1e-18) {
        throw new Error(`Singular matrix at column ${k}`);
      }

      for (let i = k + 1; i < n; i++) {
        const row = perm[i];
        const factor = M[row * n + k] / pivotVal;
        M[row * n + k] = factor;
        for (let jj = k + 1; jj < n; jj++) {
          M[row * n + jj] -= factor * M[pivotRow * n + jj];
        }
      }
    }

    // Extract L and U into pre-allocated arrays (no allocation)
    const lColPtr = this.lColPtr;
    const lRows = this.lRows;
    const lValues = this.lValues;
    const uColPtr = this.uColPtr;
    const uRows = this.uRows;
    const uValues = this.uValues;
    const uDiagIdx = this.uDiagIdx;

    let lp = 0;
    let up = 0;
    for (let j = 0; j < n; j++) {
      uColPtr[j] = up;
      for (let i = 0; i <= j; i++) {
        const val = M[perm[i] * n + j];
        if (val !== 0) {
          if (i === j) uDiagIdx[j] = up;
          uRows[up] = i;
          uValues[up] = val;
          up++;
        }
      }
      lColPtr[j] = lp;
      for (let i = j + 1; i < n; i++) {
        const val = M[perm[i] * n + j];
        if (val !== 0) {
          lRows[lp] = i;
          lValues[lp] = val;
          lp++;
        }
      }
    }
    lColPtr[n] = lp;
    uColPtr[n] = up;
    this.lActualNnz = lp;
    this.uActualNnz = up;

    this.factorized = true;
  }

  solve(b: Float64Array): Float64Array {
    if (!this.factorized) {
      throw new Error('Must call factorize before solve');
    }

    const n = this.n;
    const perm = this.perm;
    const lColPtr = this.lColPtr;
    const lRows = this.lRows;
    const lValues = this.lValues;
    const uColPtr = this.uColPtr;
    const uRows = this.uRows;
    const uValues = this.uValues;
    const uDiagIdx = this.uDiagIdx;
    const y = this.workY;

    // Apply permutation: y = Pb
    for (let k = 0; k < n; k++) {
      y[k] = b[perm[k]];
    }

    // Forward substitution: Ly = Pb (L is unit lower triangular)
    for (let j = 0; j < n; j++) {
      const yj = y[j];
      for (let p = lColPtr[j]; p < lColPtr[j + 1]; p++) {
        y[lRows[p]] -= lValues[p] * yj;
      }
    }

    // Backward substitution: Ux = y (using cached diagonal positions)
    const x = new Float64Array(n);
    for (let j = n - 1; j >= 0; j--) {
      x[j] = y[j] / uValues[uDiagIdx[j]];
      for (let p = uColPtr[j]; p < uColPtr[j + 1]; p++) {
        const i = uRows[p];
        if (i < j) {
          y[i] -= uValues[p] * x[j];
        }
      }
    }

    return x;
  }
}
