#!/usr/bin/env node
/**
 * Issue #740: one isolated sample of an AC cell against a given
 * @spice-ts/core build.
 *
 *   node benchmarks/performance/results/issue-740/scripts/sample.mjs <dist-dir> <circuit> <nodes> [--no-warmup]
 *
 * One in-process warmup (unless --no-warmup), then one timed
 * simulate(netlist): wall ms and process CPU ms. Also reports the probe
 * phasor at every frequency (re/im) and a SHA-256 over every node voltage
 * and branch current phasor (magnitude and phase as Float64 bytes, sorted by
 * name). Prints one JSON line.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acNetlist } from './ac-fixture.mjs';

const [distDir, circuit, nodesArg, ...flags] = process.argv.slice(2);
if (!distDir || !circuit || !nodesArg) throw new Error('usage: sample.mjs <dist-dir> <circuit> <nodes> [--no-warmup]');
const { simulate } = await import(pathToFileURL(resolve(distDir, 'index.js')).href);
const { netlist, probe } = acNetlist(circuit, Number(nodesArg));

function hashResult(ac) {
  const hash = createHash('sha256');
  const sorted = map => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [kind, map] of [['v', ac.voltages], ['i', ac.currents]]) {
    for (const [name, points] of sorted(map)) {
      hash.update(`${kind}:${name}`);
      hash.update(new Uint8Array(Float64Array.from(points.flatMap(p => [p.magnitude, p.phase])).buffer));
    }
  }
  return hash.digest('hex');
}

if (!flags.includes('--no-warmup')) await simulate(netlist);
const cpuStart = process.cpuUsage();
const start = performance.now();
const result = await simulate(netlist);
const ms = performance.now() - start;
const cpu = process.cpuUsage(cpuStart);
const cpuMs = (cpu.user + cpu.system) / 1000;
const ac = result.ac;
const probeValues = ac.voltage(probe).map(p => [
  p.magnitude * Math.cos((p.phase * Math.PI) / 180),
  p.magnitude * Math.sin((p.phase * Math.PI) / 180),
]);
console.log(JSON.stringify({
  circuit, nodes: Number(nodesArg), ms, cpuMs, points: ac.frequencies.length,
  sha256: hashResult(ac), probe, frequencies: ac.frequencies, probeValues,
}));
