import { describe, expect, it } from 'vitest';
import { amdOrdering } from './amd-ordering.js';
import { toCsc, type CscMatrix } from './csc-matrix.js';
import { SparseMatrix } from './sparse-matrix.js';

/**
 * Issue #693: amdOrdering moved from per-variable JS arrays and typed-array
 * views to flat typed storage. The fill-reducing order decides the LU pivot
 * sequence and hence every result bit, so the new implementation must return
 * exactly the order of the pre-#693 implementation, frozen verbatim below
 * (main be4c3c01, renamed only), on grids (many degree ties), rails (dense
 * rows), disconnected patterns and random nonsymmetric patterns.
 */

// ---- Frozen pre-#693 amdOrdering ----
function referenceAmdOrdering(A: CscMatrix): Int32Array {
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

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resistor grid with a voltage-source branch row (the #426 mesh OP pattern). */
function gridMna(rows: number, cols: number): CscMatrix {
  const n = rows * cols;
  const m = new SparseMatrix(n + 1);
  const idx = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
        if (r2 >= rows || c2 >= cols) continue;
        const i = idx(r, c);
        const j = idx(r2, c2);
        m.add(i, i, 1); m.add(j, j, 1); m.add(i, j, -1); m.add(j, i, -1);
      }
    }
  }
  m.add(n - 1, n - 1, 1);
  m.add(0, n, 1); m.add(n, 0, 1);
  return toCsc(m).csc;
}

/** Random pattern; `rails` rows/columns connect to most variables (dense rows). */
function randomPattern(n: number, density: number, next: () => number, symmetric: boolean, rails: number): CscMatrix {
  const m = new SparseMatrix(n);
  for (let i = 0; i < n; i++) {
    if (next() < 0.8) m.add(i, i, 1);
    for (let j = 0; j < n; j++) {
      if (i === j || next() >= density) continue;
      m.add(i, j, 1);
      if (symmetric) m.add(j, i, 1);
    }
  }
  for (let r = 0; r < rails; r++) {
    const rail = Math.floor(next() * n);
    for (let j = 0; j < n; j++) {
      if (j !== rail && next() < 0.9) { m.add(rail, j, 1); m.add(j, rail, 1); }
    }
  }
  return toCsc(m).csc;
}

/** Disjoint chains, a star and random edges among the remaining variables. */
function forestPattern(next: () => number): CscMatrix {
  const n = 120;
  const m = new SparseMatrix(n);
  for (let i = 0; i < n; i++) m.add(i, i, 1);
  for (let i = 0; i + 1 < 40; i++) { m.add(i, i + 1, 1); m.add(i + 1, i, 1); }
  for (let leaf = 41; leaf < 80; leaf++) { m.add(40, leaf, 1); m.add(leaf, 40, 1); }
  for (let t = 0; t < 30; t++) {
    const a = 80 + Math.floor(next() * 30);
    const b = 80 + Math.floor(next() * 30);
    if (a !== b) m.add(a, b, 1);
  }
  return toCsc(m).csc;
}

function expectSameOrder(A: CscMatrix, label: string): void {
  const expected = referenceAmdOrdering(A);
  const actual = amdOrdering(A);
  expect(actual.length, label).toBe(expected.length);
  for (let k = 0; k < expected.length; k++) {
    if (actual[k] !== expected[k]) {
      throw new Error(`${label}: order[${k}] = ${actual[k]}, frozen implementation gives ${expected[k]}`);
    }
  }
}

describe('amdOrdering equivalence with the frozen pre-#693 implementation', () => {
  it('returns the same order on square and rectangular resistor grids', () => {
    for (const [rows, cols] of [[1, 1], [2, 2], [3, 7], [10, 10], [17, 23], [32, 32], [60, 60]]) {
      expectSameOrder(gridMna(rows, cols), `grid ${rows}x${cols}`);
    }
  });

  it('returns the same order on random symmetric and nonsymmetric patterns, with dense rows', () => {
    const next = rng(693);
    for (let trial = 0; trial < 120; trial++) {
      const n = 5 + Math.floor(next() * 150);
      const density = [0.01, 0.03, 0.08, 0.2][trial % 4];
      const rails = trial % 5 === 0 ? 1 + (trial % 3) : 0;
      expectSameOrder(randomPattern(n, density, next, trial % 2 === 0, rails), `random #${trial} (n=${n})`);
    }
  });

  it('returns the same order on disconnected chains, stars and isolated variables', () => {
    const next = rng(426);
    for (let trial = 0; trial < 10; trial++) expectSameOrder(forestPattern(next), `forest #${trial}`);
  });
});
