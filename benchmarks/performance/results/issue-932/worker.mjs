// Receipt shape: complete output/factor digests, timings, CPU, memory and counts.
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { m2Netlist } from '../../scaling-m2-fixture.mjs';
const [mode, bundle, circuit, sizeText, journal] = process.argv.slice(2);
const core = await import(pathToFileURL(bundle));
const emit = row => appendFileSync(journal, JSON.stringify(row) + '\n');
const bytes = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const hash = a => createHash('sha256').update(bytes(a)).digest('hex');
const memory = () => ({ ...process.memoryUsage(), peakRssMiB: process.resourceUsage().maxRSS / 1024 });
if (mode === 'isolate') {
  const capture = new URL(`../issue-919/profiles/capture-resistor-mesh-op-${sizeText}.matrix.gz`, import.meta.url);
  const { A, b, expected } = deserialize(gunzipSync(readFileSync(capture)));
  for (const phase of ['cold', 'warm']) {
    const solver = new core.GilbertPeierlsSolver();
    solver.analyzePattern(A);
    const initialUCapacity = solver.uValues.length;
    const startMemory = memory(), start = performance.now(), cpu = process.cpuUsage();
    solver.factorize(A);
    const factorMs = performance.now() - start, factorCpu = process.cpuUsage(cpu);
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
    assert.equal(solver.numericFactorizations, 1);
    assert.equal(solver.pivotReuseFactorizations, 0);
    emit({ phase, factorMs, solveMs, factorCpu, regions: solver.phase932 ?? null,
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
