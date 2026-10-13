// Validate the entire bounded journal, archived precision controls and profiles.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { deserialize } from 'node:v8';
import { m2Netlist, M2_CIRCUITS } from '../../scaling-m2-fixture.mjs';
import { errors } from '../issue-907/metrics.mjs';
import { distribution, cpuSelf } from './metrics.mjs';
const out = 'benchmarks/performance/results/issue-919';
const rows = readFileSync(`${out}/samples.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.length, 39);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const vectorHash = v => hash(Buffer.from(v.buffer, v.byteOffset, v.byteLength));
const summary = { measuredRevision: JSON.parse(readFileSync(`${out}/host.json`)).revision, processReceipts: rows.length, statuses: {}, controls: [], isolation: [], jit: [] };
for (const row of rows) {
  assert.equal(row.netlistSha256, hash(m2Netlist(row.circuit, row.size).netlist));
  assert(['ok', 'timeout'].includes(row.status));
  summary.statuses[row.status] = (summary.statuses[row.status] ?? 0) + 1;
}
for (const circuit of M2_CIRCUITS) for (const size of [1000, 10000, 50000]) {
  const group = rows.filter(r => r.mode === 'simulate' && r.circuit === circuit && r.size === size);
  assert.equal(group.length, 3);
  const archived = JSON.parse(readFileSync(`benchmarks/performance/results/issue-907/profiles/${circuit}-${size}.result.json`));
  const reference = circuit.startsWith('cmos') && size === 50000 ? null : JSON.parse(readFileSync(`benchmarks/performance/results/issue-907/references/${circuit}-${size}.json`));
  for (const phase of ['cold', 'warm']) {
    const samples = group.flatMap(r => r.samples.filter(s => s.phase === phase));
    for (const sample of samples) {
      assert.deepEqual(sample.grid, archived.grid);
      assert.deepEqual(sample.values, archived.values);
      assert.equal(sample.probeSha256, vectorHash(Float64Array.from(sample.values)));
    }
    summary.controls.push({ circuit, size, phase, completed: samples.length, timedOutChildren: group.filter(r => r.status === 'timeout').length, ...(samples.length ? { simulateMs: distribution(samples.map(s => s.ms)), processPeakRssMiB: distribution(samples.map(s => s.endMemory.peakRssMiB)), probeSha256: samples[0].probeSha256, parity: reference ? errors(samples[0], reference) : { status: 'unavailable', reason: 'Inherited #906 3/3 ngspice CMOS50k timeouts at 45s; no new reference run' } } : {}) });
  }
}
for (const size of [1000, 10000, 50000]) {
  const key = `capture-resistor-mesh-op-${size}`;
  const capture = rows.find(r => r.mode === 'capture' && r.size === size);
  assert(capture && capture.status === 'ok');
  const bytes = readFileSync(`${out}/profiles/${key}.matrix.gz`);
  assert.equal(hash(bytes), capture.captureSha256);
  const matrix = deserialize(gunzipSync(bytes));
  assert.equal(vectorHash(matrix.expected), capture.samples[0].expectedSha256);
  const group = rows.filter(r => r.mode === 'isolate' && r.size === size);
  assert.equal(group.length, 3);
  for (const phase of ['cold', 'warm']) {
    const samples = group.map(r => r.samples.find(s => s.phase === phase));
    assert(samples.every(Boolean));
    const profiles = group.map(r => {
      const prefix = `${key}-r${r.repeat}-${phase}`;
      const profile = JSON.parse(gunzipSync(readFileSync(`${out}/profiles/${prefix}.cpuprofile.gz`)));
      return { prefix, self: cpuSelf(profile) };
    });
    for (const sample of samples) {
      assert.equal(sample.solutionSha256, capture.samples[0].expectedSha256);
      assert.equal(sample.numericFactorizations, 1);
      assert.equal(sample.pivotReuseFactorizations, 0);
    }
    summary.isolation.push({ size, phase, factorMs: distribution(samples.map(s => s.factorMs)), solveMs: distribution(samples.map(s => s.solveMs)), processPeakRssMiB: distribution(samples.map(s => s.endMemory.peakRssMiB)), supernodalUpdates: samples[0].supernodalUpdates, factorNonzeros: samples[0].factorNonzeros, growth: group[0].samples.find(s => s.phase === 'growth-diagnostic'), profiles });
  }
  for (const r of group) {
    const trace = gunzipSync(readFileSync(`${out}/logs/isolate-resistor-mesh-op-${size}-r${r.repeat}.stdout.gz`)).toString();
    summary.jit.push({ size, repeat: r.repeat, supernodeTraceLines: trace.split('\n').filter(l => /applySupernode|growUFactors/.test(l)) });
  }
}
const traceRows = JSON.parse(readFileSync(`${out}/trace-samples.json`));
assert.equal(traceRows.length, 3);
summary.phaseTaggedTraces = traceRows.map(row => {
  assert.equal(row.exit, 0);
  const capture = rows.find(r => r.mode === 'capture' && r.size === row.size);
  for (const sample of row.samples.filter(s => s.solutionSha256)) {
    assert.equal(sample.solutionSha256, capture.samples[0].expectedSha256);
  }
  const lines = gunzipSync(readFileSync(`${out}/logs/trace-${row.size}.stdout.gz`)).toString().split('\n');
  let phase = 'outside';
  const deopts = [];
  for (const line of lines) {
    const marker = line.match(/^TRACE_PHASE (\S+) (start|end)$/);
    if (marker) phase = marker[2] === 'start' ? marker[1] : 'outside';
    if (/bailout.*applySupernode/.test(line)) deopts.push({ phase, line });
  }
  return { size: row.size, deopts, bytecodeGrowthRegion: lines.filter(line => {
    const offset = line.match(/@\s+(\d+) :/);
    return offset && Number(offset[1]) >= 357 && Number(offset[1]) <= 390;
  }) };
});
summary.traceProcessReceipts = traceRows.length;
summary.totalProcessReceipts = rows.length + traceRows.length;
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ processReceipts: summary.processReceipts, statuses: summary.statuses, controls: summary.controls, isolation: summary.isolation.map(({ profiles, ...rest }) => ({ ...rest, supernodeSelfMs: distribution(profiles.map(p => p.self.find(s => s.name === 'applySupernode')?.ms ?? 0)) })) }, null, 2));
