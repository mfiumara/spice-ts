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
 *   materialised as explicit cliques, so memory stays O(nnz(A) + n) plus the
 *   member lists of the elements created.
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
 *
 * Storage is flat typed arrays (#693): variable adjacency lives in place in
 * one array and shrinks by length only, element lists of each variable are
 * per-variable buffers that grow by doubling, and the member list of every
 * new element is appended to one arena. The pivot sequence is the same as
 * with per-variable JS arrays and typed-array views; only the allocations
 * per pivot are gone.
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
  // Variable i's adjacency is raw[start[i] .. start[i] + adjLen[i]).
  const mark = new Int32Array(n).fill(-1);
  const adjLen = new Int32Array(n);
  const degree = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let len = 0;
    const s0 = start[i];
    for (let p = s0; p < start[i + 1]; p++) {
      const v = raw[p];
      if (mark[v] !== i) {
        mark[v] = i;
        raw[s0 + len++] = v;
      }
    }
    adjLen[i] = len;
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
      const s0 = start[i];
      const end = s0 + adjLen[i];
      let len = 0;
      for (let t = s0; t < end; t++) {
        if (status[raw[t]] !== 3) raw[s0 + len++] = raw[t];
      }
      adjLen[i] = len;
      degree[i] = len;
    }
  }

  // Elements adjacent to each variable, in insertion order: varElems[i]
  // holds elemCount[i] entries. Buffers are allocated on first use.
  const varElems: (Int32Array | null)[] = new Array(n).fill(null);
  const elemCount = new Int32Array(n);
  // Member variables of each live element, ascending:
  // arena[elemStart[e] .. elemStart[e] + elemLen[e]).
  const elemStart = new Int32Array(n);
  const elemLen = new Int32Array(n);
  let arena = new Int32Array(Math.max(16, raw.length));
  let arenaTop = 0;

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
  // Lₚ in discovery order (the w pass walks it in this order).
  const lp = new Int32Array(n);

  while (live > 0) {
    // ---- Select the minimum-degree variable. ----
    while (head[minDegree] === -1) minDegree++;
    const p = head[minDegree];
    remove(p, minDegree);
    order[k++] = p;
    live--;
    status[p] = 1;

    // ---- Lₚ = (Aₚ ∪ ⋃ Lₑ for e ∈ Eₚ) \ {p}; absorb every e ∈ Eₚ. ----
    let lpLen = 0;
    mark[p] = p;
    const adjStartP = start[p];
    const adjEndP = adjStartP + adjLen[p];
    for (let t = adjStartP; t < adjEndP; t++) {
      const v = raw[t];
      if (status[v] === 0 && mark[v] !== p) {
        mark[v] = p;
        lp[lpLen++] = v;
      }
    }
    const elemsP = varElems[p];
    const elemsPCount = elemCount[p];
    for (let t = 0; t < elemsPCount; t++) {
      const e = elemsP![t];
      if (status[e] !== 1) continue;
      const es = elemStart[e];
      const ee = es + elemLen[e];
      for (let s = es; s < ee; s++) {
        const v = arena[s];
        if (status[v] === 0 && mark[v] !== p) {
          mark[v] = p;
          lp[lpLen++] = v;
        }
      }
      status[e] = 2;
    }
    adjLen[p] = 0;
    varElems[p] = null;
    elemCount[p] = 0;

    // Element p's members, ascending, appended to the arena. The degree
    // update below walks them backwards so head insertion leaves the lowest
    // index first among equal degrees.
    if (arenaTop + lpLen > arena.length) {
      const grown = new Int32Array(Math.max(arenaTop + lpLen, 2 * arena.length));
      grown.set(arena.subarray(0, arenaTop));
      arena = grown;
    }
    const lpStart = arenaTop;
    arena.set(lp.subarray(0, lpLen), lpStart);
    sortInt32Range(arena, lpStart, lpStart + lpLen);
    arenaTop += lpLen;
    elemStart[p] = lpStart;
    elemLen[p] = lpLen;

    // ---- w[e] = |Lₑ \ Lₚ| for every live element adjacent to Lₚ. ----
    // Live elements only ever contain live variables: eliminating a variable
    // absorbs every element it belongs to, so |Lₑ| is the stored length.
    for (let t = 0; t < lpLen; t++) {
      const v = lp[t];
      const elems = varElems[v];
      const count = elemCount[v];
      for (let s = 0; s < count; s++) {
        const e = elems![s];
        if (status[e] !== 1) continue;
        if (wMark[e] !== p) {
          wMark[e] = p;
          w[e] = elemLen[e];
        }
        w[e]--;
      }
    }

    // ---- Update the quotient graph and approximate degrees of Lₚ. ----
    for (let t = lpStart + lpLen - 1; t >= lpStart; t--) {
      const i = arena[t];
      const oldDegree = degree[i];
      remove(i, oldDegree);

      let elems = varElems[i];
      const count = elemCount[i];
      let kept = 0;
      let d = lpLen - 1;
      for (let s = 0; s < count; s++) {
        const e = elems![s];
        if (status[e] !== 1) continue;
        if (w[e] === 0) {
          // Lₑ ⊆ Lₚ: aggressive absorption into the new element.
          status[e] = 2;
          continue;
        }
        d += w[e];
        elems![kept++] = e;
      }
      if (elems === null || kept === elems.length) {
        const grown = new Int32Array(elems === null ? 4 : 2 * elems.length);
        if (elems !== null) grown.set(elems.subarray(0, kept));
        elems = varElems[i] = grown;
      }
      elems[kept++] = p;
      elemCount[i] = kept;

      // Variables covered by Lₚ are now reached through element p.
      const s0 = start[i];
      const end = s0 + adjLen[i];
      let len = 0;
      for (let s = s0; s < end; s++) {
        const v = raw[s];
        if (status[v] === 0 && mark[v] !== p) raw[s0 + len++] = v;
      }
      adjLen[i] = len;
      d += len;

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

/** Sort arr[from..to) ascending; the values are distinct variable indices. */
function sortInt32Range(arr: Int32Array, from: number, to: number): void {
  if (to - from > 32) {
    arr.subarray(from, to).sort();
    return;
  }
  for (let i = from + 1; i < to; i++) {
    const val = arr[i];
    let j = i - 1;
    while (j >= from && arr[j] > val) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = val;
  }
}
