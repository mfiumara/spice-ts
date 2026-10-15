import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { simulate } from '../../../packages/core/src/simulate.js';
import { runNgspicePacked, runBoundedSimulatePacked } from '../../corpus/corpus-f/outcomes.js';
import { reduceRow } from '../../corpus/corpus-j/parity.js';
import { arch, cpus, platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

async function main() {
const root = 'benchmarks/results/issue-1083-residual';
const manifest = JSON.parse(await readFile('benchmarks/corpus/corpus-m/manifest.json', 'utf8'));
const fixture = manifest.circuits.find((c: { id: string }) => c.id === 'm-23');
const original = await readFile(fixture.localPath, 'utf8');
const ngspiceVersion = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout;
if (!/ngspice-47\b/.test(ngspiceVersion)) throw new Error('requires ngspice-47');
if (createHash('sha256').update(original).digest('hex') !== fixture.sha256) throw new Error('fixture hash mismatch');
const scratch = resolve(process.env.TMPDIR!, '1083-residual');
await mkdir(scratch, { recursive: true });
const interp = (grid: ArrayLike<number>, values: ArrayLike<number>, at: number) => {
  let lo = 0, hi = grid.length - 1;
  while (hi - lo > 1) { const mid = (hi + lo) >>> 1; if (grid[mid] > at) hi = mid; else lo = mid; }
  return values[lo] + (values[hi] - values[lo]) * (at - grid[lo]) / (grid[hi] - grid[lo]);
};
const variants = [
  ['original', original],
  ['tmax-2ns', original.replace('.tran 20ns 30us', '.tran 20ns 30us 0 2ns')],
  ['no-series', original.replace(/\b(?:RD|RS|RSH)\s*=\s*[^\s)]+/gi, '')],
  ['no-series-tmax-2ns', original.replace(/\b(?:RD|RS|RSH)\s*=\s*[^\s)]+/gi, '').replace('.tran 20ns 30us', '.tran 20ns 30us 0 2ns')],
  ['no-gate-caps', original.replace(/\bTOX\s*=\s*[^\s)]+/gi, 'TOX=0').replace(/\b(?:CGSO|CGDO|CGBO)\s*=\s*[^\s)]+/gi, '')],
  ['tmax-0.2ns', original.replace('.tran 20ns 30us', '.tran 20ns 30us 0 0.2ns')],
  ['explicit-primes', original.replace(/\b(?:RD|RS|RSH)\s*=\s*[^\s)]+/gi, '')
    .replace('MN1   VOUT  IN 0 0', 'RND VOUT nd 11.59\nRNS ns 0 13.21\nRPD VOUT pd 93.66\nRPS ps VDD 5.359\nMN1   nd IN ns 0')
    .replace('MP1         VOUT IN VDD VDD', 'MP1 pd IN ps VDD')],
] as const;
const results = [];
for (const [name, deck] of variants) {
  await writeFile(resolve(scratch, name + '.cir'), deck);
  const start = performance.now();
  const ng = await runNgspicePacked(Buffer.from(deck), fixture);
  const ts = (await simulate(deck)).transient!;
  const ref = ng.execution.analyses.find(a => a.type === 'tran')!;
  const signals = [];
  for (const node of ['vout', 'in', 'nd', 'ns', 'pd', 'ps']) {
    const ngName = `v(${node.toLowerCase()})`;
    const reference = ref.signals[ngName]?.re;
    if (!reference) continue;
    const values = ts.voltage(node);
    let sum = 0, max = 0, worst = null, first = null, firstMilli = null, count = 0;
    for (let i = 0; i < ts.time.length; i++) {
      if (ts.time[i] < ref.grid[0]) continue;
      const expected = interp(ref.grid, reference, ts.time[i]);
      const error = Math.abs(values[i] - expected);
      const point = { time: ts.time[i], actual: values[i], expected, absoluteError: error };
      if (error > max) { max = error; worst = point; }
      if (error > 0.05 && !first) first = point;
      if (error > 0.001 && !firstMilli) firstMilli = point;
      sum += error * error;
      count++;
    }
    signals.push({ node, max, rms: Math.sqrt(sum / count), firstAbove1mV: firstMilli, firstAbove50mV: first, worst });
  }
  const times = [1.505e-6, 1.51e-6, 1.52e-6, 1.55e-6, 1.6e-6];
  const samples = times.map(time => ({ time, ts: interp(ts.time, ts.voltage('vout'), time), ng: interp(ref.grid, ref.signals['v(vout)'].re, time) }));
  let firstGridSplit = null;
  for (let i = 0; i < Math.min(ts.time.length, ref.grid.length); i++) {
    if (Math.abs(ts.time[i] - ref.grid[i]) > 1e-15) {
      firstGridSplit = { index: i, spiceTsTime: ts.time[i], ngspiceTime: ref.grid[i] }; break;
    }
  }
  results.push({ name, sha256: createHash('sha256').update(deck).digest('hex'), ngPoints: ref.grid.length, tsPoints: ts.time.length, firstGridSplit, wallMs: performance.now() - start, signals, samples });
  console.log(JSON.stringify(results.at(-1)));
  await writeFile(`${root}/metrics.json`, JSON.stringify({ sourceHead: '96b6044bffc3aa7d0dccb94fcc136a41455f6a2e', environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, ngspice: ngspiceVersion.trim() }, thresholdVolts: 0.05, alignment: 'linear ngspice interpolation at spice-ts times; separate diagnostic, not corpus metric', results }, null, 2) + '\n');
}
const parity = [];
for (const id of ['m-23', 'm-24']) {
  const circuit = manifest.circuits.find((c: { id: string }) => c.id === id);
  const bytes = await readFile(circuit.localPath);
  const ng = await runNgspicePacked(bytes, circuit);
  const ts = await runBoundedSimulatePacked(bytes, circuit);
  parity.push(reduceRow(circuit, ng, ts));
}
await writeFile(`${root}/original-parity.json`, JSON.stringify(parity, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
