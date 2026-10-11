#!/usr/bin/env node
/**
 * CPU-profile target for the issue #426 M2 scaling decks.
 *
 *   node --cpu-prof --cpu-prof-dir=benchmarks/performance/results/profiles \
 *     --cpu-prof-name=<circuit>-<nodes>.cpuprofile \
 *     benchmarks/performance/profile-scaling-m2.mjs <circuit> <nodes> [runs]
 *
 * One unprofiled-loader warmup plus `runs` measured simulate() calls on the
 * same deck the harness uses. Summarise with profile-summary.mjs.
 */
import { simulate } from '../../packages/core/dist/index.js';
import { m2Netlist } from './scaling-m2-fixture.mjs';

const circuit = process.argv[2] ?? 'resistor-mesh-op';
const nodes = Number(process.argv[3] ?? 10000);
const runs = Number(process.argv[4] ?? 3);
if (!Number.isInteger(runs) || runs < 1) throw new Error('run count must be a positive integer');

const { netlist } = m2Netlist(circuit, nodes);
await simulate(netlist); // warmup
for (let run = 0; run < runs; run++) await simulate(netlist);
console.log(`profiled spice-ts ${circuit} at ${nodes} nodes for ${runs} measured runs`);
