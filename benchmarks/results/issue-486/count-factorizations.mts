#!/usr/bin/env tsx
/**
 * Issue #486: count factorize() calls and the numeric factorizations actually
 * performed (the rest reused bit-identical factors) on M2 scaling cells.
 * Deterministic, so it is independent of machine load.
 *
 *   npx tsx benchmarks/results/issue-486/count-factorizations.mts [circuit:nodes ...]
 */
import { GilbertPeierlsSolver } from '../../../packages/core/src/solver/gilbert-peierls.js';
import { simulate } from '../../../packages/core/src/simulate.js';
import { m2Netlist } from '../../performance/scaling-m2-fixture.mjs';

const cells = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  'rc-ladder-tran:1000', 'rc-ladder-tran:10000', 'rc-ladder-tran:50000',
  'resistor-mesh-op:1000', 'resistor-mesh-op:10000', 'resistor-mesh-op:50000',
  'cmos-inverter-chain-tran:1000', 'cmos-inverter-chain-tran:10000',
];

let calls = 0;
let numeric = 0;
const original = GilbertPeierlsSolver.prototype.factorize;
GilbertPeierlsSolver.prototype.factorize = function (this: GilbertPeierlsSolver, A) {
  const before = this.numericFactorizations;
  calls++;
  try {
    original.call(this, A);
  } finally {
    numeric += this.numericFactorizations - before;
  }
};

console.log('| cell | factorize() calls | numeric factorizations | reused |');
console.log('|---|---:|---:|---:|');
for (const cell of cells) {
  const [circuit, nodes] = cell.split(':');
  calls = 0;
  numeric = 0;
  await simulate(m2Netlist(circuit, Number(nodes)).netlist);
  console.log(`| ${cell} | ${calls} | ${numeric} | ${calls - numeric} (${((100 * (calls - numeric)) / calls).toFixed(1)}%) |`);
}
