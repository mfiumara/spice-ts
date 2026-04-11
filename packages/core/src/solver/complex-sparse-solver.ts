import type { CscMatrix } from './csc-matrix.js';

/**
 * Complex sparse LU solver for AC analysis.
 *
 * Directly factors the n*n complex matrix (G + jwC) instead of expanding
 * to a 2n*2n real system. This halves the matrix dimension and reduces
 * non-zeros by ~4x, giving roughly 8x faster factorization.
 *
 * The algorithm mirrors GilbertPeierlsSolver: left-looking column-Crout
 * with threshold partial pivoting. Every scalar operation is replaced with
 * its complex equivalent, and all value arrays are doubled (separate real
 * and imaginary Float64Arrays).
 *
 * Usage:
 *   const solver = new ComplexSparseSolver();
 *   solver.analyzePattern(gCsc, cCsc);    // once per topology
 *   solver.factorize(gCsc, cCsc, omega);  // per frequency
 *   const [xRe, xIm] = solver.solve(bRe, bIm);
 */
export class ComplexSparseSolver {
  private n = 0;

  // Pre-allocated L/U structure (CSC format) with split real/imag values
  private lColPtr!: Int32Array;
  private lRows!: Int32Array;
  private lValuesRe!: Float64Array;
  private lValuesIm!: Float64Array;
  private uColPtr!: Int32Array;
  private uRows!: Int32Array;
  private uValuesRe!: Float64Array;
  private uValuesIm!: Float64Array;

  // perm[k] = i means original row i is at elimination position k
  private perm!: Int32Array;

  // Pre-allocated work arrays (reused across factorize/solve calls)
  private workspaceRe!: Float64Array;
  private workspaceIm!: Float64Array;
  private workYRe!: Float64Array;
  private workYIm!: Float64Array;
  private uDiagIdx!: Int32Array;
  private pivotOrigRow!: Int32Array;
  private pinv!: Int32Array;
  private lTempOrigRows!: Int32Array;
  private nonzeroFlag!: Int32Array;
  private nonzeroList!: Int32Array;
  private activeK!: Int32Array;

  private analyzed = false;
  private factorized = false;

  private readonly pivotThreshold = 0.1;

  /**
   * Analyze the union sparsity pattern of G and C.
   * The complex matrix (G + jwC) has non-zeros wherever G or C has non-zeros.
   */
  analyzePattern(G: CscMatrix, C: CscMatrix): void {
    const n = G.size;
    this.n = n;

    // Build symmetric adjacency for the union pattern of G and C
    const symAdj = buildUnionSymmetricAdjacency(G, C);

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

      // Propagate fill-in
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

    // Pre-allocate all arrays
    this.lColPtr = new Int32Array(n + 1);
    this.lRows = new Int32Array(lNnz);
    this.lValuesRe = new Float64Array(lNnz);
    this.lValuesIm = new Float64Array(lNnz);
    this.uColPtr = new Int32Array(n + 1);
    this.uRows = new Int32Array(uNnz);
    this.uValuesRe = new Float64Array(uNnz);
    this.uValuesIm = new Float64Array(uNnz);
    this.perm = new Int32Array(n);
    this.workspaceRe = new Float64Array(n);
    this.workspaceIm = new Float64Array(n);
    this.workYRe = new Float64Array(n);
    this.workYIm = new Float64Array(n);
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

  /**
   * Factor (G + jwC) using left-looking column-Crout with complex arithmetic.
   *
   * A_re[i,j] = G[i,j],  A_im[i,j] = omega * C[i,j]
   */
  factorize(G: CscMatrix, C: CscMatrix, omega: number): void {
    if (!this.analyzed) {
      throw new Error('Must call analyzePattern before factorize');
    }

    const n = this.n;
    const perm = this.perm;
    const wsRe = this.workspaceRe;
    const wsIm = this.workspaceIm;
    const lColPtr = this.lColPtr;
    const lRows = this.lRows;
    const lRe = this.lValuesRe;
    const lIm = this.lValuesIm;
    const uColPtr = this.uColPtr;
    const uRows = this.uRows;
    const uRe = this.uValuesRe;
    const uIm = this.uValuesIm;
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

      // === Step 1: SCATTER column j of (G + jwC) into workspace ===
      // Real part from G
      for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) {
        const origRow = G.rowIdx[p];
        wsRe[origRow] = G.values[p];
        if (nonzeroFlag[origRow] !== j) {
          nonzeroFlag[origRow] = j;
          nonzeroList[nonzeroCount++] = origRow;
        }
      }
      // Imaginary part from omega * C
      for (let p = C.colPtr[j]; p < C.colPtr[j + 1]; p++) {
        const origRow = C.rowIdx[p];
        wsIm[origRow] = omega * C.values[p];
        if (nonzeroFlag[origRow] !== j) {
          nonzeroFlag[origRow] = j;
          nonzeroList[nonzeroCount++] = origRow;
        }
      }

      // === Step 2: LEFT-LOOKING sparse triangular solve ===
      let activeCount = 0;
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        const k = pinv[origRow];
        if (k >= 0 && k < j && (wsRe[origRow] !== 0 || wsIm[origRow] !== 0)) {
          activeK[activeCount++] = k;
        }
      }
      sortInt32Prefix(activeK, activeCount);

      let ki = 0;
      while (ki < activeCount) {
        const k = activeK[ki];
        ki++;

        const pr = pivotOrigRow[k];
        const ukjRe = wsRe[pr];
        const ukjIm = wsIm[pr];
        if (ukjRe === 0 && ukjIm === 0) continue;

        // Store U[k,j] (complex)
        uRows[up] = k;
        uRe[up] = ukjRe;
        uIm[up] = ukjIm;
        up++;

        // Apply L column k: subtract L[i,k] * U[k,j] from workspace
        // (a+bi)(c+di) = (ac-bd) + (ad+bc)i
        for (let p = lColPtr[k]; p < lColPtr[k + 1]; p++) {
          const origI = lTempOrigRows[p];
          const likRe = lRe[p];
          const likIm = lIm[p];
          // product = L[i,k] * U[k,j]
          const prodRe = likRe * ukjRe - likIm * ukjIm;
          const prodIm = likRe * ukjIm + likIm * ukjRe;
          wsRe[origI] -= prodRe;
          wsIm[origI] -= prodIm;

          if (nonzeroFlag[origI] !== j) {
            nonzeroFlag[origI] = j;
            nonzeroList[nonzeroCount++] = origI;
            const k2 = pinv[origI];
            if (k2 >= 0 && k2 < j && k2 > k) {
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

      // === Step 3: THRESHOLD PIVOTING (compare magnitudes) ===
      let maxMag = 0;
      let maxOrigRow = -1;
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        if (pinv[origRow] < 0) {
          const re = wsRe[origRow];
          const im = wsIm[origRow];
          const mag = Math.sqrt(re * re + im * im);
          if (mag > maxMag) {
            maxMag = mag;
            maxOrigRow = origRow;
          }
        }
      }

      if (maxMag < 1e-18) {
        throw new Error(`Singular matrix at column ${j}`);
      }

      // For complex MNA matrices, strongly prefer the natural diagonal row.
      // The MNA ordering is structurally correct: node diagonals have GMIN + jwC,
      // branch diagonals have structural 1s or -L. Only swap if the natural
      // row is truly zero (< 1e-18), not based on threshold comparison —
      // threshold pivoting incorrectly swaps small purely-imaginary diagonals
      // (from jwC at low frequencies) with larger real off-diagonals.
      const natOrigRow = perm[j];
      let chosenOrigRow: number;
      if (pinv[natOrigRow] < 0) {
        const natRe = wsRe[natOrigRow];
        const natIm = wsIm[natOrigRow];
        const natMag = Math.sqrt(natRe * natRe + natIm * natIm);
        if (natMag >= 1e-18) {
          chosenOrigRow = natOrigRow;
        } else {
          chosenOrigRow = maxOrigRow;
        }
      } else {
        chosenOrigRow = maxOrigRow;
      }

      const pivRe = wsRe[chosenOrigRow];
      const pivIm = wsIm[chosenOrigRow];
      const pivMag2 = pivRe * pivRe + pivIm * pivIm;
      if (pivMag2 < 1e-36) {
        throw new Error(`Singular matrix at column ${j}`);
      }

      // Record pivot assignment
      pivotOrigRow[j] = chosenOrigRow;
      pinv[chosenOrigRow] = j;

      // Update perm
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
      uRe[up] = pivRe;
      uIm[up] = pivIm;
      up++;

      // === Step 4: STORE L column j ===
      // L[i,j] = workspace[origRow] / pivot (complex division)
      // (a+bi) / (c+di) = ((ac+bd) + (bc-ad)i) / (c^2+d^2)
      for (let t = 0; t < nonzeroCount; t++) {
        const origRow = nonzeroList[t];
        if (origRow !== chosenOrigRow && pinv[origRow] < 0 &&
            (wsRe[origRow] !== 0 || wsIm[origRow] !== 0)) {
          const aRe = wsRe[origRow];
          const aIm = wsIm[origRow];
          lTempOrigRows[lp] = origRow;
          lRe[lp] = (aRe * pivRe + aIm * pivIm) / pivMag2;
          lIm[lp] = (aIm * pivRe - aRe * pivIm) / pivMag2;
          lp++;
        }
      }

      // === Step 5: CLEAR workspace (only touched positions) ===
      for (let t = 0; t < nonzeroCount; t++) {
        const idx = nonzeroList[t];
        wsRe[idx] = 0;
        wsIm[idx] = 0;
      }

    }

    lColPtr[n] = lp;
    uColPtr[n] = up;

    // === Step 6: Convert L row indices from original rows to elimination positions ===
    for (let k = 0; k < n; k++) {
      pinv[perm[k]] = k;
    }
    for (let p = 0; p < lp; p++) {
      lRows[p] = pinv[lTempOrigRows[p]];
    }

    this.factorized = true;
  }

  /**
   * Solve (G + jwC)x = b using forward/backward substitution with complex arithmetic.
   * Returns [xReal, xImag].
   */
  solve(bReal: Float64Array, bImag: Float64Array): [Float64Array, Float64Array] {
    if (!this.factorized) {
      throw new Error('Must call factorize before solve');
    }

    const n = this.n;
    const perm = this.perm;
    const lColPtr = this.lColPtr;
    const lRows = this.lRows;
    const lRe = this.lValuesRe;
    const lIm = this.lValuesIm;
    const uColPtr = this.uColPtr;
    const uRows = this.uRows;
    const uRe = this.uValuesRe;
    const uIm = this.uValuesIm;
    const uDiagIdx = this.uDiagIdx;
    const yRe = this.workYRe;
    const yIm = this.workYIm;

    // Apply permutation: y = Pb
    for (let k = 0; k < n; k++) {
      yRe[k] = bReal[perm[k]];
      yIm[k] = bImag[perm[k]];
    }

    // Forward substitution: Ly = Pb (L is unit lower triangular)
    // y[i] -= L[i,j] * y[j]  (complex multiply)
    for (let j = 0; j < n; j++) {
      const yjRe = yRe[j];
      const yjIm = yIm[j];
      for (let p = lColPtr[j]; p < lColPtr[j + 1]; p++) {
        const i = lRows[p];
        const lijRe = lRe[p];
        const lijIm = lIm[p];
        yRe[i] -= lijRe * yjRe - lijIm * yjIm;
        yIm[i] -= lijRe * yjIm + lijIm * yjRe;
      }
    }

    // Backward substitution: Ux = y
    // x[j] = y[j] / U[j,j]  (complex division)
    const xRe = new Float64Array(n);
    const xIm = new Float64Array(n);
    for (let j = n - 1; j >= 0; j--) {
      // Complex divide: y[j] / U[j,j]
      const dRe = uRe[uDiagIdx[j]];
      const dIm = uIm[uDiagIdx[j]];
      const dMag2 = dRe * dRe + dIm * dIm;
      xRe[j] = (yRe[j] * dRe + yIm[j] * dIm) / dMag2;
      xIm[j] = (yIm[j] * dRe - yRe[j] * dIm) / dMag2;

      // Update y: y[i] -= U[i,j] * x[j]
      for (let p = uColPtr[j]; p < uColPtr[j + 1]; p++) {
        const i = uRows[p];
        if (i < j) {
          const uijRe = uRe[p];
          const uijIm = uIm[p];
          yRe[i] -= uijRe * xRe[j] - uijIm * xIm[j];
          yIm[i] -= uijRe * xIm[j] + uijIm * xRe[j];
        }
      }
    }

    return [xRe, xIm];
  }
}

/**
 * Sort the first `count` elements of an Int32Array in ascending order (insertion sort).
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
 * Build symmetric adjacency lists from the union of two CSC matrices.
 * For each column j, returns the set of rows i such that G[i,j] != 0 OR G[j,i] != 0
 * OR C[i,j] != 0 OR C[j,i] != 0.
 */
function buildUnionSymmetricAdjacency(G: CscMatrix, C: CscMatrix): number[][] {
  const n = G.size;
  const adj: Set<number>[] = new Array(n);
  for (let j = 0; j < n; j++) adj[j] = new Set();

  // Add entries from G
  for (let j = 0; j < n; j++) {
    for (let p = G.colPtr[j]; p < G.colPtr[j + 1]; p++) {
      const i = G.rowIdx[p];
      adj[j].add(i);
      adj[i].add(j);
    }
  }

  // Add entries from C
  for (let j = 0; j < n; j++) {
    for (let p = C.colPtr[j]; p < C.colPtr[j + 1]; p++) {
      const i = C.rowIdx[p];
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
