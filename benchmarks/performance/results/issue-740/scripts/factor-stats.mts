/**
 * Issue #740: deterministic factorization statistics of the complex AC LU on
 * the #740 AC decks, with the AMD ordering (this change) and the natural MNA
 * order (as before #740, plus singletons first), from one in-process run
 * each. Reports, for the first frequency point: L+U non-zeros, row swaps,
 * and analyzePattern / first factorize time.
 *
 *   npx tsx benchmarks/performance/results/issue-740/scripts/factor-stats.mts vcvs-ladder-ac:2000 rc-mesh-ac:10000
 */
import { ComplexSparseSolver } from '../../../../../packages/core/src/solver/complex-sparse-solver.js';
import { simulate } from '../../../../../packages/core/src/simulate.js';
import { acNetlist } from './ac-fixture.mjs';

type Ordering = 'amd' | 'natural';
const proto = ComplexSparseSolver.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
const analyze = proto.analyzePattern;
const factorize = proto.factorize;

async function stats(circuit: string, nodes: number, ordering: Ordering) {
  const seen = { analyzeMs: 0, factorMs: 0, nnz: -1, swaps: -1, swapsMax: 0, factorizations: 0, n: 0 };
  proto.analyzePattern = function (this: Record<string, unknown>, ...args: unknown[]) {
    this.ordering = ordering;
    const t = performance.now();
    const out = analyze.apply(this, args);
    seen.analyzeMs += performance.now() - t;
    seen.n = (args[0] as { size: number }).size;
    return out;
  };
  proto.factorize = function (this: ComplexSparseSolver, ...args: unknown[]) {
    const t = performance.now();
    const out = factorize.apply(this, args);
    const ms = performance.now() - t;
    if (seen.factorizations === 0) {
      seen.factorMs = ms;
      seen.nnz = this.factorNonzeros();
      seen.swaps = this.rowSwaps();
    }
    seen.swapsMax = Math.max(seen.swapsMax, this.rowSwaps());
    seen.factorizations++;
    return out;
  };
  try {
    await simulate(acNetlist(circuit, nodes).netlist);
  } finally {
    proto.analyzePattern = analyze;
    proto.factorize = factorize;
  }
  return seen;
}

console.log('| deck | n | ordering | L+U nnz (first point) | row swaps first / max | analyzePattern ms | first factorize ms | factorizations |');
console.log('|---|---:|---|---:|---:|---:|---:|---:|');
for (const cell of process.argv.slice(2)) {
  const [circuit, nodes] = cell.split(':');
  for (const ordering of ['natural', 'amd'] as const) {
    const s = await stats(circuit, Number(nodes), ordering);
    console.log(`| ${circuit} | ${s.n} | ${ordering} | ${s.nnz} | ${s.swaps} / ${s.swapsMax} | ${s.analyzeMs.toFixed(1)} | ${s.factorMs.toFixed(1)} | ${s.factorizations} |`);
  }
}
