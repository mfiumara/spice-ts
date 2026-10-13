// Child receipt: complete factors/IEEE outputs, counts, timing, memory and optional V8 profile.
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Session } from 'node:inspector/promises';
import { m2Netlist } from '../../scaling-m2-fixture.mjs';
const [mode, bundle, circuit, sizeText, journal, variant] = process.argv.slice(2);
const core = await import(pathToFileURL(bundle));
const emit = row => appendFileSync(journal, JSON.stringify(row) + '\n');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hash = a => createHash('sha256').update(bytes(a)).digest('hex');
const memory = () => ({ ...process.memoryUsage(), peakRssMiB: process.resourceUsage().maxRSS / 1024 });
const manifest = JSON.parse(readFileSync(new URL('./build.json', import.meta.url)));
if (mode === 'isolate') {
  const capture = new URL(`../issue-919/profiles/capture-resistor-mesh-op-${sizeText}.matrix.gz`, import.meta.url);
  const { A, b, expected } = deserialize(gunzipSync(readFileSync(capture)));
  for (const phase of ['cold', 'warm']) {
    const solver = new core.GilbertPeierlsSolver();
    solver.analyzePattern(A);
    const initialUCapacity = solver.uValues.length;
    let session;
    if (variant === 'sampled') {
      session = new Session(); session.connect();
      await session.post('Profiler.enable');
      await session.post('Profiler.setSamplingInterval', { interval: manifest.samplingIntervalUs });
      await session.post('Profiler.start');
    }
    const startMemory = memory(), start = performance.now(), cpu = process.cpuUsage();
    solver.factorize(A);
    const factorMs = performance.now() - start, factorCpu = process.cpuUsage(cpu);
    let sampling = null;
    if (session) {
      const { profile } = await session.post('Profiler.stop');
      session.disconnect();
      const profilePath = journal + '.' + phase + '.cpuprofile.gz';
      writeFileSync(profilePath, gzipSync(JSON.stringify(profile)));
      const nodes = profile.nodes.filter(n => n.callFrame.functionName === 'applySupernode' && n.callFrame.url === pathToFileURL(bundle).href);
      const ticks = nodes.flatMap(n => n.positionTicks ?? []);
      const regions = Object.fromEntries(manifest.ranges.map(r => [r.name, ticks.filter(t => t.line >= r.firstLine && t.line <= r.lastLine).reduce((s, t) => s + t.ticks, 0)]));
      sampling = { intervalUs: manifest.samplingIntervalUs, profilePath: profilePath.split('/').pop(), totalSamples: profile.samples?.length ?? 0, applySelfSamples: nodes.reduce((s,n) => s + (n.hitCount ?? 0), 0), positionTicks: ticks, regions };
    }
    const digest = createHash('sha256');
    for (const [name, a] of [
      ['lColPtr', solver.lColPtr], ['lRows', solver.lRows.subarray(0, solver.lColPtr[A.size])],
      ['lValues', solver.lValues.subarray(0, solver.lColPtr[A.size])],
      ['uColPtr', solver.uColPtr], ['uRows', solver.uRows.subarray(0, solver.uColPtr[A.size])],
      ['uValues', solver.uValues.subarray(0, solver.uColPtr[A.size])],
      ['perm', solver.perm], ['colPerm', solver.colPerm],
    ]) { digest.update(name + '\0'); digest.update(bytes(a)); }
    const solveStart = performance.now();
    const x = solver.solve(b.slice()), solveMs = performance.now() - solveStart;
    assert.equal(hash(x), hash(expected));
    emit({ phase, factorMs, solveMs, factorCpu, sampling,
      numericFactorizations: solver.numericFactorizations, pivotReuseFactorizations: solver.pivotReuseFactorizations,
      supernodalUpdates: solver.supernodalUpdates, factorNonzeros: solver.factorNonzeros(),
      initialUCapacity, finalUCapacity: solver.uValues.length, usedU: solver.uColPtr[A.size],
      factorSha256: digest.digest('hex'), solutionSha256: hash(x), matrixSha256: hash(A.values), rhsSha256: hash(b), startMemory, endMemory: memory() });
  }
} else if (mode === 'simulate') {
  const fixture = m2Netlist(circuit, Number(sizeText));
  for (const phase of ['cold', 'warm']) {
    const start = performance.now(), startMemory = memory();
    const result = await core.simulate(fixture.netlist);
    const simulateMs = performance.now() - start;
    const digest = createHash('sha256');
    let vectors = 0, values = 0;
    const add = (name, data) => {
      digest.update(name + '\0');
      const a = Float64Array.from(data); digest.update(bytes(a)); vectors++; values += a.length;
    };
    if (result.dc) {
      for (const [name, value] of result.dc.voltages) add('dc-v:' + name, [value]);
      for (const [name, value] of result.dc.currents) add('dc-i:' + name, [value]);
    }
    if (result.transient) {
      add('time', result.transient.time);
      for (const [name, data] of result.transient.voltages) add('tran-v:' + name, data);
      for (const [name, data] of result.transient.currents) add('tran-i:' + name, data);
    }
    emit({ phase, simulateMs, vectors, values, outputSha256: digest.digest('hex'), convergence: result.convergence,
      deckSha256: createHash('sha256').update(fixture.netlist).digest('hex'), actualNodes: fixture.actualNodes, startMemory, endMemory: memory() });
  }
} else throw new Error(`unknown mode ${mode}`);
