/**
 * Issue #727: full factorizations (not pivot-reuse refactorizations, not
 * skipped identical inputs) per simulate() on M2 cells, and their total time.
 * Only full factorizations run the supernodal path.
 *
 *   npx tsx benchmarks/performance/results/issue-727/scripts/full-factor-count.mts [circuit:nodes ...]
 */
import { GilbertPeierlsSolver } from '../../../../../packages/core/src/solver/gilbert-peierls.js';
import { simulate } from '../../../../../packages/core/src/simulate.js';
import { m2Netlist } from '../../../scaling-m2-fixture.mjs';

const cells = process.argv.slice(2);
let full = 0;
let ms = 0;
const original = GilbertPeierlsSolver.prototype.factorize;
GilbertPeierlsSolver.prototype.factorize = function (this: GilbertPeierlsSolver, A) {
  const numeric = this.numericFactorizations;
  const reuse = this.pivotReuseFactorizations;
  const t = performance.now();
  original.call(this, A);
  const dt = performance.now() - t;
  if (this.numericFactorizations > numeric && this.pivotReuseFactorizations === reuse) { full++; ms += dt; }
};
console.log('| cell | full factorizations | their total ms |');
console.log('|---|---:|---:|');
for (const cell of cells) {
  const [circuit, nodes] = cell.split(':');
  full = 0; ms = 0;
  await simulate(m2Netlist(circuit, Number(nodes)).netlist);
  console.log(`| ${cell} | ${full} | ${ms.toFixed(1)} |`);
}
