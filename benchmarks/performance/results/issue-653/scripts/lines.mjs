#!/usr/bin/env node
/**
 * Issue #653: per-source-line self ticks of one function in a V8 .cpuprofile.
 *
 *   node benchmarks/performance/results/issue-653/scripts/lines.mjs <x.cpuprofile> <functionName> [dist-chunk.js]
 *
 * Inlined callees are attributed to the caller's frame by V8, so their lines
 * show up under the caller with the chunk's line numbers.
 */
import fs from 'node:fs';
const [file, fn, distFile] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file));
const dt = (p.endTime - p.startTime) / p.samples.length / 1000;
const lines = new Map(); let total = 0;
for (const n of p.nodes) {
  if (n.callFrame.functionName !== fn) continue;
  for (const t of n.positionTicks ?? []) { lines.set(t.line, (lines.get(t.line) ?? 0) + t.ticks); total += t.ticks; }
}
const src = distFile ? fs.readFileSync(distFile, 'utf8').split('\n') : [];
console.log(fn, 'ticks', total);
for (const [l, t] of [...lines].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(t).padStart(6), (100*t/total).toFixed(1).padStart(5)+'%', l, (src[l-1] ?? '').trim().slice(0, 110));
