#!/usr/bin/env tsx
/** Run with spice-heavy; no per-fixture circuit or model changes. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { arch, cpus, platform, release } from 'node:os';
import { alignAndMeasure, type ComparisonFixture, type SampleSeries } from '../../comparison-harness.js';
import { runNativeNgspice, type ClassicCircuit } from '../../corpus/classic/report.js';
import { runXyce, translateForXyce } from '../xyce.js';
import type { simulate as Simulate } from '../../../packages/core/src/index.js';

const sha = (input: string): string => createHash('sha256').update(input).digest('hex');
const specifications = [
  { name: 'test_ekv26_nmos', analysis: 'dc', signals: ['v(d1)', 'v(g)', 'i(vdmon)'] },
  { name: 'test_ekv26_pmos', analysis: 'dc', signals: ['v(d1)', 'v(g)', 'i(vdmon)'] },
  { name: 'inverter_transient_ekv26', analysis: 'tran', signals: ['v(vi)', 'v(1)', 'i(vdd)'] },
  { name: 'corpus-g/ekv26-inverter-transient-ekv26-cir', analysis: 'tran', signals: ['v(vi)', 'v(1)', 'i(vdd)'] },
] satisfies Array<{ name: string; analysis: ComparisonFixture['analysis']; signals: string[] }>;

function series(result: Awaited<ReturnType<typeof Simulate>>, fixture: ComparisonFixture): SampleSeries {
  const data = fixture.analysis === 'dc' ? result.dcSweep! : result.transient!;
  const grid = fixture.analysis === 'dc' ? result.dcSweep!.sweepValues : result.transient!.time;
  return { grid: Array.from(grid), signals: Object.fromEntries(fixture.signals.map(signal => {
    const name = signal.slice(2, -1);
    return [signal, Array.from(signal.startsWith('v(') ? data.voltage(name) : data.current(name), re => ({ re, im: 0 }))];
  })) };
}
function sweeps(value: SampleSeries): SampleSeries[] {
  const starts = [0];
  const direction = value.grid.slice(1).map((x, i) => Math.sign(x - value.grid[i])).find(sign => sign !== 0) ?? 1;
  for (let i = 1; i < value.grid.length; i++) if (direction * (value.grid[i] - value.grid[i - 1]) < 0) starts.push(i);
  starts.push(value.grid.length);
  return starts.slice(0, -1).map((start, i) => ({ grid: value.grid.slice(start, starts[i + 1]),
    signals: Object.fromEntries(Object.entries(value.signals).map(([name, values]) => [name, values.slice(start, starts[i + 1])])) }));
}

async function main(): Promise<void> {
  const coreFlag = process.argv.indexOf('--core');
  const corePath = resolve(coreFlag < 0 ? 'packages/core/dist/index.js' : process.argv[coreFlag + 1]);
  const { simulate } = await import(pathToFileURL(corePath).href) as { simulate: typeof Simulate };
  const outputFlag = process.argv.indexOf('--output');
  if (outputFlag < 0) throw new Error('--output is required');
  const output = resolve(process.argv[outputFlag + 1]);
  const command = (executable: string, args: string[]): string => {
    const run = spawnSync(executable, args, { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`${executable}: ${run.stderr}`);
    return run.stdout.trim();
  };
  const xyceVersion = command(process.env.XYCE_BIN ?? 'Xyce', ['-v']);
  if (!/Release 7\.10\.0\b/.test(xyceVersion)) throw new Error('Expected Xyce 7.10.0');
  const report = {
    schema: 'spice-ts-ekv-static/v1', generatedAt: new Date().toISOString(),
    coreHead: process.argv.includes('--baseline') ? 'ead0642d579adff1891533ddf5acccc7d60f3d72' : command('git', ['rev-parse', 'HEAD']),
    coreWorktreeDirty: command('git', ['status', '--porcelain']).length > 0,
    coreImplementationDigests: Object.fromEntries(['circuit.ts', 'parser/model-parser.ts',
      ...(process.argv.includes('--baseline') ? [] : ['devices/ekv.ts'])].map(path =>
      [path, sha(readFileSync(resolve(corePath, '../../src', path), 'utf8'))])),
    tools: { xyce: xyceVersion, ngspice: command('ngspice', ['--version']) },
    environment: { platform: platform(), arch: arch(), release: release(), cpu: cpus()[0]?.model, node: process.version },
    policy: { reference: 'xyce-7.10', identicalSpiceTsXyceBytes: true, parityClaim: false,
      relativeError: 'Existing harness excludes reference magnitudes <=1e-15; larger near-zero losses are retained without a denominator floor',
      timing: 'Single wall execution including startup, not a performance claim',
      ngspice: 'ngspice-lacks-model (MOS1 fallback); source circuit/model statements unchanged' },
    fixtures: [] as Array<Record<string, unknown>>,
  };
  const manifest = JSON.parse(readFileSync('benchmarks/reference/ekv/manifest.json', 'utf8')) as { fixtures: Array<{ name: string; sha256: string }> };
  for (const spec of specifications) {
    const corpus = spec.name.startsWith('corpus-g/');
    const path = corpus ? 'benchmarks/corpus/corpus-g/fixtures/EKV26/inverter_transient_ekv26.cir' : `benchmarks/reference/ekv/fixtures/${spec.name}.cir`;
    const source = readFileSync(path, 'utf8');
    const expectedHash = corpus ? 'c23703254e36b5454a2f02463e84cf16e6bb64a6b2a557b3a901486cdbe2dd98' : manifest.fixtures.find(row => row.name === spec.name)!.sha256;
    if (sha(source) !== expectedHash) throw new Error(`Source hash mismatch: ${path}`);
    const terminated = /^\s*\.end\s*$/im.test(source) ? source : source.trimEnd() + '\n.end\n';
    const original: ComparisonFixture = { ...spec, netlist: terminated };
    const translation = translateForXyce(original);
    const fixture = { ...original, netlist: translation.netlist };
    // Idempotence proves runXyce's translation sends precisely the same bytes
    // that simulate receives, not merely equivalent device/model statements.
    if (translateForXyce(fixture).netlist !== fixture.netlist) throw new Error('Non-idempotent output translation');
    const xyce = await runXyce(fixture);
    const started = performance.now();
    const result = await simulate(fixture.netlist);
    const runtimeMs = performance.now() - started;
    const target = series(result, fixture);
    const ngspice = await runNativeNgspice(Buffer.from(terminated), { localPath: path, analyses: [spec.analysis] } as ClassicCircuit);
    if (xyce.status !== 'success' || ngspice.status !== 'success') throw new Error(`Reference execution failed: ${JSON.stringify({ xyce, ngspice })}`);
    const native = ngspice.analyses.find(row => row.type === spec.analysis)!.series;
    const targetSweeps = sweeps(target), referenceSweeps = sweeps(xyce.series);
    if (targetSweeps.length !== referenceSweeps.length) throw new Error('Sweep count mismatch');
    report.fixtures.push({ key: spec.name, reference: 'xyce-7.10', path, sourceSha256: sha(source),
      spiceTsInputSha256: sha(fixture.netlist), xyceInputSha256: sha(translateForXyce(fixture).netlist),
      ngspiceInputSha256: sha(terminated), sharedChanges: translation.changes,
      spiceTsModel: process.argv.includes('--baseline') ? 'MOS1 fallback' : 'EKV26 static DC',
      ngspiceModel: 'ngspice-lacks-model (MOS1 fallback)', xyce,
      spiceTs: { status: 'success', runtimeMs, warnings: result.warnings, series: target }, ngspice,
      spiceTsVsXyce: alignAndMeasure(target, xyce.series, spec.signals),
      spiceTsVsNgspice: alignAndMeasure(target, native, spec.signals),
      ngspiceVsXyce: alignAndMeasure(native, xyce.series, spec.signals),
      perSweep: targetSweeps.map((sweep, i) => ({ ordinal: i, spiceTsVsXyce: alignAndMeasure(sweep, referenceSweeps[i], spec.signals) })),
    });
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`${spec.name}: reference=xyce-7.10, ${target.grid.length} samples, ${targetSweeps.length} sweeps`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
