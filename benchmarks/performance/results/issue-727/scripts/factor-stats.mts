#!/usr/bin/env tsx
/**
 * Issue #727: per-cell factorisation statistics on the M2 scaling decks.
 * For the last full numeric factorisation of each simulate(): matrix order,
 * nnz(A), nnz(L), nnz(U) and the multiply-subtract count of the left-looking
 * update (sum over off-diagonal U[k,j] of nnz(L[:,k])). Deterministic, so it
 * does not depend on machine load.
 *
 *   npx tsx benchmarks/performance/results/issue-727/scripts/factor-stats.mts [circuit:nodes ...]
 */
import { GilbertPeierlsSolver } from '../../../../../packages/core/src/solver/gilbert-peierls.js';
import { simulate } from '../../../../../packages/core/src/simulate.js';
import { m2Netlist } from '../../../scaling-m2-fixture.mjs';

const cells = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  'rc-ladder-tran:50000', 'resistor-mesh-op:10000', 'resistor-mesh-op:50000',
  'cmos-inverter-chain-tran:10000',
];

type Internals = {
  n: number; lColPtr: Int32Array; uColPtr: Int32Array; uRows: Int32Array;
  numericFactorizations: number;
};
let last: { n: number; nnzA: number; nnzL: number; nnzU: number; flops: number } | null = null;
let calls = 0;
let numeric = 0;
const original = GilbertPeierlsSolver.prototype.factorize;
GilbertPeierlsSolver.prototype.factorize = function (this: GilbertPeierlsSolver, A) {
  const self = this as unknown as Internals;
  const before = self.numericFactorizations;
  calls++;
  original.call(this, A);
  if (self.numericFactorizations === before) return;
  numeric++;
  const { n, lColPtr, uColPtr, uRows } = self;
  let flops = 0;
  for (let j = 0; j < n; j++) {
    // The last U entry of a column is its diagonal.
    for (let p = uColPtr[j]; p < uColPtr[j + 1] - 1; p++) {
      const k = uRows[p];
      flops += lColPtr[k + 1] - lColPtr[k];
    }
  }
  last = { n, nnzA: A.colPtr[n], nnzL: lColPtr[n], nnzU: uColPtr[n], flops };
};

console.log('| cell | n | nnz(A) | nnz(L) | nnz(U) | fill (L+U)/A | update mult-subs | factorize() calls | numeric |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const cell of cells) {
  const [circuit, nodes] = cell.split(':');
  calls = 0; numeric = 0; last = null;
  await simulate(m2Netlist(circuit, Number(nodes)).netlist);
  const s = last!;
  console.log(`| ${cell} | ${s.n} | ${s.nnzA} | ${s.nnzL} | ${s.nnzU} | ${((s.nnzL + s.nnzU) / s.nnzA).toFixed(1)} | ${s.flops} | ${calls} | ${numeric} |`);
}
