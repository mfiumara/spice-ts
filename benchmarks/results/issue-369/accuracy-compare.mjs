#!/usr/bin/env node
// Compare the latest `pnpm bench:accuracy` entry of two accuracy-results.json
// histories (base worktree vs this branch), ignoring only the run date.
// Usage: node accuracy-compare.mjs <before accuracy-results.json> <after accuracy-results.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [beforeFile, afterFile, output] = process.argv.slice(2);
if (!output) throw new Error('usage: accuracy-compare.mjs <before.json> <after.json> <out.json>');
const latest = file => JSON.parse(readFileSync(file, 'utf8')).at(-1);
const before = latest(beforeFile);
const after = latest(afterFile);
const identical = JSON.stringify(before.results) === JSON.stringify(after.results);
writeFileSync(output, `${JSON.stringify({
  command: 'pnpm bench:accuracy (base worktree at d3eaf5a, then this branch)',
  identicalResults: identical,
  before: { date: before.date, results: before.results },
  after: { date: after.date, results: after.results },
}, null, 2)}\n`);
console.log(`identical: ${identical}`);
for (const r of after.results) console.log(`${r.circuit}: ${r.status} spiceTs=${r.spiceTs} ngspiceDiffPct=${r.ngspiceDiffPct}`);
if (!identical) process.exit(1);
