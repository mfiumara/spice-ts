// usage: node lineticks.mjs <cpuprofile> <distfile> fn1,fn2,...  -> per-line tick counts for named functions
import { readFileSync } from 'node:fs';
const [file, dist, fns] = process.argv.slice(2);
const prof = JSON.parse(readFileSync(file, 'utf8'));
const src = readFileSync(dist, 'utf8').split('\n');
const want = new Set(fns.split(','));
const dt = (prof.endTime - prof.startTime) / prof.samples.length / 1000;
const agg = new Map();
for (const node of prof.nodes) {
  const name = node.callFrame.functionName;
  if (!want.has(name)) continue;
  for (const pt of node.positionTicks ?? []) {
    const key = `${name}:${pt.line}`;
    agg.set(key, (agg.get(key) ?? 0) + pt.ticks);
  }
}
const rows = [...agg].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 40));
for (const [key, ticks] of rows) {
  const line = Number(key.split(':')[1]);
  console.log(`${(ticks * dt).toFixed(1).padStart(8)} ms  ${key.padEnd(30)} ${src[line - 1]?.trim().slice(0, 90)}`);
}
