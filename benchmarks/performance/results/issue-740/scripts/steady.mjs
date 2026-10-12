#!/usr/bin/env node
/**
 * Issue #740: in-process steady state. Runs simulate() on one #740 AC deck
 * <reps> times in one process and prints wall/CPU ms per run.
 *
 *   node benchmarks/performance/results/issue-740/scripts/steady.mjs <dist-dir> <circuit> <nodes> <reps>
 */
import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
const [dist, circuit, nodes, reps] = process.argv.slice(2);
const { simulate } = await import(pathToFileURL(resolve(dist, 'index.js')).href);
const { acNetlist } = await import(pathToFileURL(resolve('benchmarks/performance/results/issue-740/scripts/ac-fixture.mjs')).href);
const { netlist } = acNetlist(circuit, Number(nodes));
const out = [];
for (let i = 0; i < Number(reps); i++) { const c = process.cpuUsage(); const t = performance.now(); await simulate(netlist); const ms = performance.now() - t; const cu = process.cpuUsage(c); out.push(`${ms.toFixed(0)}/${((cu.user+cu.system)/1000).toFixed(0)}`); }
console.log(out.join(' '));
