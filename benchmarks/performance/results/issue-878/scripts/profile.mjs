#!/usr/bin/env node
// Issue #878: one warm-up plus one measured simulate() of an M2 scaling deck
// with a given spice-ts dist (SPICE_TS_DIST), for `node --cpu-prof`.
//
//   SPICE_TS_DIST=<dist> node --cpu-prof profile.mjs <circuit> <nodes>
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { simulate } = await import(pathToFileURL(`${process.env.SPICE_TS_DIST}/index.js`).href);
const { m2Netlist } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);
const netlist = m2Netlist(process.argv[2], Number(process.argv[3])).netlist;
await simulate(netlist);
const t0 = performance.now();
await simulate(netlist);
console.log(`${process.argv[2]} ${process.argv[3]} ${(performance.now() - t0).toFixed(1)} ms`);
