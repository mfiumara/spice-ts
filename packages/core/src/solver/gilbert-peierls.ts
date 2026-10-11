import type { CscMatrix } from './csc-matrix.js';
import type { SparseSolver } from './sparse-solver.js';
import { SingularMatrixError, type MatrixVariableIdentity } from '../errors.js';
import { amdOrdering } from './amd-ordering.js';

/** Column ordering applied once per topology by {@link GilbertPeierlsSolver.analyzePattern}. */
export type ColumnOrdering = 'amd' | 'natural';

export interface GilbertPeierlsOptions {
  /**
   * Fill-reducing ordering. `'amd'` (default) permutes columns and preferred
   * pivot rows symmetrically by an approximate minimum degree ordering of
   * A + Aᵀ; `'natural'` keeps the MNA variable order.
   */
  ordering?: ColumnOrdering;
}

/**
 * Gilbert-Peierls sparse LU solver.
 *
 * Implements PAQ = LU factorization with a fill-reducing column ordering Q
 * (approximate minimum degree on A + Aᵀ, computed once per topology) and
 * threshold partial pivoting that prefers the symmetrically permuted diagonal.
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
 *   Q is the column ordering: step k factorizes original column colPerm[k].
 */
export class GilbertPeierlsSolver implements SparseSolver {
  private n = 0;
  private readonly ordering: ColumnOrdering;

  // colPerm[k] = j means original column j is factorized at step k
  private colPerm!: Int32Array;

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
  private workspaceDirty = false;

  private analyzed = false;
  private factorized = false;
  private variables: readonly MatrixVariableIdentity[] = [];

  // Inputs of the current factors, for skipping an identical refactorization.
  private factoredValues: Float64Array | null = null;
  private factoredColPtr: Int32Array | null = null;
  private factoredRowIdx: Int32Array | null = null;
  private numericCount = 0;

  private readonly pivotThreshold = 0.1;

  constructor(options: GilbertPeierlsOptions = {}) {
    this.ordering = options.ordering ?? 'amd';
  }

  analyzePattern(A: CscMatrix, variables: readonly MatrixVariableIdentity[] = []): void {
    const n = A.size;
    this.n = n;
    this.variables = variables;

    // The fill-reducing ordering depends only on the sparsity pattern, so it
    // is computed here once per topology and reused by every factorize().
    if (this.ordering === 'amd') {
      this.colPerm = amdOrdering(A);
    } else {
      this.colPerm = new Int32Array(n);
      for (let j = 0; j < n; j++) this.colPerm[j] = j;
    }

    // Size the initial factors from A's structural lower/upper parts in the
    // natural order. The column ordering moves entries between L and U, and
    // numeric fill adds more; the factor arrays grow on demand.
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
    this.workspaceDirty = false;

    this.analyzed = true;
    this.factorized = false;
    this.factoredColPtr = null;
    this.factoredRowIdx = null;
  }

  /** Numeric factorizations performed, excluding skipped identical ones. Diagnostics only. */
  get numericFactorizations(): number {
    return this.numericCount;
  }

  /**
   * True when A is bit-identical (signed zeros included) to the matrix the
   * current factors were computed from, on the same structure arrays.
   */
  private matchesFactoredInput(A: CscMatrix): boolean {
    const prev = this.factoredValues;
    if (!this.factorized || prev === null) return false;
    if (A.colPtr !== this.factoredColPtr || A.rowIdx !== this.factoredRowIdx) return false;
    const values = A.values;
    const nnz = A.colPtr[this.n];
    for (let p = 0; p < nnz; p++) {
      const v = values[p];
      if (v !== prev[p] || (v === 0 && 1 / v !== 1 / prev[p])) return false;
    }
    return true;
  }

  private recordFactoredInput(A: CscMatrix): void {
    const nnz = A.colPtr[this.n];
    let prev = this.factoredValues;
    if (prev === null || prev.length < nnz) prev = this.factoredValues = new Float64Array(nnz);
    prev.set(A.values.subarray(0, nnz));
    this.factoredColPtr = A.colPtr;
    this.factoredRowIdx = A.rowIdx;
  }

  isPatternAnalyzed(): boolean {
    return this.analyzed;
  }

  /**
   * Stored non-zeros of the last numeric factorization: strictly lower L plus
   * U including its diagonal. Diagnostics only.
   */
  factorNonzeros(): number {
    if (!this.factorized) {
      throw new Error('Must call factorize before factorNonzeros');
    }
    return this.lColPtr[this.n] + this.uColPtr[this.n];
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

    // The factorization is a deterministic function of A, so bit-identical
    // input (a linear circuit at a repeated timestep, or the final Newton
    // iterations of a converged OP) yields bit-identical factors. Keep them.
    if (this.matchesFactoredInput(A)) return;

    const n = this.n;
    const perm = this.perm;
    const colPerm = this.colPerm;
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

    // Freshly allocated and successfully factorized workspaces are already
    // zero. Only solve() or a failed numeric pass can leave values behind.
    this.factorized = false;
    if (this.workspaceDirty) workspace.fill(0);
    this.workspaceDirty = true;

    // Initialize the row permutation to the column ordering so the natural
    // pivot candidate at step j is the symmetrically permuted diagonal.
    perm.set(colPerm);
    pinv.fill(-1);
    nonzeroFlag.fill(-1);

    let lp = 0;
    let up = 0;

    for (let j = 0; j < n; j++) {
      let nonzeroCount = 0;

      lColPtr[j] = lp;
      uColPtr[j] = up;

      // === Step 1: SCATTER column colPerm[j] of A into workspace (original row space) ===
      const col = colPerm[j];
      for (let p = A.colPtr[col]; p < A.colPtr[col + 1]; p++) {
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
          // Encode active state in the pivot entry until this column finishes.
          // -1 remains the unused-row sentinel; active k is stored as -k - 2.
          pinv[origRow] = -k - 2;
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
          if (k2 > k && k2 < j && workspace[origI] !== 0) {
            pinv[origI] = -k2 - 2;
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

      // Restore pivot-column indices before pivot selection. Encoded entries
      // are all represented once in activeK, including fill-activated columns.
      for (let t = 0; t < activeCount; t++) {
        const k = activeK[t];
        pinv[perm[k]] = k;
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
        throw SingularMatrixError.atPivot(col, this.variables);
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
        throw SingularMatrixError.atPivot(col, this.variables);
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

    this.workspaceDirty = false;
    this.factorized = true;
    this.numericCount++;
    this.recordFactoredInput(A);
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
    const colPerm = this.colPerm;
    // Factorization leaves the dense column workspace unused. Reuse it for y
    // rather than retaining a second n-element vector for the solve phase.
    // Every entry is initialized below, and factorize() clears it before reuse.
    const y = this.workspace;

    // Apply permutation: y = Pb
    for (let k = 0; k < n; k++) {
      y[k] = b[perm[k]];
    }
    this.workspaceDirty = true;

    // Forward substitution: Ly = Pb (L is unit lower triangular)
    for (let j = 0; j < n; j++) {
      const yj = y[j];
      for (let p = lColPtr[j]; p < lColPtr[j + 1]; p++) {
        y[lRows[p]] -= lValues[p] * yj;
      }
    }

    // Backward substitution: Uz = y, then x = Qz (using cached diagonal positions).
    // The RHS is caller-owned scratch at every internal call site and is no
    // longer read once y = Pb is formed. Reusing it as x avoids allocating
    // another n-element vector for every Newton solve.
    const x = b;
    for (let j = n - 1; j >= 0; j--) {
      // Numeric factorization appends each U diagonal after every off-diagonal
      // entry in its column, so the column end already identifies the pivot.
      const zj = y[j] / uValues[uColPtr[j + 1] - 1];
      // Finite factors can still yield an overflowing solution (a long chain
      // of gain stages). Report it like a numeric zero pivot instead of
      // handing Inf/NaN to Newton, whose step tests cannot reject NaN.
      if (zj - zj !== 0) {
        throw SingularMatrixError.atPivot(colPerm[j], this.variables);
      }
      x[colPerm[j]] = zj;
      for (let p = uColPtr[j]; p < uColPtr[j + 1]; p++) {
        const i = uRows[p];
        if (i < j) {
          y[i] -= uValues[p] * zj;
        }
      }
    }

    return x;
  }
}

/**
 * Sort the first `count` elements of an Int32Array in ascending order.
 * Insertion sort for the typical short column; typed-array sort once a dense
 * row (e.g. a supply rail ordered last) makes the active set large and,
 * under a fill-reducing ordering, unsorted.
 */
function sortInt32Prefix(arr: Int32Array, count: number): void {
  if (count > 32) {
    arr.subarray(0, count).sort();
    return;
  }
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
