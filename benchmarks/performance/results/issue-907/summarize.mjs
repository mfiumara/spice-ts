// Verify 18 bounded process receipts plus the archived 63-run baseline; no simulator reruns.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { m2Netlist } from '../../scaling-m2-fixture.mjs';
import { errors } from './metrics.mjs';
const out = 'benchmarks/performance/results/issue-907';
const json = path => JSON.parse(readFileSync(`${out}/${path}`, 'utf8'));
const readProfile = path => JSON.parse(gunzipSync(readFileSync(`${out}/${path}.gz`)));
const rows = readFileSync(`${out}/samples.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const oldRows = readFileSync(`${out}/reused/samples.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(rows.length, 17); assert.equal(oldRows.length, 63);
assert.equal(new Set(rows.map(r => `${r.engine}-${r.circuit}-${r.size}`)).size, 17);
assert.equal(rows.filter(r => r.engine === 'ngspice').length, 8);
assert.equal(json('host.json').revision, json('warm-host.json').revision);
const warmRows = readFileSync(`${out}/warm-samples.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
assert.equal(warmRows.length, 1);
rows.push({ ...warmRows[0], warmup: true });
const summary = [];
for (const row of rows.filter(r => r.engine === 'spice-ts')) {
  assert.equal(row.status, 'ok');
  const key = `${row.circuit}-${row.size}${row.warmup ? '-warm' : ''}`;
  const { netlist } = m2Netlist(row.circuit, row.size);
  assert.equal(row.netlistSha256, createHash('sha256').update(netlist).digest('hex'));
  const originals = oldRows.filter(r => r.engine === 'spice-ts' && r.circuit === row.circuit && r.size === row.size && r.status === 'ok');
  assert(originals.length >= 3);
  assert(originals.every(r => r.netlistSha256 === row.netlistSha256));
  const unchangedProbe = originals.every(r => JSON.stringify(r.grid) === JSON.stringify(row.grid) && JSON.stringify(r.values) === JSON.stringify(row.values));
  assert(unchangedProbe, 'changed probe versus inherited exact values');
  const reference = rows.find(r => r.engine === 'ngspice' && r.circuit === row.circuit && r.size === row.size);
  if (reference) {
    assert.equal(reference.status, 'ok'); assert.equal(reference.netlistSha256, row.netlistSha256);
    const recorded = json(`references/${row.circuit}-${row.size}.json`);
    assert.deepEqual(recorded, reference);
  }
  const heap = readProfile(`profiles/${key}.heapprofile`);
  const nodeMap = new Map();
  function visit(node, stack) {
    const frame = { ...node.callFrame, url: node.callFrame.url.replace(/^.*\/packages\/core\//, 'packages/core/') };
    const path = [...stack, frame];
    nodeMap.set(node.id, { frame, stack: path, selfSize: node.selfSize, sampledBytes: 0, samples: 0 });
    for (const child of node.children) visit(child, path);
  }
  visit(heap.head, []);
  for (const sample of heap.samples) {
    const node = nodeMap.get(sample.nodeId); assert(node, 'unknown allocation node');
    node.sampledBytes += sample.size; node.samples++;
  }
  const stacks = [...nodeMap.values()].filter(n => n.sampledBytes).sort((a, b) => b.sampledBytes - a.sampledBytes);
  const sampledBytes = stacks.reduce((s, n) => s + n.sampledBytes, 0);
  const supernode = stacks.filter(n => n.stack.some(f => f.functionName === 'applySupernode'));
  const supernodeBytes = supernode.reduce((s, n) => s + n.sampledBytes, 0);
  const groups = {};
  for (const node of stacks) {
    const names = node.stack.map(f => f.functionName);
    const group = names.includes('parseAsync') ? 'parse/preprocess' : names.includes('compile') ? 'compile' : names.includes('factorize') ? 'factorize' : names.includes('solveCompiledAnalyses') ? 'other-analysis' : 'other';
    groups[group] = (groups[group] ?? 0) + node.sampledBytes;
  }
  const cpu = readProfile(`profiles/${key}.cpuprofile`), frames = new Map(cpu.nodes.map(n => [n.id, n.callFrame]));
  const self = {};
  for (let i = 0; i < cpu.samples.length; i++) {
    const f = frames.get(cpu.samples[i]), name = f.functionName || '(anonymous)';
    self[name] = (self[name] ?? 0) + cpu.timeDeltas[i] / 1000;
  }
  const cpuTotalMs = Object.values(self).reduce((s, v) => s + v, 0);
  const trace = gunzipSync(readFileSync(`${out}/logs/spice-ts-${key}.stdout.gz`)).toString();
  const gc = [...trace.matchAll(/\]\s+(\d+) ms: ([\w-]+).*?, ([\d.]+) \/ ([\d.]+) ms/g)].map(m => ({ processMs: Number(m[1]), kind: m[2], pauseMs: Number(m[3]), auxiliaryMs: Number(m[4]) }));
  const start = row.phases.find(p => p.phase === 'simulate-start').ms, end = row.phases.find(p => p.phase === 'simulate-end').ms;
  const gcSummary = {};
  for (const event of gc) {
    const phase = event.processMs < start ? 'startup' : event.processMs <= end ? 'simulate' : 'profile-output';
    const item = gcSummary[phase] ??= { count: 0, pauseMs: 0 };
    item.count++; item.pauseMs += event.pauseMs;
  }
  summary.push({ circuit: row.circuit, size: row.size, warmup: row.warmup ?? false, actualNodes: row.actualNodes, wallMs: row.wallMs, simulateMs: row.ms, peakRssMiB: row.peakRssMiB, phases: row.phases, unchangedProbeVersus906: unchangedProbe, parity: reference ? errors(row, reference) : { status: 'unavailable', reason: 'reuse #906 three 45 s ngspice timeouts; no new 50k ngspice run' }, allocation: { sampledBytes, sampleCount: heap.samples.length, sumTreeSelfSize: [...nodeMap.values()].reduce((s, n) => s + n.selfSize, 0), groups, supernodeBytes, supernodePercent: supernodeBytes / sampledBytes * 100, supernodeStacks: supernode, topStacks: stacks.slice(0, 20) }, cpu: { cpuTotalMs, topSelf: Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 20), supernodeSelfMs: self.applySupernode ?? 0, gcSelfMs: self['(garbage collector)'] ?? 0 }, gc: gcSummary, jit: { completedOptimizations: (trace.match(/completed optimizing/g) ?? []).length, deoptimizations: (trace.match(/\[bailout /g) ?? []).length, supernodeEvents: trace.split('\n').filter(line => /applySupernode/.test(line)) } });
}
assert.equal(summary.length, 10);
writeFileSync(`${out}/summary.json`, JSON.stringify({ processReceipts: rows.length, inheritedReceipts: oldRows.length, measuredRevision: json('host.json').revision, summary }, null, 2));
console.log('Verified 18 new process receipts, 63 inherited receipts, 10 allocation/CPU profiles, 8 binary-precision pairs plus one warm mesh control.');
for (const s of summary) console.log(JSON.stringify({ circuit: s.circuit, size: s.size, simulateMs: s.simulateMs, rss: s.peakRssMiB, allocatedMiB: s.allocation.sampledBytes / 1048576, supernodeMiB: s.allocation.supernodeBytes / 1048576, supernodeSelfMs: s.cpu.supernodeSelfMs, unchanged: s.unchangedProbeVersus906, parity: s.parity, gc: s.gc }));
