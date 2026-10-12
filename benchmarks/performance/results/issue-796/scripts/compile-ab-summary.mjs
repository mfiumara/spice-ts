#!/usr/bin/env node
/**
 * Issue #796: summarise compile-ab.sh output: per deck, the median over rounds
 * of each build's per-process median compile time, the paired per-round
 * speedup (main / branch, >1 = branch faster) and whether every digest matched.
 *
 *   node benchmarks/performance/results/issue-796/scripts/compile-ab-summary.mjs <compile-ab.jsonl>
 */
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(line => JSON.parse(line));
const cells = new Map();
for (const { build, round, result } of rows) {
  const key = `${result.circuit}:${result.nodes}`;
  if (!cells.has(key)) cells.set(key, { main: [], branch: [], digests: new Set() });
  const cell = cells.get(key);
  cell[build][round] = result.medianMs;
  cell.digests.add(result.digest);
}
const median = values => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
console.log('| deck | main compile median ms | branch compile median ms | paired speedup median (min..max) | digest identical |');
console.log('|---|---:|---:|---:|---|');
for (const [key, cell] of cells) {
  const ratios = cell.main.map((m, i) => m / cell.branch[i]);
  console.log(`| ${key} | ${median(cell.main).toFixed(2)} | ${median(cell.branch).toFixed(2)} | `
    + `${median(ratios).toFixed(2)}x (${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}) | `
    + `${cell.digests.size === 1 ? 'yes' : 'NO'} |`);
}
