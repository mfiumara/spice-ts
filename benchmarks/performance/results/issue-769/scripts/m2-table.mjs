#!/usr/bin/env node
/**
 * Issue #769: render the M2 before/after control table from two
 * scaling-m2.ts JSON outputs (same flags: --ngspice-solvers=klu --warmups=1
 * --runs=3). Medians of spice-ts total time and analysis time, ngspice-47
 * KLU wall and analysis time, the spice-ts/KLU analysis ratio, and whether the
 * spice-ts probe value is identical before and after.
 *
 *   node benchmarks/performance/results/issue-769/scripts/m2-table.mjs <before.json> <after.json>
 */
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('usage: m2-table.mjs <before.json> <after.json>');
const load = path => {
  const map = new Map();
  for (const row of JSON.parse(readFileSync(path, 'utf8')).rows) {
    for (const cell of row.cells) map.set(`${row.circuit}:${row.actualNodes}:${cell.engine}`, cell);
  }
  return map;
};
const before = load(beforePath);
const after = load(afterPath);
const fmt = ms => (ms === undefined ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms >= 100 ? 0 : 1)} ms`);
const keys = [...new Set([...before.keys()].map(key => key.split(':').slice(0, 2).join(':')))];
console.log('| deck | nodes | spice-ts total before / after | spice-ts analysis before / after | ngspice KLU wall before / after run | ngspice KLU analysis before / after run | spice-ts / KLU analysis, after run | probe identical |');
console.log('|---|---:|---:|---:|---:|---:|---:|---|');
for (const key of keys) {
  const [circuit, nodes] = key.split(':');
  const tb = before.get(`${key}:spice-ts`);
  const ta = after.get(`${key}:spice-ts`);
  const nb = before.get(`${key}:ngspice`);
  const na = after.get(`${key}:ngspice`);
  const probes = cell => (cell?.samples ?? []).map(sample => sample.probeValue);
  const same = probes(tb).length > 0 && [...probes(tb), ...probes(ta)].every(value => Object.is(value, probes(tb)[0]));
  const ratio = ta?.analysisStatsMs && na?.analysisStatsMs ? ta.analysisStatsMs.median / na.analysisStatsMs.median : undefined;
  console.log(`| ${circuit} | ${Number(nodes).toLocaleString('en-US')} | ${fmt(tb?.totalStatsMs?.median)} / ${fmt(ta?.totalStatsMs?.median)} | ${fmt(tb?.analysisStatsMs?.median)} / ${fmt(ta?.analysisStatsMs?.median)} | ${fmt(nb?.totalStatsMs?.median)} / ${fmt(na?.totalStatsMs?.median)} | ${fmt(nb?.analysisStatsMs?.median)} / ${fmt(na?.analysisStatsMs?.median)} | ${ratio === undefined ? '-' : `${ratio.toFixed(2)}x`} | ${same ? 'yes' : 'no'} |`);
}
