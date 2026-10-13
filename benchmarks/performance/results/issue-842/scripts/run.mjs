#!/usr/bin/env node
// Issue #842: wall time, result digest and convergence counters of one M2 scaling
// deck for a given spice-ts dist (SPICE_TS_DIST, default packages/core/dist).
//
//   node run.mjs <circuit> <nodes> [warmups] [repeats]
//
// `ms` is the median wall time of `repeats` measured simulate() calls (default
// 1) after `warmups` unmeasured ones, all in this process; `samples` lists them.
// The digest is sha256 over the IEEE-754 bits of every recorded time point and
// every node voltage / branch current vector (transient), or every OP value,
// in sorted name order. Equal digests mean bit-identical results.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const dist = process.env.SPICE_TS_DIST
  ? pathToFileURL(`${process.env.SPICE_TS_DIST}/index.js`).href
  : `${pathToFileURL(root).href}/packages/core/dist/index.js`;
const { simulate } = await import(dist);
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);

const circuit = process.argv[2];
const nodes = Number(process.argv[3] ?? 10000);
const warmups = Number(process.argv[4] ?? 0);
const repeats = Number(process.argv[5] ?? 1);
// `<deck>-as-op`: the transient deck with `.tran` replaced by `.op` (and no
// `.print`), as #830 measured the CMOS chain operating point.
const asOp = circuit.endsWith('-as-op');
const deck = m2Netlist(asOp ? circuit.slice(0, -'-as-op'.length) : circuit, nodes).netlist;
const netlist = asOp ? deck.replace(/^\.tran .*$/m, '.op').replace(/^\.print .*\n/m, '') : deck;
for (let i = 0; i < warmups; i++) await simulate(netlist);
const samples = [];
let result;
for (let i = 0; i < repeats; i++) {
  const t0 = performance.now();
  result = await simulate(netlist);
  samples.push(Number((performance.now() - t0).toFixed(1)));
}
const ordered = [...samples].sort((a, b) => a - b);
const ms = repeats % 2 ? ordered[repeats >> 1] : (ordered[repeats / 2 - 1] + ordered[repeats / 2]) / 2;

const hash = createHash('sha256');
const sorted = map => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const bits = values => new Uint8Array(Float64Array.from(values).buffer);
let points;
if (result.transient) {
  const tr = result.transient;
  points = tr.time.length;
  hash.update(bits(tr.time));
  for (const [name, v] of sorted(tr.voltages)) { hash.update(`v:${name}`); hash.update(bits(v)); }
  for (const [name, v] of sorted(tr.currents)) { hash.update(`i:${name}`); hash.update(bits(v)); }
} else {
  const op = result.dc;
  points = 1;
  for (const [name, v] of sorted(op.voltages)) { hash.update(`v:${name}`); hash.update(bits([v])); }
  for (const [name, v] of sorted(op.currents)) { hash.update(`i:${name}`); hash.update(bits([v])); }
}
const { dc, transient } = result.convergence;
console.log(JSON.stringify({
  build: process.env.BUILD ?? 'branch', circuit, nodes, warmups, ms: Number(ms.toFixed(1)), samples, points,
  dcIterations: dc.newtonIterations, tranIterations: transient.newtonIterations,
  acceptedSteps: transient.acceptedSteps, rejectedSteps: transient.rejectedSteps,
  sha256: hash.digest('hex'),
}));
