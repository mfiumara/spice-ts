#!/usr/bin/env node
/**
 * Render the issue #426 M2 scaling JSON as the markdown tables used in
 * benchmarks/PERFORMANCE_BASELINE.md, so published numbers are never hand-copied.
 *
 *   node benchmarks/performance/scaling-m2-report.mjs [benchmarks/performance/results/scaling-m2.json]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'benchmarks/performance/results/scaling-m2.json';
const report = JSON.parse(readFileSync(file, 'utf8'));

const ms = value => {
  if (value === undefined) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ms`;
};
const cellText = cell => {
  if (!cell) return 'not run';
  if (cell.status !== 'ok') return `**${cell.status.toUpperCase()}**`;
  return `${ms(cell.totalStatsMs.median)} / ${ms(cell.totalStatsMs.p95)}`;
};
const ratio = (spiceTs, other, key = 'totalStatsMs') => {
  if (spiceTs?.status !== 'ok' || other?.status !== 'ok') return '-';
  const value = spiceTs[key].median / other[key].median;
  return value >= 1 ? `${value.toFixed(2)}x slower` : `${(1 / value).toFixed(2)}x faster`;
};

console.log(`Source: ${file} (generated ${report.generatedAt}, complete=${report.complete})\n`);
console.log('| Circuit | Nodes | spice-ts total median / p95 | ngspice KLU wall median / p95 | ngspice Sparse 1.3 wall median / p95 | spice-ts vs KLU wall | spice-ts vs Sparse wall |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (const row of report.rows) {
  const spiceTs = row.cells.find(cell => cell.engine === 'spice-ts');
  const klu = row.cells.find(cell => cell.solver === 'klu');
  const sparse = row.cells.find(cell => cell.solver === 'sparse');
  console.log(`| ${row.circuit} | ${row.actualNodes.toLocaleString('en-US')} | ${cellText(spiceTs)} | ${cellText(klu)} | ${cellText(sparse)} | ${ratio(spiceTs, klu)} | ${ratio(spiceTs, sparse)} |`);
}

console.log('\n| Circuit | Nodes | spice-ts parse | spice-ts compile+analysis | ngspice KLU load | ngspice KLU analysis | ngspice Sparse analysis | spice-ts analysis vs KLU analysis | timepoints spice-ts / ngspice | peak RSS spice-ts / KLU / Sparse | probe spice-ts / ngspice KLU |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const row of report.rows) {
  const spiceTs = row.cells.find(cell => cell.engine === 'spice-ts');
  const klu = row.cells.find(cell => cell.solver === 'klu');
  const sparse = row.cells.find(cell => cell.solver === 'sparse');
  const ok = cell => cell?.status === 'ok';
  const median = (cell, key) => (ok(cell) ? ms(cell[key]?.median) : cell ? cell.status : '-');
  const points = cell => (ok(cell) ? (cell.samples[0].timepoints ?? 'op') : '-');
  const rss = cell => (ok(cell) ? `${cell.peakRssMiB.toFixed(0)}` : '-');
  const probe = cell => (ok(cell) && cell.samples[0].probeValue !== undefined ? cell.samples[0].probeValue.toPrecision(6) : '-');
  console.log(`| ${row.circuit} | ${row.actualNodes.toLocaleString('en-US')} | ${median(spiceTs, 'parseStatsMs')} | ${median(spiceTs, 'analysisStatsMs')} | ${median(klu, 'parseStatsMs')} | ${median(klu, 'analysisStatsMs')} | ${median(sparse, 'analysisStatsMs')} | ${ratio(spiceTs, klu, 'analysisStatsMs')} | ${points(spiceTs)} / ${points(klu)} | ${rss(spiceTs)} / ${rss(klu)} / ${rss(sparse)} MiB | ${probe(spiceTs)} / ${probe(klu)} |`);
}

const failures = report.rows.flatMap(row => row.cells
  .filter(cell => cell.status !== 'ok')
  .map(cell => `- ${row.circuit} ${row.actualNodes}: ${cell.engine}${cell.solver ? ` (${cell.solver})` : ''} ${cell.status} after ${ms(cell.elapsedBeforeFailureMs)}: ${cell.error}`));
console.log(`\nFailures and timeouts (${failures.length}):`);
console.log(failures.length ? failures.join('\n') : '- none');
