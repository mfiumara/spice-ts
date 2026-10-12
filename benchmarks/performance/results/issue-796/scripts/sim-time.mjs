#!/usr/bin/env node
/**
 * Issue #796: in-process parse + simulate() time of one M2 deck for a given
 * @spice-ts/core dist, one warmup plus `runs` timed calls.
 *
 *   node benchmarks/performance/results/issue-796/scripts/sim-time.mjs <dist> <circuit> <nodes> [runs]
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { m2Netlist } from '../../../scaling-m2-fixture.mjs';

const [dist, circuit, nodesArg, runsArg] = process.argv.slice(2);
const { parseAsync, simulate } = await import(pathToFileURL(resolve(dist, 'index.js')).href);
const { netlist } = m2Netlist(circuit, Number(nodesArg));
const runs = Number(runsArg ?? 3);
const times = [];
for (let run = -1; run < runs; run++) {
  const t = performance.now();
  await simulate(await parseAsync(netlist));
  if (run >= 0) times.push(performance.now() - t);
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ dist, circuit, nodes: Number(nodesArg), medianMs: +times[times.length >> 1].toFixed(1), minMs: +times[0].toFixed(1) }));
