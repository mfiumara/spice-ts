#!/usr/bin/env node
// Issue #890: compare every saved waveform of one M2 scaling deck between two
// spice-ts dists, bit for bit (Object.is on every sample).
//
//   node identical.mjs <circuit> <nodes> <base-dist> <branch-dist>
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);
const [circuit, nodesText, baseDist, branchDist] = process.argv.slice(2);
const netlist = m2Netlist(circuit, Number(nodesText)).netlist;
const run = async dist => (await import(pathToFileURL(`${dist}/index.js`).href)).simulate(netlist);
const [a, b] = [await run(baseDist), await run(branchDist)];

let samples = 0;
let differing = 0;
const compare = (x, y) => {
  if (x instanceof Float64Array || Array.isArray(x)) {
    if (x.length !== y.length) throw new Error(`length ${x.length} !== ${y.length}`);
    for (let i = 0; i < x.length; i++) { samples++; if (!Object.is(x[i], y[i])) differing++; }
    return;
  }
  if (x instanceof Map) { for (const [k, v] of x) compare(v, y.get(k)); return; }
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) compare(x[k], y[k]); return; }
  samples++; if (!Object.is(x, y)) differing++;
};
compare(a.transient ?? a.dc ?? a, b.transient ?? b.dc ?? b);
console.log(JSON.stringify({ circuit, nodes: Number(nodesText), samples, differing, identical: differing === 0 }));
