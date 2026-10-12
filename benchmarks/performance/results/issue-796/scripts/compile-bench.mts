/**
 * Issue #796: Circuit.compile() time alone on one M2 deck.
 *
 *   npx tsx benchmarks/performance/results/issue-796/scripts/compile-bench.mts <circuit> <nodes> [runs] [srcRoot]
 *
 * Parses the deck once, then times `runs` compile() calls of the parsed
 * Circuit after two warmups. `srcRoot` (default packages/core/src; a path
 * ending in `dist` loads the built index.js) lets a copy of main's sources be
 * measured with the same script. Prints the median
 * and minimum in ms and a digest of the compiled node names and device
 * node indices, so both builds can be checked to compile identically.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { m2Netlist } from '../../../scaling-m2-fixture.mjs';

const circuit = process.argv[2] ?? 'resistor-mesh-op';
const nodes = Number(process.argv[3] ?? 10000);
const runs = Number(process.argv[4] ?? 15);
const srcRoot = resolve(process.argv[5] ?? 'packages/core/src');
const entry = srcRoot.endsWith('dist') ? 'index.js' : 'index.ts';
const core = await import(pathToFileURL(`${srcRoot}/${entry}`).href);

const parsed = await core.parseAsync(m2Netlist(circuit, nodes).netlist);
const times: number[] = [];
let compiled: { nodeNames: string[]; devices: { name: string; nodes: number[] }[]; branchNames: string[] } | undefined;
for (let run = -2; run < runs; run++) {
  const t = performance.now();
  compiled = parsed.compile();
  const dt = performance.now() - t;
  if (run >= 0) times.push(dt);
}
times.sort((a, b) => a - b);
const hash = createHash('sha256');
hash.update(JSON.stringify(compiled!.nodeNames));
hash.update(JSON.stringify(compiled!.branchNames));
for (const device of compiled!.devices) hash.update(`${device.name}:${device.nodes.join(',')};`);
console.log(JSON.stringify({
  circuit, nodes, runs, srcRoot,
  medianMs: +times[times.length >> 1].toFixed(3),
  minMs: +times[0].toFixed(3),
  digest: hash.digest('hex').slice(0, 16),
}));
