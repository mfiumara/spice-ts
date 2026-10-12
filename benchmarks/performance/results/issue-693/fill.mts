#!/usr/bin/env -S pnpm exec tsx
// Issue #693: fill of the #426 mesh OP matrix (side 32/100/224) under the AMD
// order vs a geometric nested-dissection order, via symbolic Cholesky counts of
// A + A^T, plus the stored factor nonzeros and one timed factorize().
//   pnpm exec tsx benchmarks/performance/results/issue-693/fill.mts

import { SparseMatrix } from '../../../../packages/core/src/solver/sparse-matrix.ts';
import { toCsc } from '../../../../packages/core/src/solver/csc-matrix.ts';
import { GilbertPeierlsSolver } from '../../../../packages/core/src/solver/gilbert-peierls.ts';
import { amdOrdering } from '../../../../packages/core/src/solver/amd-ordering.ts';

function mesh(side: number) {
  const n = side * side;
  const m = new SparseMatrix(n + 1);
  const idx = (r: number, c: number) => r * side + c;
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
    for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
      if (r2 >= side || c2 >= side) continue;
      const i = idx(r, c); const j = idx(r2, c2);
      m.add(i, i, 1e-3); m.add(j, j, 1e-3); m.add(i, j, -1e-3); m.add(j, i, -1e-3);
    }
  }
  m.add(n - 1, n - 1, 1e-3);
  m.add(0, n, 1); m.add(n, 0, 1);
  return toCsc(m).csc;
}

// symbolic Cholesky fill of A+A^T under order (elimination tree / row counts via simple quotient-free method)
function symbolicFill(A: any, order: Int32Array) {
  const n = A.size;
  const pos = new Int32Array(n); for (let k = 0; k < n; k++) pos[order[k]] = k;
  // adjacency in permuted space
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let j = 0; j < n; j++) for (let p = A.colPtr[j]; p < A.colPtr[j + 1]; p++) {
    const i = A.rowIdx[p]; if (i === j) continue;
    adj[pos[i]].push(pos[j]); adj[pos[j]].push(pos[i]);
  }
  // etree + column counts via row subtree traversal (Liu)
  const parent = new Int32Array(n).fill(-1), anc = new Int32Array(n).fill(-1);
  for (let k = 0; k < n; k++) for (const i0 of adj[k]) { if (i0 >= k) continue; let i = i0; while (anc[i] !== -1 && anc[i] !== k) { const t = anc[i]; anc[i] = k; i = t; } if (anc[i] === -1) { anc[i] = k; parent[i] = k; } }
  const mark = new Int32Array(n).fill(-1); const cnt = new Float64Array(n).fill(1); let nnzL = 0;
  for (let k = 0; k < n; k++) { mark[k] = k; for (const i0 of adj[k]) { if (i0 >= k) continue; let i = i0; while (mark[i] !== k) { mark[i] = k; cnt[i]++; nnzL++; i = parent[i]; } } }
  let flops = 0; for (let k = 0; k < n; k++) flops += (cnt[k] - 1) * (cnt[k] - 1);
  return { nnzL, flops };
}

function nestedDissection(side: number): Int32Array {
  const out: number[] = [];
  const rec = (r0: number, r1: number, c0: number, c1: number) => {
    const h = r1 - r0, w = c1 - c0; if (h <= 0 || w <= 0) return;
    if (h * w <= 4) { for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) out.push(r * side + c); return; }
    if (w >= h) { const m = (c0 + c1) >> 1; rec(r0, r1, c0, m); rec(r0, r1, m + 1, c1); for (let r = r0; r < r1; r++) out.push(r * side + m); }
    else { const m = (r0 + r1) >> 1; rec(r0, m, c0, c1); rec(m + 1, r1, c0, c1); for (let c = c0; c < c1; c++) out.push(m * side + c); }
  };
  rec(0, side, 0, side); out.push(side * side);
  return Int32Array.from(out);
}

for (const side of [32, 100, 224]) {
  const A = mesh(side);
  let t = performance.now(); const amd = amdOrdering(A); const tAmd = performance.now() - t;
  const s = new GilbertPeierlsSolver(); s.analyzePattern(A);
  t = performance.now(); s.factorize(A); const tF = performance.now() - t;
  const fa = symbolicFill(A, amd); const fn = symbolicFill(A, nestedDissection(side));
  console.log(JSON.stringify({ side, n: A.size, gpNnz: s.factorNonzeros(), amdL: fa.nnzL, amdFlops: fa.flops.toExponential(3), ndL: fn.nnzL, ndFlops: fn.flops.toExponential(3), tAmd: tAmd.toFixed(1), tFactor: tF.toFixed(1) }));
}
