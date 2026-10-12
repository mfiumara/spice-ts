#!/usr/bin/env node
// #830 scratch: wall time + waveform hash of the cmos-chain transient for a given dist.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const dist = process.env.SPICE_TS_DIST ? pathToFileURL(`${process.env.SPICE_TS_DIST}/index.js`).href : `${pathToFileURL(root).href}/packages/core/dist/index.js`;
const { simulate } = await import(dist);
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);
const nodes = Number(process.argv[2] ?? 10000);
const { netlist } = m2Netlist('cmos-inverter-chain-tran', nodes);
const t0 = performance.now();
const r = await simulate(netlist);
const ms = performance.now() - t0;
const h = createHash('sha256');
const tr = r.transient;
h.update(new Uint8Array(Float64Array.from(tr.time).buffer));
for (const [name, v] of [...(tr.voltageArrays instanceof Map ? tr.voltageArrays : Object.entries(tr.voltageArrays))].sort(([a], [b]) => (a < b ? -1 : 1))) { h.update(name); h.update(new Uint8Array(Float64Array.from(v).buffer)); }
console.log(JSON.stringify({ build: process.env.BUILD ?? 'branch', nodes, ms: Number(ms.toFixed(1)), points: tr.time.length, sha256: h.digest('hex') }));
