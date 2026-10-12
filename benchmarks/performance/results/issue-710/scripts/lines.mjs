// usage: node lines.mjs <cpuprofile> fn1 fn2 ... -> per-line self ticks
import { readFileSync } from 'node:fs';
const [file, ...fns] = process.argv.slice(2);
const p = JSON.parse(readFileSync(file, 'utf8'));
const dt = (p.endTime - p.startTime) / p.samples.length / 1000;
const by = new Map();
for (const n of p.nodes) {
  const f = n.callFrame.functionName;
  if (!fns.includes(f)) continue;
  for (const t of n.positionTicks ?? []) {
    const k = `${f}:${t.line}`;
    by.set(k, (by.get(k) ?? 0) + t.ticks);
  }
}
const rows = [...by].sort((a, b) => b[1] - a[1]).slice(0, 40);
for (const [k, v] of rows) console.log(k.padEnd(40), (v * dt).toFixed(1), 'ms');
