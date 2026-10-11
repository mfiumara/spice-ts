import type { CscMatrix } from './csc-matrix.js';

/**
 * Approximate minimum degree (AMD-style) fill-reducing ordering.
 *
 * Returns `order` with `order[k] = j`: original column/row `j` is eliminated
 * at step `k`. The ordering is computed on the symmetric pattern of A + Aᵀ
 * (diagonal ignored), so it is meant to be applied symmetrically: the LU
 * factorization visits column `order[k]` at step `k` and prefers row
 * `order[k]` as its pivot, leaving threshold row pivoting free to deviate when
 * the numeric diagonal is too small.
 *
 * The algorithm is an original implementation of the quotient-graph minimum
 * degree method described by Amestoy, Davis and Duff ("An approximate minimum
 * degree ordering algorithm", SIAM J. Matrix Anal. Appl. 17(4), 1996):
 *
 * - Eliminated variables become *elements*; the fill they create is never
 *   materialised as explicit cliques, so memory stays O(nnz(A) + n).
 * - Element absorption: every element adjacent to the pivot is merged into the
 *   new element, and any element whose remaining variables are a subset of the
 *   new element is absorbed aggressively.
 * - Degrees of the affected variables are updated with the AMD approximate
 *   external-degree bound |Aᵢ \ Lₚ| + |Lₚ \ {i}| + Σₑ |Lₑ \ Lₚ|.
 * - Dense rows (degree above max(16, 10·√n)) are removed up front and ordered
 *   last, as AMD does, so a node shared by most of the circuit (a supply rail)
 *   cannot dominate the degree updates.
 *
 * Supervariable detection and mass elimination are omitted; they speed up the
 * ordering of matrices with many indistinguishable rows but do not change
 * which fill pattern a minimum-degree method converges to on circuit matrices.
 *
 * Ties are broken towards the lowest original index, so an already
 * fill-free natural order (diagonal, tridiagonal, ladder) is preserved.
 */
export function amdOrdering(A: CscMatrix): Int32Array {
  const n = A.size;
  const order = new Int32Array(n);
  if (n === 0) return order;

  // ---- Symmetric adjacency of A + Aᵀ without the diagonal (CSR layout). ----
  const counts = new Int32Array(n + 1);
  for (let j = 0; j < n; j++) {
    for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
      const i = A.rowIdx[p];
      if (i === j) continue;
      counts[i]++;
      counts[j]++;
    }
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + counts[i];
  const fill = start.slice(0, n);
  const raw = new Int32Array(start[n]);
  for (let j = 0; j < n; j++) {
    for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
      const i = A.rowIdx[p];
      if (i === j) continue;
      raw[fill[i]++] = j;
      raw[fill[j]++] = i;
    }
  }

  // Deduplicate each row (A and Aᵀ both contribute symmetric entries).
  const mark = new Int32Array(n).fill(-1);
  const varAdj: (Int32Array | null)[] = new Array(n);
  const degree = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let len = 0;
    for (let p = start[i]; p < start[i + 1]; p++) {
      const v = raw[p];
      if (mark[v] !== i) {
        mark[v] = i;
        raw[start[i] + len++] = v;
      }
    }
    varAdj[i] = raw.subarray(start[i], start[i] + len);
    degree[i] = len;
  }

  // ---- Status: 0 live variable, 1 live element, 2 absorbed/dead, 3 dense. ----
  const status = new Uint8Array(n);
  const denseThreshold = Math.max(16, Math.floor(10 * Math.sqrt(n)));
  let denseCount = 0;
  for (let i = 0; i < n; i++) {
    if (degree[i] > denseThreshold) {
      status[i] = 3;
      denseCount++;
    }
  }
  if (denseCount > 0) {
    for (let i = 0; i < n; i++) {
      if (status[i] === 3) continue;
      const adj = varAdj[i]!;
      let len = 0;
      for (let t = 0; t < adj.length; t++) {
        if (status[adj[t]] !== 3) adj[len++] = adj[t];
      }
      varAdj[i] = adj.subarray(0, len);
      degree[i] = len;
    }
  }

  const varElems: (number[] | null)[] = new Array(n);
  const elemVars: (Int32Array | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) varElems[i] = [];

  // ---- Degree buckets: doubly linked lists, head insertion. ----
  const head = new Int32Array(n).fill(-1);
  const next = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const insert = (i: number, d: number): void => {
    const h = head[d];
    next[i] = h;
    prev[i] = -1;
    if (h !== -1) prev[h] = i;
    head[d] = i;
  };
  const remove = (i: number, d: number): void => {
    if (prev[i] !== -1) next[prev[i]] = next[i];
    else head[d] = next[i];
    if (next[i] !== -1) prev[next[i]] = prev[i];
  };
  // Insert in descending index order so each bucket is ascending from its head.
  for (let i = n - 1; i >= 0; i--) {
    if (status[i] === 0) insert(i, degree[i]);
  }

  // w[e] holds |Lₑ \ Lₚ| for elements touched by the current pivot.
  const w = new Int32Array(n);
  const wMark = new Int32Array(n).fill(-1);
  mark.fill(-1);

  let minDegree = 0;
  let k = 0;
  let live = n - denseCount;
  const lp: number[] = [];

  while (live > 0) {
    // ---- Select the minimum-degree variable. ----
    while (head[minDegree] === -1) minDegree++;
    const p = head[minDegree];
    remove(p, minDegree);
    order[k++] = p;
    live--;
    status[p] = 1;

    // ---- Lₚ = (Aₚ ∪ ⋃ Lₑ for e ∈ Eₚ) \ {p}; absorb every e ∈ Eₚ. ----
    lp.length = 0;
    mark[p] = p;
    const adjP = varAdj[p]!;
    for (let t = 0; t < adjP.length; t++) {
      const v = adjP[t];
      if (status[v] === 0 && mark[v] !== p) {
        mark[v] = p;
        lp.push(v);
      }
    }
    const elemsP = varElems[p]!;
    for (let t = 0; t < elemsP.length; t++) {
      const e = elemsP[t];
      if (status[e] !== 1) continue;
      const le = elemVars[e]!;
      for (let s = 0; s < le.length; s++) {
        const v = le[s];
        if (status[v] === 0 && mark[v] !== p) {
          mark[v] = p;
          lp.push(v);
        }
      }
      status[e] = 2;
      elemVars[e] = null;
    }
    varAdj[p] = null;
    varElems[p] = null;
    const lpLen = lp.length;
    // Ascending variable order; the degree update below walks it backwards so
    // head insertion leaves the lowest index first among equal degrees.
    const lpSorted = Int32Array.from(lp).sort();
    elemVars[p] = lpSorted;

    // ---- w[e] = |Lₑ \ Lₚ| for every live element adjacent to Lₚ. ----
    // Live elements only ever contain live variables: eliminating a variable
    // absorbs every element it belongs to, so |Lₑ| is the stored length.
    for (let t = 0; t < lpLen; t++) {
      const elems = varElems[lp[t]]!;
      for (let s = 0; s < elems.length; s++) {
        const e = elems[s];
        if (status[e] !== 1) continue;
        if (wMark[e] !== p) {
          wMark[e] = p;
          w[e] = elemVars[e]!.length;
        }
        w[e]--;
      }
    }

    // ---- Update the quotient graph and approximate degrees of Lₚ. ----
    for (let t = lpLen - 1; t >= 0; t--) {
      const i = lpSorted[t];
      const oldDegree = degree[i];
      remove(i, oldDegree);

      const elems = varElems[i]!;
      let elemLen = 0;
      let d = lpLen - 1;
      for (let s = 0; s < elems.length; s++) {
        const e = elems[s];
        if (status[e] !== 1) continue;
        if (w[e] === 0) {
          // Lₑ ⊆ Lₚ: aggressive absorption into the new element.
          status[e] = 2;
          elemVars[e] = null;
          continue;
        }
        d += w[e];
        elems[elemLen++] = e;
      }
      elems.length = elemLen;
      elems.push(p);

      // Variables covered by Lₚ are now reached through element p.
      const adj = varAdj[i]!;
      let adjLen = 0;
      for (let s = 0; s < adj.length; s++) {
        const v = adj[s];
        if (status[v] === 0 && mark[v] !== p) adj[adjLen++] = v;
      }
      varAdj[i] = adj.subarray(0, adjLen);
      d += adjLen;

      // The approximate degree never exceeds the remaining variable count
      // nor the previous degree plus the new element's contribution.
      d = Math.min(d, live - 1, oldDegree + lpLen - 1);
      if (d < 0) d = 0;
      degree[i] = d;
      insert(i, d);
      if (d < minDegree) minDegree = d;
    }
  }

  // ---- Dense rows go last, in ascending index order. ----
  for (let i = 0; i < n; i++) {
    if (status[i] === 3) order[k++] = i;
  }
  return order;
}
