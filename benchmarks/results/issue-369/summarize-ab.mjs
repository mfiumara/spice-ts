#!/usr/bin/env node
// Aggregate the paired before/after rounds produced by run-ab.sh into
// ab-summary.json (scaling medians/RSS and CPU-profile self samples).
// Usage: node benchmarks/results/issue-369/summarize-ab.mjs <rounds...>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rounds = process.argv.slice(2);
if (rounds.length === 0) throw new Error('usage: summarize-ab.mjs <round> [round ...]');
const functions = ['tokenizeNetlist', 'tokenizeLine', 'parseNumber', '(garbage collector)'];

function profileSummary(file) {
  const profile = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const counts = Object.fromEntries(functions.map(name => [name, 0]));
  for (const id of profile.samples) {
    const name = byId.get(id).callFrame.functionName;
    if (name in counts) counts[name]++;
  }
  return { durationMicroseconds: profile.endTime - profile.startTime, totalSamples: profile.samples.length, selfSamples: counts };
}

function scalingSummary(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(report.rows.map(row => [row.nodes, {
    spiceTsMedianMs: row.spiceTs.statsMs.median,
    spiceTsPeakRssMiB: row.spiceTs.peakRssMiB,
    ngspiceInternalMedianMs: row.ngspice.analysisStatsMs.median,
    ngspiceWallMedianMs: row.ngspice.statsMs.median,
    netlistSha256: row.netlistSha256,
  }]));
}

const summary = { rounds: {} };
for (const round of rounds) {
  const entry = {};
  for (const side of ['before', 'after']) {
    entry[side] = {
      scaling: scalingSummary(join(here, `scaling-${side}-r${round}.json`)),
      profile: profileSummary(join(here, 'profiles', `tokenizer-${side}-r${round}.cpuprofile`)),
    };
  }
  entry.spiceTsMedianRatioBeforeOverAfter = Object.fromEntries(Object.keys(entry.before.scaling).map(nodes => [nodes,
    entry.before.scaling[nodes].spiceTsMedianMs / entry.after.scaling[nodes].spiceTsMedianMs]));
  summary.rounds[round] = entry;
}
writeFileSync(join(here, 'ab-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
