// node scaling-table.mjs <scaling-m2.json>: spice-ts vs ngspice table (medians)
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const f = x => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
const ratio = (a, b) => (a >= b ? `${(a / b).toFixed(2)}x slower` : `${(a / b).toFixed(2)}x (faster)`);
console.log('| workload | nodes | spice-ts total median (min) ms | ngspice KLU wall median (min) ms | spice-ts analysis median ms | ngspice analysis median ms | spice-ts / ngspice wall | spice-ts / ngspice analysis | timepoints spice-ts / ngspice |');
console.log('|---|---:|---:|---:|---:|---:|---|---|---|');
for (const row of j.rows) {
  const s = row.cells.find(c => c.engine === 'spice-ts');
  const n = row.cells.find(c => c.engine === 'ngspice');
  if (s?.status !== 'ok' || n?.status !== 'ok') {
    console.log(`| ${row.circuit} | ${row.actualNodes} | ${s?.status} | ${n?.status} | | | | | |`);
    continue;
  }
  const tp = c => c.samples[0].timepoints ?? 'op';
  console.log(`| ${row.circuit} | ${row.actualNodes.toLocaleString('en-US')} | ${f(s.totalStatsMs.median)} (${f(s.totalStatsMs.min)}) | ${f(n.totalStatsMs.median)} (${f(n.totalStatsMs.min)}) | ${f(s.analysisStatsMs.median)} | ${f(n.analysisStatsMs.median)} | ${ratio(s.totalStatsMs.median, n.totalStatsMs.median)} | ${ratio(s.analysisStatsMs.median, n.analysisStatsMs.median)} | ${tp(s)} / ${tp(n)} |`);
}
