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
 * The factorization uses a left-looking column-Crout algorithm with a dense
 * workspace vector of length n (instead of an n*n dense matrix). The symbolic
 * phase computes fill-in on the symmetric structure A+A^T, guaranteeing the
 * pre-allocated L/U arrays are large enough for any pivoting outcome.
 *
 * Storage:
 *   L is unit lower triangular (implicit 1s on diagonal), stored in CSC.
 *   U is upper triangular (including diagonal), stored in CSC.
 *   P is a row permutation vector from threshold partial pivoting.
 */
export class GilbertPeierlsSolver implements SparseSolver {
  private n = 0;

  // Pre-allocated L/U structure (CSC format)
  private lColPtr!: Int32Array;
  private lRows!: Int32Array;
  private lValues!: Float64Array;
  private uColPtr!: Int32Array;
  private uRows!: Int32Array;
  private uValues!: Float64Array;

  // perm[k] = i means original row i is at elimination position k
  private perm!: Int32Array;

  // Pre-allocated work arrays (reused across factorize/solve calls)
  private workspace!: Float64Array;     // dense column vector of size n (indexed by original row)
  private workY!: Float64Array;         // solve workspace
  private uDiagIdx!: Int32Array;        // cached diagonal positions in U
  private pivotOrigRow!: Int32Array;    // pivotOrigRow[k] = original row for column k's pivot
  private pinv!: Int32Array;            // pinv[origRow] = column that used origRow as pivot
  private lTempOrigRows!: Int32Array;   // original row indices for L entries during factorize
  private nonzeroFlag!: Int32Array;     // marker for workspace non-zero tracking
  private nonzeroList!: Int32Array;     // list of non-zero workspace positions
  private activeK!: Int32Array;         // active column indices during triangular solve

  private analyzed = false;
  private factorized = false;

  private readonly pivotThreshold = 0.1;

  analyzePattern(A: CscMatrix): void {
    const n = A.size;
    this.n = n;

    // Compute symbolic fill-in on the symmetric structure (A + A^T).
    // This gives a superset of the actual non-zero structure regardless of pivoting.
    const symAdj = buildSymmetricAdjacency(A);
    const lRowSets: number[][] = new Array(n);
    const uRowSets: number[][] = new Array(n);

    const parent = new Int32Array(n).fill(-1);
    const visited = new Int32Array(n).fill(-1);

    for (let j = 0; j < n; j++) {
      const allRows = new Set<number>();

      for (const i of symAdj[j]) {
        allRows.add(i);
      }

      // Walk up elimination tree from each row < j to find U-part reachability
      for (const startRow of symAdj[j]) {
        let i = startRow;
        while (i !== -1 && i < j && visited[i] !== j) {
          visited[i] = j;
          const p = parent[i];
          if (p === -1) {
            parent[i] = j;
          }
          i = p;
        }
      }

      // Propagate fill-in: for each k < j reachable from A[:,j], the rows
      // of L[:,k] create fill-in positions in column j
      const uRowList: number[] = [];
      for (const row of allRows) {
        if (row < j) uRowList.push(row);
      }
      uRowList.sort((a, b) => a - b);

      let qi = 0;
      while (qi < uRowList.length) {
        const k = uRowList[qi];
        qi++;
        if (lRowSets[k]) {
          for (const row of lRowSets[k]) {
            if (!allRows.has(row)) {
              allRows.add(row);
              if (row < j) {
                uRowList.push(row);
              }
            }
          }
        }
      }

      // Rebuild sorted lists after fill-in propagation
      uRowList.length = 0;
      for (const row of allRows) {
        if (row < j) uRowList.push(row);
      }
      uRowList.sort((a, b) => a - b);

      const lRowList: number[] = [];
      for (const row of allRows) {
        if (row > j) lRowList.push(row);
      }
      lRowList.sort((a, b) => a - b);

      uRowSets[j] = uRowList;
      lRowSets[j] = lRowList;
    }

    // Compute total nnz for L and U
    let lNnz = 0;
    let uNnz = 0;
    for (let j = 0; j < n; j++) {
      lNnz += lRowSets[j].length;
      uNnz += uRowSets[j].length + 1; // +1 for diagonal
    }

    // Pre-allocate all arrays. These are reused across factorize calls.
    this.lColPtr = new Int32Array(n + 1);
    this.lRows = new Int32Array(lNnz);
    this.lValues = new Float64Array(lNnz);
    this.uColPtr = new Int32Array(n + 1);
    this.uRows = new Int32Array(uNnz);
    this.uValues = new Float64Array(uNnz);
    this.perm = new Int32Array(n);
    this.workspace = new Float64Array(n);
    this.workY = new Float64Array(n);
    this.uDiagIdx = new Int32Array(n);
    this.pivotOrigRow = new Int32Array(n);
    this.pinv = new Int32Array(n);
    this.lTempOrigRows = new Int32Array(lNnz);
    this.nonzeroFlag = new Int32Array(n);
    this.nonzeroList = new Int32Array(n);
    this.activeK = new Int32Array(n);

    this.analyzed = true;
    this.factorized = false;
  }

  isPatternAnalyzed(): boolean {
    return this.analyzed;
  }

  /**
   * Left-looking column-Crout factorization with threshold partial pivoting.
   *
   * The workspace vector is indexed by ORIGINAL row numbers throughout.
   * During factorization, L entries are stored with original row indices
   * (in a parallel array), then converted to elimination-order indices
   * after the full factorization when the final permutation is known.
   *
   * This avoids a permutation-inconsistency where later pivots would
   * change the meaning of elimination positions stored by earlier columns.
   */
  factorize(A: CscMatrix): void {
    if (!this.analyzed) {
      throw new Error('Must call analyzePattern before factorize');
    }

    const n = this.n;
    const perm = this.perm;
    const workspace = this.workspace;
    const lColPtr = this.lColPtr;
    const lRows = this.lRows;
    const lValues = this.lValues;
    const uColPtr = this.uColPtr;
    const uRows = this.uRows;
    const uValues = this.uValues;
    const uDiagIdx = this.uDiagIdx;
    const pivotOrigRow = this.pivotOrigRow;
    const pinv = this.pinv;
    const lTempOrigRows = this.lTempOrigRows;
    const nonzeroFlag = this.nonzeroFlag;
    const nonzeroList = this.nonzeroList;
    const activeK = this.activeK;

    // Initialize permutation and work arrays
    for (let i = 0; i < n; i++) perm[i] = i;
    pivotOrigRow.fill(-1);
    pinv.fill(-1);
    nonzeroFlag.fill(-1);

    let lp = 0;
    let up = 0;

    for (let j = 0; j < n; j++) {
      let nonzeroCount = 0;

      lColPtr[j] = lp;
      uColPtr[j] = up;

      // === Step 1: SCATTER column j of A into workspace (original row space) ===
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        const origRow = A.rowIdx[p];
        workspace[origRow] = A.values[p];
        if (nonzeroFlag[origRow] !== j) {
          nonzeroFlag[origRow] = j;
          nonzeroList[nonzeroCount++] = origRow;
        }
      }

      // === Step 2: LEFT-LOOKING sparse triangular solve ===
      // For each column k < j (in order), if workspace[pivotOrigRow[k]] != 0,
      // record U[k,j] and subtract L[:,k] * U[k,j] from the workspace.
      //
      // We build the active set from nonzeroList: for each nonzero workspace
      // position that is a previously-used pivot row, find its column k.
      // Then process in sorted column order.

      // Build sorted list of active columns
      let activeCount = 0;
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        const k = pinv[origRow];
        if (k >= 0 && k < j && workspace[origRow] !== 0) {
          activeK[activeCount++] = k;
        }
      }
      // Sort active columns
      sortInt32Prefix(activeK, activeCount);

      // Process active columns in order. New non-zeros from fill-in may create
      // additional active columns that need processing.
      let ki = 0;
      while (ki < activeCount) {
        const k = activeK[ki];
        ki++;

        const pr = pivotOrigRow[k];
        const ukj = workspace[pr];
        if (ukj === 0) continue;

        // Store U[k,j]
        uRows[up] = k;
        uValues[up] = ukj;
        up++;

        // Apply L column k: subtract L[i,k] * U[k,j] from workspace
        for (let p = lColPtr[k]; p < lColPtr[k + 1]; p++) {
          const origI = lTempOrigRows[p];
          const lik = lValues[p];
          workspace[origI] -= lik * ukj;

          if (nonzeroFlag[origI] !== j) {
            nonzeroFlag[origI] = j;
            nonzeroList[nonzeroCount++] = origI;
            // If this fills in a position that's a previous pivot row, add to activeK
            const k2 = pinv[origI];
            if (k2 >= 0 && k2 < j && k2 > k) {
              // Insert k2 in sorted position (insertion sort into activeK)
              activeK[activeCount] = k2;
              activeCount++;
              for (let q = activeCount - 1; q > ki; q--) {
                if (activeK[q] < activeK[q - 1]) {
                  const tmp = activeK[q];
                  activeK[q] = activeK[q - 1];
                  activeK[q - 1] = tmp;
                } else {
                  break;
                }
              }
            }
          }
        }
      }

      // === Step 3: THRESHOLD PIVOTING ===
      // Among original rows not yet used as pivots, find the one with largest
      // |workspace[origRow]| for threshold pivoting.
      let maxVal = 0;
      let maxOrigRow = -1;
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        if (pinv[origRow] < 0) {
          const absVal = Math.abs(workspace[origRow]);
          if (absVal > maxVal) {
            maxVal = absVal;
            maxOrigRow = origRow;
          }
        }
      }

      if (maxVal < 1e-18) {
        throw new Error(`Singular matrix at column ${j}`);
      }

      // Prefer the natural diagonal candidate (perm[j]) if sufficiently large
      const natOrigRow = perm[j];
      let chosenOrigRow: number;
      if (pinv[natOrigRow] < 0 && Math.abs(workspace[natOrigRow]) >= this.pivotThreshold * maxVal) {
        chosenOrigRow = natOrigRow;
      } else {
        chosenOrigRow = maxOrigRow;
      }

      const pivotVal = workspace[chosenOrigRow];
      if (Math.abs(pivotVal) < 1e-18) {
        throw new Error(`Singular matrix at column ${j}`);
      }

      // Record pivot assignment
      pivotOrigRow[j] = chosenOrigRow;
      pinv[chosenOrigRow] = j;

      // Update perm: swap chosenOrigRow into position j
      if (chosenOrigRow !== perm[j]) {
        for (let i = j + 1; i < n; i++) {
          if (perm[i] === chosenOrigRow) {
            perm[i] = perm[j];
            perm[j] = chosenOrigRow;
            break;
          }
        }
      }

      // Store U diagonal for column j
      uDiagIdx[j] = up;
      uRows[up] = j;
      uValues[up] = pivotVal;
      up++;

      // === Step 4: STORE L column j ===
      // For each original row not yet used as a pivot with nonzero workspace value,
      // store L[i,j] = workspace[origRow] / pivotVal.
      // Row indices are stored as ORIGINAL rows in lTempOrigRows for use by the
      // triangular solve in subsequent columns.
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        if (origRow !== chosenOrigRow && pinv[origRow] < 0 && workspace[origRow] !== 0) {
          lTempOrigRows[lp] = origRow;
          lValues[lp] = workspace[origRow] / pivotVal;
          lp++;
        }
      }

      // === Step 5: CLEAR workspace (only touched positions) ===
      for (let t = 0; t < nonzeroCount; t++) {
        workspace[nonzeroList[t]] = 0;
      }
    }

    lColPtr[n] = lp;
    uColPtr[n] = up;

    // === Step 6: Convert L row indices from original rows to elimination positions ===
    // The final permutation is now fully determined. Convert L's original row
    // indices to elimination-order indices so the solve phase works correctly.
    for (let k = 0; k < n; k++) {
      pinv[perm[k]] = k;
    }
    for (let p = 0; p < lp; p++) {
      lRows[p] = pinv[lTempOrigRows[p]];
    }

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

/**
 * Sort the first `count` elements of an Int32Array in ascending order (insertion sort).
 * Fast for small arrays which is the typical case in sparse factorization.
 */
function sortInt32Prefix(arr: Int32Array, count: number): void {
  for (let i = 1; i < count; i++) {
    const val = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > val) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = val;
  }
}

/**
 * Build symmetric adjacency lists from CSC matrix.
 * For each column j, returns the set of rows i such that A[i,j] != 0 OR A[j,i] != 0.
 */
function buildSymmetricAdjacency(A: CscMatrix): number[][] {
  const n = A.size;
  const adj: Set<number>[] = new Array(n);
  for (let j = 0; j < n; j++) adj[j] = new Set();

  for (let j = 0; j < n; j++) {
    for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
      const i = A.rowIdx[p];
      adj[j].add(i);
      adj[i].add(j);
    }
  }

  const result: number[][] = new Array(n);
  for (let j = 0; j < n; j++) {
    result[j] = Array.from(adj[j]).sort((a, b) => a - b);
  }
  return result;
}
