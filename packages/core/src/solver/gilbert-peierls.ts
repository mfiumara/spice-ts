import type { CscMatrix } from './csc-matrix.js';
import type { SparseSolver } from './sparse-solver.js';
import { SingularMatrixError, type MatrixVariableIdentity } from '../errors.js';

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
 * phase sizes the initial factor buffers from the CSC structure. Numeric fill
 * and row pivoting can exceed that estimate, so those arrays grow on demand and
 * retain their enlarged capacity for pattern reuse.
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
  private workspace!: Float64Array;     // factor column / solve y, used in non-overlapping phases
  private pinv!: Int32Array;            // pinv[origRow] = column that used origRow as pivot
  private nonzeroFlag!: Int32Array;     // marker for workspace non-zero tracking
  private nonzeroList!: Int32Array;     // list of non-zero workspace positions
  private activeK!: Int32Array;         // active column indices during triangular solve
  private activeFlag!: Int32Array;      // marker preventing duplicate active columns

  private analyzed = false;
  private factorized = false;
  private variables: readonly MatrixVariableIdentity[] = [];

  private readonly pivotThreshold = 0.1;

  analyzePattern(A: CscMatrix, variables: readonly MatrixVariableIdentity[] = []): void {
    const n = A.size;
    this.n = n;
    this.variables = variables;

    // Size the initial factors directly from A's structural lower/upper parts.
    // The previous fill predictor materialized one Set and multiple boxed arrays
    // per column, although numeric pivoting could still invalidate its estimate.
    // Dynamic growth already preserves correctness for fill beyond this bound.
    let lNnz = 0;
    let uNnz = 0;
    for (let j = 0; j < n; j++) {
      let hasDiagonal = false;
      for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
        const row = A.rowIdx[p];
        if (row > j) lNnz++;
        else uNnz++;
        if (row === j) hasDiagonal = true;
      }
      if (!hasDiagonal) uNnz++;
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
    this.pinv = new Int32Array(n);
    this.nonzeroFlag = new Int32Array(n);
    this.nonzeroList = new Int32Array(n);
    this.activeK = new Int32Array(n);
    this.activeFlag = new Int32Array(n);

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
   * During factorization, L entries are stored with original row indices in
   * the final row array, then converted in place to elimination-order indices
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
    let lRows = this.lRows;
    let lValues = this.lValues;
    const uColPtr = this.uColPtr;
    let uRows = this.uRows;
    let uValues = this.uValues;
    const pinv = this.pinv;
    const nonzeroFlag = this.nonzeroFlag;
    const nonzeroList = this.nonzeroList;
    const activeK = this.activeK;
    const activeFlag = this.activeFlag;

    // A failed numeric pass invalidates the previous factors. Clear the dense
    // workspace up front as a singular pass exits before per-column cleanup.
    this.factorized = false;
    workspace.fill(0);

    // Initialize permutation and work arrays
    for (let i = 0; i < n; i++) perm[i] = i;
    pinv.fill(-1);
    nonzeroFlag.fill(-1);
    activeFlag.fill(-1);

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
      // For each column k < j (in order), if workspace[perm[k]] != 0,
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
          activeFlag[k] = j;
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

        const pr = perm[k];
        const ukj = workspace[pr];
        if (ukj === 0) continue;

        // Store U[k,j]
        if (up === uValues.length) {
          this.growUFactors(up + 1);
          uRows = this.uRows;
          uValues = this.uValues;
        }
        uRows[up] = k;
        uValues[up] = ukj;
        up++;

        // Apply L column k: subtract L[i,k] * U[k,j] from workspace
        for (let p = lColPtr[k]; p < lColPtr[k + 1]; p++) {
          const origI = lRows[p];
          const lik = lValues[p];
          workspace[origI] -= lik * ukj;

          if (nonzeroFlag[origI] !== j) {
            nonzeroFlag[origI] = j;
            nonzeroList[nonzeroCount++] = origI;
          }

          // A structural zero may already be in nonzeroList but become active
          // only after this update. Track activation separately from structure.
          const k2 = pinv[origI];
          if (k2 > k && k2 < j && workspace[origI] !== 0 && activeFlag[k2] !== j) {
            activeFlag[k2] = j;
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
        throw SingularMatrixError.atPivot(j, this.variables);
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
        throw SingularMatrixError.atPivot(j, this.variables);
      }

      // Record pivot assignment
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
      if (up === uValues.length) {
        this.growUFactors(up + 1);
        uRows = this.uRows;
        uValues = this.uValues;
      }
      uRows[up] = j;
      uValues[up] = pivotVal;
      up++;

      // === Step 4: STORE L column j ===
      // For each original row not yet used as a pivot with nonzero workspace value,
      // store L[i,j] = workspace[origRow] / pivotVal.
      // Row indices remain in ORIGINAL row space until the factorization ends;
      // the triangular solve in subsequent columns reads them from lRows.
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        if (origRow !== chosenOrigRow && pinv[origRow] < 0 && workspace[origRow] !== 0) {
          if (lp === lValues.length) {
            this.growLFactors(lp + 1);
            lRows = this.lRows;
            lValues = this.lValues;
          }
          lRows[lp] = origRow;
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
      lRows[p] = pinv[lRows[p]];
    }

    this.factorized = true;
  }

  private growLFactors(required: number): void {
    const capacity = Math.max(required, Math.max(4, this.lValues.length * 2));
    const rows = new Int32Array(capacity);
    const values = new Float64Array(capacity);
    rows.set(this.lRows);
    values.set(this.lValues);
    this.lRows = rows;
    this.lValues = values;
  }

  private growUFactors(required: number): void {
    const capacity = Math.max(required, Math.max(4, this.uValues.length * 2));
    const rows = new Int32Array(capacity);
    const values = new Float64Array(capacity);
    rows.set(this.uRows);
    values.set(this.uValues);
    this.uRows = rows;
    this.uValues = values;
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
    // Factorization leaves the dense column workspace unused. Reuse it for y
    // rather than retaining a second n-element vector for the solve phase.
    // Every entry is initialized below, and factorize() clears it before reuse.
    const y = this.workspace;

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
    // The RHS is caller-owned scratch at every internal call site. Reusing it
    // as x avoids allocating another n-element vector for every Newton solve.
    const x = b;
    for (let j = n - 1; j >= 0; j--) {
      // Numeric factorization appends each U diagonal after every off-diagonal
      // entry in its column, so the column end already identifies the pivot.
      x[j] = y[j] / uValues[uColPtr[j + 1] - 1];
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
