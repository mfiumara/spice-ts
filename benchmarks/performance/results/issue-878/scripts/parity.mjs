#!/usr/bin/env node
// Issue #878: waveform parity of the CMOS inverter chain against ngspice-47,
// for one or more spice-ts dists.
//
//   node parity.mjs <nodes> <probes> <ngspice-binary> <label=dist>...
//
// ngspice runs the scaling deck with only its `.print` card replaced by a
// .control block that writes v(s1)..v(s<probes>) at full precision (wrdata);
// every other card is byte-identical. Each spice-ts dist simulates the
// unmodified deck. Values are compared at matched time points (the grids
// must agree to 1e-9 relative, else the script says so) and the maximum
// absolute difference over all probes and points is reported, with the
// worst node and time. Run it under spice-heavy.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);
const [nodesArg, probesArg, ngspice, ...builds] = process.argv.slice(2);
const nodes = Number(nodesArg);
const probes = Array.from({ length: Number(probesArg) }, (_, i) => `s${i + 1}`);
const deck = m2Netlist('cmos-inverter-chain-tran', nodes).netlist;

const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'issue-878-parity-'));
const data = join(dir, 'ngspice.txt');
const control = [
  '.control', 'set wr_singlescale', 'set wr_vecnames', 'option numdgt=17', 'run',
  `wrdata ${data} ${probes.map(p => `v(${p})`).join(' ')}`, 'quit', '.endc',
].join('\n');
writeFileSync(join(dir, 'deck.cir'), deck.replace(/^\.print .*$/m, control));
execFileSync(ngspice, ['-b', join(dir, 'deck.cir')], { stdio: ['ignore', 'ignore', 'ignore'] });
const rows = readFileSync(data, 'utf8').trim().split('\n').slice(1).map(line => line.trim().split(/\s+/).map(Number));
const reference = { time: rows.map(row => row[0]), values: probes.map((_, i) => rows.map(row => row[i + 1])) };

const compare = (a, b) => {
  if (a.time.length !== b.time.length) return { grid: `${a.time.length} vs ${b.time.length} points` };
  for (let i = 0; i < a.time.length; i++) {
    if (Math.abs(a.time[i] - b.time[i]) > 1e-9 * Math.max(Math.abs(a.time[i]), 1e-15)) {
      return { grid: `time differs at point ${i}: ${a.time[i]} vs ${b.time[i]}` };
    }
  }
  let max = 0, at = '';
  for (let p = 0; p < probes.length; p++) {
    for (let i = 0; i < a.time.length; i++) {
      const diff = Math.abs(a.values[p][i] - b.values[p][i]);
      if (diff > max) { max = diff; at = `${probes[p]} t=${a.time[i]}`; }
    }
  }
  return { maxAbsDiff: max, at };
};

const results = {};
for (const build of builds) {
  const [label, dist] = build.split('=');
  const { simulate } = await import(`${pathToFileURL(dist).href}/index.js`);
  const result = await simulate(deck);
  const tr = result.transient;
  const series = { time: Array.from(tr.time), values: probes.map(p => Array.from(tr.voltages.get(p))) };
  results[label] = { series, vsNgspice: compare(series, reference), iterations: result.convergence.transient.newtonIterations };
}
const labels = Object.keys(results);
const report = { nodes, probes: probes.length, points: reference.time.length };
for (const label of labels) report[label] = { iterations: results[label].iterations, vsNgspice47: results[label].vsNgspice };
for (let i = 1; i < labels.length; i++) {
  report[`${labels[0]}-vs-${labels[i]}`] = compare(results[labels[0]].series, results[labels[i]].series);
}
console.log(JSON.stringify(report, null, 2));
