#!/usr/bin/env tsx
/** Original MIT-licensed .global probes; both engines consume identical bytes. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { compareExecutions } from '../aggregate-report.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit } from '../corpus/classic/report.js';

const nested = `Global supplies through nested instances
.global supply
V1 supply 0 10
.subckt leaf out
R1 supply out 1k
R2 out 0 1k
.ends
.subckt wrapper out
Xinner out leaf
.ends
Xone a wrapper
Xtwo b wrapper
.op
.end
`;
const collision = `Global name takes precedence over formal port
.global supply
V1 supply 0 10
V2 local 0 2
.subckt divider supply out
R1 supply out 1k
R2 out 0 1k
.ends
X1 local out divider
.op
.end
`;
const probes = [
  { id: 'nested', netlist: nested },
  { id: 'port-collision', netlist: collision },
  { id: 'unused-actual-port', netlist: collision.replace('V2 local 0 2\n', '') },
  { id: 'mixed-case', netlist: nested.replace('.global supply', '.GLOBAL SUPPLY').replace('R1 supply', 'R1 Supply') },
  { id: 'unused-definition', netlist: nested.replace('.global supply\n', '').replace('.op', '.subckt unused p\n.global supply\n.ends\n.op') },
  { id: 'reachable-definition', netlist: nested.replace('.global supply\n', '').replace('.subckt leaf out', '.subckt leaf out\n.global supply') },
];

async function main(): Promise<void> {
  const rows = [];
  for (const { id, netlist } of probes) {
    const input = Buffer.from(netlist);
    const circuit: ClassicCircuit = {
      id, category: 'global-nodes', analyses: ['op'], sourcePath: 'benchmarks/global-nodes/compare.ts',
      sourceUrl: 'https://github.com/mfiumara/spice-ts/blob/main/benchmarks/global-nodes/compare.ts',
      localPath: `${id}.cir`, sha256: createHash('sha256').update(input).digest('hex'),
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' },
    };
    const ngStart = performance.now();
    const ngspice = await runNativeNgspice(input, circuit);
    const ngspiceMs = performance.now() - ngStart;
    const tsStart = performance.now();
    const spiceTs = await runNativeSpiceTs(input, circuit);
    const spiceTsMs = performance.now() - tsStart;
    const comparisons = compareExecutions(spiceTs, ngspice);
    rows.push({ id, netlist, inputSha256: circuit.sha256, ngspice, spiceTs, ngspiceMs, spiceTsMs, comparisons });
  }
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0);
  const report = {
    command: 'pnpm build && pnpm exec tsx benchmarks/global-nodes/compare.ts',
    tools: { ngspice: version.stdout.match(/ngspice-\d+/)?.[0], node: process.version },
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model },
    policy: { identicalInput: true, perCircuitToleranceTuning: false, absoluteErrorLimit: 1e-12, timing: 'single samples on a shared host; no speed claim' },
    rows,
  };
  await writeFile('benchmarks/global-nodes/report.json', `${JSON.stringify(report, null, 2)}\n`);
  for (const row of rows) {
    assert.equal(row.ngspice.status, 'success', row.id);
    assert.equal(row.spiceTs.status, 'success', `${row.id}: ${row.spiceTs.error}`);
    assert.equal(row.comparisons.length, 1, row.id);
    assert.deepEqual(
      Object.keys(row.spiceTs.analyses[0].series.signals).sort(),
      Object.keys(row.ngspice.analyses[0].series.signals).sort(),
      `${row.id}: both engines must expose every signal`,
    );
    assert.ok(row.comparisons[0].signals.length >= 3, row.id);
    for (const [signal, metric] of Object.entries(row.comparisons[0].metrics.signals)) {
      assert.equal(metric.status, 'compared', `${row.id}: ${signal}`);
      if (metric.status === 'compared') {
        assert.ok(metric.absoluteError.max <= report.policy.absoluteErrorLimit, `${row.id}: ${signal}`);
      }
    }
    console.log(`${row.id}: ${row.comparisons[0].signals.length} signals compared`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
