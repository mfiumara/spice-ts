#!/usr/bin/env node
/**
 * Issue #486: summarise ab.mjs output into a paired A/B markdown table.
 *
 *   node benchmarks/results/issue-486/ab-summary.mjs <ab.jsonl>
 *
 * Per cell: before/after median and min, median speedup, median and min of
 * the per-round paired before/after ratios, and whether every sample of both
 * builds produced one identical result hash. With --cpu, the same columns
 * use process CPU ms (cpuMs) instead of wall ms.
 */
import { readFileSync } from 'node:fs';

const useCpu = process.argv.includes('--cpu');
const metric = useCpu ? 'cpuMs' : 'ms';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(line => JSON.parse(line))
  .filter(row => row[metric] !== undefined)
  .map(row => ({ ...row, ms: row[metric] }));
const median = values => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = ms => (ms >= 100 ? ms.toFixed(0) : ms.toFixed(1));

const cells = new Map();
for (const row of rows) {
  const key = `${row.circuit}:${row.nodes}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(row);
}

console.log(`| cell | n | before median (min) ${useCpu ? 'CPU ' : ''}ms | after median (min) ${useCpu ? 'CPU ' : ''}ms | median speedup | paired ratio median (min..max) | hash identical |`);
console.log('|---|---:|---:|---:|---:|---:|---|');
for (const [key, list] of cells) {
  const b = list.filter(r => r.variant === 'before');
  const a = list.filter(r => r.variant === 'after');
  const ratios = [];
  for (const rb of b) {
    const ra = a.find(r => r.round === rb.round);
    if (ra) ratios.push(rb.ms / ra.ms);
  }
  const hashes = new Set(list.map(r => r.sha256));
  const bm = median(b.map(r => r.ms));
  const am = median(a.map(r => r.ms));
  console.log(`| ${key} | ${ratios.length} | ${fmt(bm)} (${fmt(Math.min(...b.map(r => r.ms)))}) | ${fmt(am)} (${fmt(Math.min(...a.map(r => r.ms)))}) | ${(bm / am).toFixed(2)}x | ${median(ratios).toFixed(2)}x (${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}) | ${hashes.size === 1 ? `yes ${[...hashes][0].slice(0, 16)}, ${list[0].points} pts` : `NO (${hashes.size} hashes)`} |`);
}
