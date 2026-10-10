// Compare spice-ts with ngspice-47 print output in ./ngspice on identical decks.
// Usage: node benchmarks/results/issue-388/compare.mjs [deck ...]
// SPICE_TS_DIST=<dir> selects another @spice-ts/core dist (used for the `before` run).
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = process.env.SPICE_TS_DIST
  ?? new URL('../../../packages/core/dist/', import.meta.url).pathname;
const { simulate } = await import(pathToFileURL(resolve(dist, 'index.js')).href);

const dir = new URL('./ngspice/', import.meta.url).pathname;
function ngspiceTable(name) {
  const rows = [];
  for (const line of readFileSync(`${dir}${name}.out`, 'utf8').split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (/^\d+$/.test(cols[0]) && cols.length >= 3) rows.push(cols.slice(1).map(Number));
  }
  return rows;
}
function ngspiceScalar(name) {
  const match = readFileSync(`${dir}${name}.out`, 'utf8').match(/^v\(2\)\[[^\]]*\]\s*=\s*(\S+)\s*$/m);
  return Number(match[1]);
}
function deck(name) {
  return readFileSync(`${dir}${name}.cir`, 'utf8').replace(/\.control[\s\S]*?\.endc\n/, '');
}
// Relative error uses a floor of 1e-3 x peak |ref| so zero crossings do not dominate.
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

const names = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(dir).filter(f => f.endsWith('.cir')).map(f => f.slice(0, -4)).sort();
const out = {};
for (const name of names) {
  try {
    const result = await simulate(deck(name));
    if (name.startsWith('l1_')) {
      const v = Array.from(result.transient.voltage('2'));
      const ref = ngspiceScalar(name);
      out[name] = { points: v.length, endpoint: v[v.length - 1], ngspice: ref, absError: Math.abs(v[v.length - 1] - ref) };
    } else if (name.startsWith('tran')) {
      const ref = ngspiceTable(name);
      const t = Array.from(result.transient.time), v = Array.from(result.transient.voltage('out'));
      out[name] = metrics(ref.map(r => r[1]), ref.map(r => interp(r[0], t, v)));
    } else {
      const ref = ngspiceTable(name);
      const points = result.ac.voltage('out');
      const vm = points.map(p => p.magnitude);
      const phaseDeg = points.map(p => p.phase);
      const phase = metrics(ref.map(r => r[2] * 180 / Math.PI), phaseDeg);
      out[name] = {
        vm100MHz: vm[10], ngspice100MHz: ref[10][1],
        ...metrics(ref.map(r => r[1]), vm),
        phaseMaxAbsDeg: phase.maxAbs, phaseRmsAbsDeg: phase.rmsAbs,
      };
    }
  } catch (e) { out[name] = { error: `${e.name}: ${e.message}` }; }
}
console.log(JSON.stringify(out, null, 1));
