// Compare spice-ts (packages/core/dist) with ngspice-47 print output in ./ngspice.
// Usage: node benchmarks/results/issue-365/compare.mjs ac ac_vj1 acrs acrs_vj1 tran tran_vj1
import { readFileSync } from 'node:fs';
import { simulate } from '../../../packages/core/dist/index.js';

const dir = new URL('./ngspice/', import.meta.url).pathname;
function ngspiceTable(name) {
  const rows = [];
  for (const line of readFileSync(`${dir}${name}.out`, 'utf8').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (/^\d+$/.test(cols[0]) && cols.length >= 3) rows.push(cols.slice(1).map(Number));
  }
  return rows;
}
function deck(name) {
  return readFileSync(`${dir}${name}.cir`, 'utf8').replace(/\.control[\s\S]*?\.endc\n/, '');
}
function metrics(ref, got) {
  let maxAbs = 0, maxRel = 0, sq = 0, sqRel = 0;
  const peak = Math.max(...ref.map(Math.abs));
  for (let i = 0; i < ref.length; i++) {
    const e = Math.abs(got[i] - ref[i]);
    const r = e / Math.max(Math.abs(ref[i]), 1e-3 * peak);
    maxAbs = Math.max(maxAbs, e); maxRel = Math.max(maxRel, r); sq += e * e; sqRel += r * r;
  }
  return { n: ref.length, maxAbs, rmsAbs: Math.sqrt(sq / ref.length), maxRel, rmsRel: Math.sqrt(sqRel / ref.length) };
}
function interp(t, xs, ys) {
  let i = 1; while (i < xs.length - 1 && xs[i] < t) i++;
  const a = xs[i - 1], b = xs[i];
  return b === a ? ys[i] : ys[i - 1] + (ys[i] - ys[i - 1]) * (t - a) / (b - a);
}
const out = {};
for (const name of process.argv.slice(2)) {
  const ref = ngspiceTable(name);
  try {
    const result = await simulate(deck(name));
    if (name.startsWith('tran')) {
      const t = Array.from(result.transient.time), v = Array.from(result.transient.voltage('out'));
      out[name] = metrics(ref.map(r => r[1]), ref.map(r => interp(r[0], t, v)));
    } else {
      const v = result.ac.voltage('out').map(p => p.magnitude);
      out[name] = { vm100MHz: v[10], ngspice100MHz: ref[10][1], ...metrics(ref.map(r => r[1]), v) };
    }
  } catch (e) { out[name] = { error: `${e.name}: ${e.message}` }; }
}
console.log(JSON.stringify(out, null, 1));
