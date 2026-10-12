#!/usr/bin/env node
// Issue #842: write the M2 scaling decks handed to ngspice-47, byte-identical
// to the netlists spice-ts simulates (scaling-m2-fixture.mjs).
//
//   node write-decks.mjs <out-dir> [nodes...]   (default nodes: 10000 50000)
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = new URL('../../../../..', import.meta.url).pathname.replace(/\/$/, '');
const { m2Netlist, M2_CIRCUITS } = await import(`${pathToFileURL(root).href}/benchmarks/performance/scaling-m2-fixture.mjs`);
const out = process.argv[2];
if (!out) throw new Error('usage: write-decks.mjs <out-dir> [nodes...]');
const sizes = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [10000, 50000];
mkdirSync(out, { recursive: true });
for (const circuit of M2_CIRCUITS) {
  for (const nodes of sizes) writeFileSync(`${out}/${circuit}-${nodes}.cir`, m2Netlist(circuit, nodes).netlist);
}
