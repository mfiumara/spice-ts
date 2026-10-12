import type { CscMatrix } from './csc-matrix.js';

/** Column order and preferred pivot rows for a left-looking LU. */
export interface PivotPreorder {
  /** colPerm[k] = j: original column j is factorized at step k. */
  colPerm: Int32Array;
  /** rowPref[k] = i: original row i is the preferred pivot at step k. */
  rowPref: Int32Array;
}

/**
 * Move structural column singletons ahead of a fill-reducing order.
 *
 * Same rule as the real Gilbert-Peierls solver's pre-ordering (#568): a
 * column whose stored entries all lie in already-claimed rows except one can
 * only pivot on that row, so it is pivoted first, as ngspice's Markowitz
 * search does (spOrderAndFactor → SearchForSingleton). Peeling is iterative,
 * so columns that become singletons once a row is claimed are also forced.
 * Peeled columns have empty L columns and add no fill. The remaining columns
 * keep their relative order in `order` and prefer their own (symmetrically
 * permuted) diagonal row; gaps are filled with the lowest unclaimed rows.
 * Stored explicit zeros count as structure.
 *
 * A copy of `columnSingletonsFirst` in gilbert-peierls.ts, which #740 was not
 * allowed to touch; the two must stay in step.
 */
export function columnSingletonsFirst(A: CscMatrix, order: Int32Array): PivotPreorder {
  const n = A.size;
  const { colPtr, rowIdx } = A;

  // Row-wise structure (CSR of the pattern) and unclaimed entries per column.
  const rowPtr = new Int32Array(n + 1);
  const remaining = new Int32Array(n);
  for (let j = 0; j < n; j++) {
    remaining[j] = colPtr[j + 1] - colPtr[j];
    for (let p = colPtr[j]; p < colPtr[j + 1]; p++) rowPtr[rowIdx[p] + 1]++;
  }
  for (let i = 0; i < n; i++) rowPtr[i + 1] += rowPtr[i];
  const rowCols = new Int32Array(rowPtr[n]);
  const fill = rowPtr.slice(0, n);
  for (let j = 0; j < n; j++) {
    for (let p = colPtr[j]; p < colPtr[j + 1]; p++) rowCols[fill[rowIdx[p]]++] = j;
  }

  const colPerm = new Int32Array(n);
  const rowPref = new Int32Array(n);
  const rowClaimed = new Uint8Array(n);
  const colPlaced = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let t = 0; t < n; t++) {
    if (remaining[order[t]] === 1) queue[tail++] = order[t];
  }

  let k = 0;
  while (head < tail) {
    const c = queue[head++];
    // A column can be queued once; it may since have lost its last row to
    // another singleton (structurally singular) — leave it to the main order.
    if (colPlaced[c] || remaining[c] !== 1) continue;
    let r = -1;
    for (let p = colPtr[c]; p < colPtr[c + 1]; p++) {
      if (!rowClaimed[rowIdx[p]]) { r = rowIdx[p]; break; }
    }
    colPlaced[c] = 1;
    rowClaimed[r] = 1;
    colPerm[k] = c;
    rowPref[k] = r;
    k++;
    for (let p = rowPtr[r]; p < rowPtr[r + 1]; p++) {
      const c2 = rowCols[p];
      if (!colPlaced[c2] && --remaining[c2] === 1 && tail < n) queue[tail++] = c2;
    }
  }

  const firstRest = k;
  for (let t = 0; t < n; t++) {
    const c = order[t];
    if (colPlaced[c]) continue;
    colPerm[k] = c;
    if (!rowClaimed[c]) {
      rowClaimed[c] = 1;
      rowPref[k] = c;
    } else {
      rowPref[k] = -1;
    }
    k++;
  }
  let nextRow = 0;
  for (let t = firstRest; t < n; t++) {
    if (rowPref[t] >= 0) continue;
    while (rowClaimed[nextRow]) nextRow++;
    rowClaimed[nextRow] = 1;
    rowPref[t] = nextRow;
  }
  return { colPerm, rowPref };
}
