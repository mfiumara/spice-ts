#!/usr/bin/env node
import { simulate } from '../../packages/core/dist/index.js';
import { scalingLadder } from './scaling-fixture.mjs';

const nodes = Number(process.argv[2] ?? 10000);
const runs = Number(process.argv[3] ?? 5);
if (!Number.isInteger(nodes) || nodes < 1) throw new Error('node count must be a positive integer');
if (!Number.isInteger(runs) || runs < 1) throw new Error('run count must be a positive integer');

const netlist = scalingLadder(nodes);
await simulate(netlist); // warmup
for (let run = 0; run < runs; run++) await simulate(netlist);
console.log(`profiled spice-ts DC operating point at ${nodes} nodes for ${runs} measured runs`);
