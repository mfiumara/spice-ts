#!/usr/bin/env node
// Issue #890: median table from two scaling-m2.ts JSON runs (base and branch dist,
// each with ngspice-47 KLU and Sparse 1.3 on the same decks).
//
//   node summary.mjs <scaling-base.json> <scaling-branch.json>
import { readFileSync } from 'node:fs';

const load = file => JSON.parse(readFileSync(file, 'utf8')).rows;
const [base, branch] = process.argv.slice(2).map(load);
const ms = v => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(0)} ms`);
const cell = (row, engine, solver) => row.cells.find(c => c.engine === engine && (solver === undefined || c.solver === solver));
console.log('| nodes | run | spice-ts total (analysis) | ngspice-47 KLU total (analysis) | ngspice-47 Sparse total (analysis) | spice-ts / KLU total | spice-ts / Sparse total | spice-ts analysis / KLU analysis |');
console.log('|---:|---|---:|---:|---:|---:|---:|---:|');
for (const [label, rows] of [['base', base], ['branch', branch]]) {
  for (const row of rows) {
    const s = cell(row, 'spice-ts');
    const k = cell(row, 'ngspice', 'klu');
    const p = cell(row, 'ngspice', 'sparse');
    const t = c => c.totalStatsMs.median;
    const a = c => c.analysisStatsMs.median;
    console.log(`| ${row.actualNodes} | ${label} | ${ms(t(s))} (${ms(a(s))}) | ${ms(t(k))} (${ms(a(k))}) | ${ms(t(p))} (${ms(a(p))}) | ${(t(s) / t(k)).toFixed(2)}x | ${(t(s) / t(p)).toFixed(2)}x | ${(a(s) / a(k)).toFixed(2)}x |`);
  }
}
