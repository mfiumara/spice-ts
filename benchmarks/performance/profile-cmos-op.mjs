#!/usr/bin/env node
/**
 * Issue #830: wall-clock and CPU-profile target for the DC operating point of
 * the M2 CMOS inverter chain (the `cmos-inverter-chain-tran` deck with `.tran`
 * replaced by `.op`, exactly as benchmarks/rust-lu-spike/op-swap.ts does).
 *
 *   node benchmarks/performance/profile-cmos-op.mjs <nodes> [runs] [warmups]
 *   node --cpu-prof --cpu-prof-dir=<dir> benchmarks/performance/profile-cmos-op.mjs 10000 1 1
 *   SPICE_TS_DIST=/path/to/other/dist node benchmarks/performance/profile-cmos-op.mjs 10000 5 1
 *
 * Prints one JSON line per measured run ({ nodes, ms, sha256 }) where sha256
 * hashes every node voltage's IEEE-754 bits, so before/after numerics can be
 * compared bit-for-bit.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { cmosInverterChainTran } from './scaling-m2-fixture.mjs';

// SPICE_TS_DIST points at another build of packages/core/dist for paired A/B runs.
const dist = process.env.SPICE_TS_DIST
  ? pathToFileURL(`${process.env.SPICE_TS_DIST}/index.js`).href
  : new URL('../../packages/core/dist/index.js', import.meta.url).href;
const { simulate } = await import(dist);

const nodes = Number(process.argv[2] ?? 10000);
const runs = Number(process.argv[3] ?? 5);
const warmups = Number(process.argv[4] ?? 1);

const netlist = cmosInverterChainTran(nodes).netlist
  .replace(/^\.tran .*$/m, '.op')
  .replace(/^\.print .*$/m, '');

function digest(result) {
  const op = result.dc;
  const hash = createHash('sha256');
  const entries = [...op.voltageMap.entries(), ...op.currentMap.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const buf = new Float64Array(1);
  for (const [name, v] of entries) {
    buf[0] = v;
    hash.update(name);
    hash.update(new Uint8Array(buf.buffer));
  }
  return hash.digest('hex');
}

for (let i = 0; i < warmups; i++) await simulate(netlist);
for (let run = 0; run < runs; run++) {
  const t0 = performance.now();
  const result = await simulate(netlist);
  const ms = performance.now() - t0;
  console.log(JSON.stringify({ nodes, run, ms: Number(ms.toFixed(1)), sha256: digest(result) }));
}
