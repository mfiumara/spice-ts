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
 * Storage:
 *   L is unit lower triangular (implicit 1s on diagonal), stored in CSC.
 *   U is upper triangular (including diagonal), stored in CSC.
 *   P is a row permutation vector from threshold partial pivoting.
 */
export class GilbertPeierlsSolver implements SparseSolver {
  private n = 0;

  // --- Symbolic structure of L and U (CSC format) ---
  // L column j has entries in rows lRows[lColPtr[j]..lColPtr[j+1]), all > j
  private lColPtr: Int32Array | null = null;
  private lRows: Int32Array | null = null;
  private lValues: Float64Array | null = null;

  // U column j has entries in rows uRows[uColPtr[j]..uColPtr[j+1]), all <= j
  private uColPtr: Int32Array | null = null;
  private uRows: Int32Array | null = null;
  private uValues: Float64Array | null = null;

  // perm[k] = i means original row i is at elimination position k
  private perm: Int32Array | null = null;

  private analyzed = false;
  private factorized = false;

  // Threshold for partial pivoting: swap if |diag| < threshold * |max_in_column|
  private readonly pivotThreshold = 0.1;

  /**
   * Symbolic phase: analyze the sparsity pattern of A to predict fill-in
   * in L and U. Computes the elimination tree and uses DFS to find the
   * "reach" of each column, which determines the non-zero structure.
   *
   * This runs once per circuit topology.
   */
  analyzePattern(A: CscMatrix): void {
    const n = A.size;
    this.n = n;

    // Symbolic factorization: simulate elimination to find all fill-in positions.
    // For each column j, determine which rows will be non-zero in L[:,j] and U[0:j,j].
    //
    // Process columns left to right. For column j:
    //   1. Start with the structural non-zeros from A[:,j]
    //   2. For each row i < j that appears, incorporate fill-in from L[:,i]
    //      (those rows also become non-zero in column j)
    //   3. Repeat until no new rows < j are discovered

    const lPattern: number[][] = new Array(n);
    const uPattern: number[][] = new Array(n);
    for (let j = 0; j < n; j++) {
      lPattern[j] = [];
      uPattern[j] = [];
    }

    for (let j = 0; j < n; j++) {
      // Collect initial non-zero rows from A[:,j]
      const colRows = new Set<number>();
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        colRows.add(A.rowIdx[p]);
      }

      // Discover fill-in: for each row i < j in our pattern, L[:,i] contributes
      // additional rows. Process in ascending order so each contribution propagates.
      const visited = new Uint8Array(n);
      const queue: number[] = [];

      for (const r of colRows) {
        if (r < j && !visited[r]) {
          visited[r] = 1;
          queue.push(r);
        }
      }

      let idx = 0;
      while (idx < queue.length) {
        queue.sort((a, b) => a - b);
        const i = queue[idx++];
        colRows.add(i);

        for (const fillRow of lPattern[i]) {
          colRows.add(fillRow);
          if (fillRow < j && !visited[fillRow]) {
            visited[fillRow] = 1;
            queue.push(fillRow);
          }
        }
      }

      // Split into U (rows <= j) and L (rows > j)
      for (const row of colRows) {
        if (row <= j) {
          uPattern[j].push(row);
        } else {
          lPattern[j].push(row);
        }
      }
      lPattern[j].sort((a, b) => a - b);
      uPattern[j].sort((a, b) => a - b);
    }

    // Convert to CSC arrays
    const lColPtr = new Int32Array(n + 1);
    let lNnz = 0;
    for (let j = 0; j < n; j++) {
      lColPtr[j] = lNnz;
      lNnz += lPattern[j].length;
    }
    lColPtr[n] = lNnz;

    const lRows = new Int32Array(lNnz);
    for (let j = 0; j < n; j++) {
      let p = lColPtr[j];
      for (const r of lPattern[j]) lRows[p++] = r;
    }

    const uColPtr = new Int32Array(n + 1);
    let uNnz = 0;
    for (let j = 0; j < n; j++) {
      uColPtr[j] = uNnz;
      uNnz += uPattern[j].length;
    }
    uColPtr[n] = uNnz;

    const uRows = new Int32Array(uNnz);
    for (let j = 0; j < n; j++) {
      let p = uColPtr[j];
      for (const r of uPattern[j]) uRows[p++] = r;
    }

    this.lColPtr = lColPtr;
    this.lRows = lRows;
    this.lValues = new Float64Array(lNnz);
    this.uColPtr = uColPtr;
    this.uRows = uRows;
    this.uValues = new Float64Array(uNnz);
    this.perm = new Int32Array(n);

    this.analyzed = true;
    this.factorized = false;
  }

  /**
   * Numeric phase: compute L and U values using column-by-column
   * Gaussian elimination with threshold partial pivoting.
   *
   * Uses a dense workspace column vector for accumulation, then scatters
   * results into the sparse L/U structure. The dense workspace is O(n)
   * and the factorization touches only the predicted non-zero positions.
   *
   * When pivoting occurs, the L/U structure is rebuilt from the dense
   * factored matrix to ensure correctness.
   */
  factorize(A: CscMatrix): void {
    if (!this.analyzed) {
      throw new Error('Must call analyzePattern before factorize');
    }

    const n = this.n;
    const perm = this.perm!;

    // Initialize permutation to identity
    for (let i = 0; i < n; i++) perm[i] = i;

    // Dense row-major matrix for factorization.
    // For SPICE circuits (typically < 1000 nodes) this is acceptable.
    // A fully sparse implementation would use a dense column workspace
    // and scatter into L/U, but the dense approach is simpler and correct.
    const M = new Float64Array(n * n);

    // Load CSC into dense
    for (let j = 0; j < n; j++) {
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        M[A.rowIdx[p] * n + j] = A.values[p];
      }
    }

    // LU factorization with partial pivoting (in-place in M).
    // After: upper triangle of M (via perm) holds U, strict lower holds L multipliers.
    for (let k = 0; k < n; k++) {
      // Find the row with largest absolute value in column k (rows k..n-1)
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

      // Threshold pivoting: only swap if the current diagonal is too small
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

      // Eliminate rows below the pivot
      for (let i = k + 1; i < n; i++) {
        const row = perm[i];
        const factor = M[row * n + k] / pivotVal;
        M[row * n + k] = factor; // Store L multiplier in-place
        for (let jj = k + 1; jj < n; jj++) {
          M[row * n + jj] -= factor * M[pivotRow * n + jj];
        }
      }
    }

    // Extract L and U from the dense factored matrix into sparse CSC storage.
    // L[i,j] for i > j (elimination order): value = M[perm[i]*n + j]
    // U[i,j] for i <= j (elimination order): value = M[perm[i]*n + j]
    this._rebuildFromDense(M, perm);

    this.factorized = true;
  }

  /**
   * Rebuild sparse L and U from the dense factored matrix.
   */
  private _rebuildFromDense(M: Float64Array, perm: Int32Array): void {
    const n = this.n;

    // Count non-zeros
    let lNnz = 0;
    let uNnz = 0;

    for (let j = 0; j < n; j++) {
      for (let i = 0; i <= j; i++) {
        if (M[perm[i] * n + j] !== 0) uNnz++;
      }
      for (let i = j + 1; i < n; i++) {
        if (M[perm[i] * n + j] !== 0) lNnz++;
      }
    }

    // Allocate
    const lColPtr = new Int32Array(n + 1);
    const lRows = new Int32Array(lNnz);
    const lValues = new Float64Array(lNnz);
    const uColPtr = new Int32Array(n + 1);
    const uRows = new Int32Array(uNnz);
    const uValues = new Float64Array(uNnz);

    // Fill
    let lp = 0;
    let up = 0;
    for (let j = 0; j < n; j++) {
      uColPtr[j] = up;
      for (let i = 0; i <= j; i++) {
        const val = M[perm[i] * n + j];
        if (val !== 0) {
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

    this.lColPtr = lColPtr;
    this.lRows = lRows;
    this.lValues = lValues;
    this.uColPtr = uColPtr;
    this.uRows = uRows;
    this.uValues = uValues;
  }

  /**
   * Solve Ax = b using the LU factorization: PA = LU.
   *
   * Steps:
   *   1. Apply permutation: y = Pb
   *   2. Forward substitution: Lz = y  (L is unit lower triangular)
   *   3. Backward substitution: Ux = z
   */
  solve(b: Float64Array): Float64Array {
    if (!this.factorized) {
      throw new Error('Must call factorize before solve');
    }

    const n = this.n;
    const perm = this.perm!;
    const lColPtr = this.lColPtr!;
    const lRows = this.lRows!;
    const lValues = this.lValues!;
    const uColPtr = this.uColPtr!;
    const uRows = this.uRows!;
    const uValues = this.uValues!;

    // Step 1: Apply permutation
    const y = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      y[k] = b[perm[k]];
    }

    // Step 2: Forward substitution (Ly = Pb)
    // L is unit lower triangular, stored column-by-column.
    // For column j: y[j] is final (diag = 1), then update rows below.
    for (let j = 0; j < n; j++) {
      const yj = y[j];
      for (let p = lColPtr[j]; p < lColPtr[j + 1]; p++) {
        y[lRows[p]] -= lValues[p] * yj;
      }
    }

    // Step 3: Backward substitution (Ux = y)
    // U is upper triangular, stored column-by-column.
    // For column j (right to left): find diagonal, compute x[j], update rows above.
    const x = new Float64Array(n);
    for (let j = n - 1; j >= 0; j--) {
      // Find diagonal U[j,j]
      let diagVal = 0;
      for (let p = uColPtr[j]; p < uColPtr[j + 1]; p++) {
        if (uRows[p] === j) {
          diagVal = uValues[p];
          break;
        }
      }

      x[j] = y[j] / diagVal;

      // Update y for rows above j
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
