/**
 * Issue #779 kernel micro-benchmark: what one simulate() pays for the real LU
 * of a side x side resistor-grid MNA (plus one voltage-source branch) when the
 * solver is NEW, as in every simulate(): analyzePattern() and the first full
 * factorize() of a fresh GilbertPeierlsSolver, then a second full factorize()
 * on the same (grown) solver for comparison.
 *
 *   npx tsx benchmarks/performance/results/issue-779/scripts/fresh-factor-bench.mts [side] [reps]
 *
 * GP_MODULE=<path to a gilbert-peierls.ts or .js> benchmarks another kernel.
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
const fresh = (): typeof A => ({ size: A.size, colPtr: A.colPtr.slice(), rowIdx: A.rowIdx.slice(), values: A.values.slice() });
const analyze: number[] = [];
const first: number[] = [];
const second: number[] = [];
let digest = 0;
for (let i = 0; i < reps; i++) {
  const solver = new GilbertPeierlsSolver();
  const C = fresh();
  let t = performance.now();
  solver.analyzePattern(C);
  analyze.push(performance.now() - t);
  t = performance.now();
  solver.factorize(C);
  first.push(performance.now() - t);
  const D = fresh();
  t = performance.now();
  solver.factorize(D);
  second.push(performance.now() - t);
  const b = new Float64Array(n + 1); b[n] = 1;
  const x = solver.solve(b);
  digest = x[n - 1];
}
const med = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1].toFixed(1);
const min = (v: number[]) => Math.min(...v).toFixed(1);
console.log(`grid ${side}: analyzePattern ms median ${med(analyze)} | first factorize (fresh solver) min ${min(first)} median ${med(first)} | second factorize min ${min(second)} median ${med(second)} | x[n-1] ${digest}`);
