/**
 * Issue #727 kernel micro-benchmark: full factorize() of a side x side
 * resistor-grid MNA (plus one voltage-source branch), timed per call.
 *
 *   npx tsx benchmarks/performance/results/issue-727/scripts/factor-bench.mts [side] [reps]
 *
 * GP_MODULE=<path to a gilbert-peierls.ts or .js> benchmarks another kernel
 * (e.g. main's file checked out next to this branch's).
 */
import { SparseMatrix } from '../../../../../packages/core/src/solver/sparse-matrix.js';
import { toCsc } from '../../../../../packages/core/src/solver/csc-matrix.js';
const { GilbertPeierlsSolver } = await import(process.env.GP_MODULE ?? '../../../../../packages/core/src/solver/gilbert-peierls.js');

const side = Number(process.argv[2] ?? 224);
const reps = Number(process.argv[3] ?? 7);
const n = side * side;
const m = new SparseMatrix(n + 1);
const idx = (r: number, c: number) => r * side + c;
for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) {
  for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
    if (r2 >= side || c2 >= side) continue;
    const g = 1e-3; const i = idx(r, c); const j = idx(r2, c2);
    m.add(i, i, g); m.add(j, j, g); m.add(i, j, -g); m.add(j, i, -g);
  }
}
m.add(n - 1, n - 1, 1e-3); m.add(0, n, 1); m.add(n, 0, 1);
const A = toCsc(m).csc;
const solver = new GilbertPeierlsSolver();
solver.analyzePattern(A);
const times: number[] = [];
for (let i = 0; i < reps; i++) {
  const values = A.values.slice();
  // Fresh structure arrays defeat both the identical-input skip and pivot reuse.
  const C = { size: A.size, colPtr: A.colPtr.slice(), rowIdx: A.rowIdx.slice(), values };
  const t = performance.now();
  solver.factorize(C);
  times.push(performance.now() - t);
}
const s = [...times].sort((a, b) => a - b);
console.log(`grid ${side}: factorize ms min ${s[0].toFixed(1)} median ${s[s.length >> 1].toFixed(1)} | supernodal ${(solver as { supernodalUpdates?: number }).supernodalUpdates ?? 'n/a'}`);
