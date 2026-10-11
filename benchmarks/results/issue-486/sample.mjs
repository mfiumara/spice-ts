#!/usr/bin/env node
/**
 * Issue #486: one isolated sample of an M2 scaling cell against a given
 * @spice-ts/core build, with a bit-exact hash of every saved result value.
 *
 *   node benchmarks/results/issue-486/sample.mjs <dist-dir> <circuit> <nodes>
 *
 * One in-process warmup, then one timed simulate(netlist) on the #426 deck
 * (wall ms, plus process CPU ms over the same interval, which includes GC
 * helper threads).
 * The hash covers the time axis and every node voltage and branch current
 * (transient waveforms or DC values), as Float64 bytes in sorted-name order,
 * so -0/+0 and last-ulp differences change it. Prints one JSON line.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { m2Netlist } from '../../performance/scaling-m2-fixture.mjs';

const [distDir, circuit, nodesArg] = process.argv.slice(2);
if (!distDir || !circuit || !nodesArg) throw new Error('usage: sample.mjs <dist-dir> <circuit> <nodes>');
const { simulate } = await import(pathToFileURL(resolve(distDir, 'index.js')).href);
const { netlist } = m2Netlist(circuit, Number(nodesArg));

function hashResult(result) {
  const hash = createHash('sha256');
  const add = (label, values) => {
    hash.update(label);
    hash.update(new Uint8Array(Float64Array.from(values).buffer));
  };
  const sorted = map => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let points = 1;
  if (result.transient) {
    const tran = result.transient;
    points = tran.time.length;
    add('time', tran.time);
    for (const [name, values] of sorted(tran.voltageArrays)) add(`v:${name}`, values);
    for (const [name, values] of sorted(tran.currentArrays)) add(`i:${name}`, values);
  } else if (result.dc) {
    for (const [name, value] of sorted(result.dc.voltages)) add(`v:${name}`, [value]);
    for (const [name, value] of sorted(result.dc.currents)) add(`i:${name}`, [value]);
  } else {
    throw new Error('no transient or dc result');
  }
  return { sha256: hash.digest('hex'), points };
}

await simulate(netlist); // warmup
const cpuStart = process.cpuUsage();
const start = performance.now();
const result = await simulate(netlist);
const ms = performance.now() - start;
const cpu = process.cpuUsage(cpuStart);
const cpuMs = (cpu.user + cpu.system) / 1000;
console.log(JSON.stringify({ circuit, nodes: Number(nodesArg), ms, cpuMs, ...hashResult(result) }));
