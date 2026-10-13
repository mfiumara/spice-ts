#!/usr/bin/env tsx
/** Reference bootstrap. Run the corpus mode under spice-heavy. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { alignAndMeasure, runSpiceTs, type ComparisonFixture, type EngineRun, type SampleSeries } from '../comparison-harness.js';
import { runNativeNgspice, type ClassicCircuit, type EngineExecution } from '../corpus/classic/report.js';
import { runXyce, translateForXyce } from './xyce.js';

export const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'] as const;
const REVISION = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
const EKV = [
  { name: 'test_ekv26_nmos', analysis: 'dc', signals: ['v(d1)', 'v(g)', 'i(vdmon)'] },
  { name: 'test_ekv26_pmos', analysis: 'dc', signals: ['v(d1)', 'v(g)', 'i(vdmon)'] },
  { name: 'inverter_transient_ekv26', analysis: 'tran', signals: ['v(vi)', 'v(1)', 'i(vdd)'] },
] satisfies Array<{ name: string; analysis: ComparisonFixture['analysis']; signals: string[] }>;
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function loadCorpus(): Array<{ key: string; circuit: ClassicCircuit; input: Buffer }> {
  const rows = CORPORA.flatMap(corpus => {
    const manifest = JSON.parse(readFileSync(resolve(`benchmarks/corpus/${corpus}/manifest.json`), 'utf8')) as { circuits: ClassicCircuit[] };
    if (manifest.circuits.length !== 20) throw new Error(`${corpus}: expected 20 fixtures`);
    return manifest.circuits.map(circuit => {
      const input = readFileSync(resolve(circuit.localPath));
      if (hash(input) !== circuit.sha256) throw new Error(`Fixture hash mismatch: ${circuit.localPath}`);
      return { key: `${corpus}/${circuit.id}`, circuit, input };
    });
  });
  if (rows.length !== 100 || new Set(rows.map(row => row.key)).size !== 100) throw new Error('Expected 100 unique aggregate fixtures');
  return rows;
}

function receipt(run: EngineRun | EngineExecution): object {
  if ('series' in run) {
    const { series, ...rest } = run;
    return { ...rest, points: series.grid.length, signals: Object.keys(series.signals), seriesSha256: hash(JSON.stringify(series)) };
  }
  if ('analyses' in run) {
    const { analyses, ...rest } = run;
    return { ...rest, analyses: analyses.map(a => ({ type: a.type, points: a.series.grid.length, signals: Object.keys(a.series.signals), seriesSha256: hash(JSON.stringify(a.series)) })),
      ...('error' in rest ? { error: rest.error?.slice(0, 4000) } : {}) };
  }
  return { ...run, error: run.error.slice(0, 4000) };
}

function translation(fixture: ComparisonFixture): object {
  try {
    const result = translateForXyce(fixture);
    return { status: 'translated', sha256: hash(result.netlist), changes: result.changes, identicalBytes: result.netlist === fixture.netlist };
  } catch (error) {
    return { status: 'unsupported', reason: String(error), identicalBytes: false };
  }
}

function version(executable: string, args: string[]): string {
  const run = spawnSync(executable, args, { encoding: 'utf8', timeout: 10_000 });
  if (run.error || run.status !== 0) throw new Error(`${executable}: ${run.error?.message ?? run.stderr}`);
  return run.stdout.trim();
}

export function summarize(rows: Array<{ xyce: { status: string }; ngspice: { status: string }; comparisons?: unknown[] }>): object {
  return {
    attemptedFixtures: rows.length,
    xyce: Object.fromEntries(['success', 'failed', 'unsupported'].map(status => [status, rows.filter(r => r.xyce.status === status).length])),
    ngspice: Object.fromEntries(['success', 'failed', 'unsupported'].map(status => [status, rows.filter(r => r.ngspice.status === status).length])),
    comparedFixtures: rows.filter(row => (row.comparisons?.length ?? 0) > 0).length,
  };
}

export async function main(): Promise<void> {
  const mode = process.argv.includes('--corpus') ? 'corpus' : 'ekv';
  const executable = process.env.XYCE_BIN ?? 'Xyce';
  const xyceVersion = version(executable, ['-v']);
  if (!/Release 7\.10\.0\b/.test(xyceVersion)) throw new Error(`Receipt requires Xyce 7.10.0, found ${xyceVersion}`);
  const outputFlag = process.argv.indexOf('--output');
  const output = resolve(outputFlag < 0 ? `benchmarks/reference/${mode}-report.json` : process.argv[outputFlag + 1]);
  const report = {
    schemaVersion: 'spice-ts-reference-bootstrap/v1', mode, generatedAt: new Date().toISOString(),
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    coreHead: version('git', ['rev-parse', 'HEAD']),
    tools: { xyce: xyceVersion, ngspice: version('ngspice', ['--version']) },
    policy: { reference: 'xyce-7.10.0', identicalCircuitAndModelStatements: true, identicalEngineInputBytes: false,
      translation: 'output-only; limitations are retained, never ignored', interpolation: 'linear, monotonic sweep segments matched by ordinal',
      metricsFields: 'Legacy spiceTs means target engine; ngspice means reference engine. In corpus mode target=ngspice, reference=Xyce.',
      timing: 'single execution wall time, includes startup/output; not a performance benchmark', xyceTimeoutMs: 20_000,
      ngspiceTimeoutMs: 120_000, parityClaim: false },
    fixtures: [] as Array<Record<string, unknown>>,
    totals: {} as object,
  };
  const save = (): void => {
    // Keep each machine receipt on one line; arrays otherwise swamp code review.
    const { fixtures, ...header } = report;
    writeFileSync(output, JSON.stringify(header, null, 2).slice(0, -2) + ',\n  "fixtures": [\n' +
      fixtures.map(fixture => '    ' + JSON.stringify(fixture)).join(',\n') + '\n  ]\n}\n');
  };
  if (mode === 'corpus') {
    for (const { key, circuit, input } of loadCorpus()) {
      const started = performance.now();
      const ngspice = await runNativeNgspice(input, circuit);
      const runtimeMs = performance.now() - started;
      // Adapter does not execute multiple analyses/control language. Still retain every fixture.
      const analysis = circuit.analyses.find(a => ['dc', 'ac', 'tran'].includes(a)) ?? 'op';
      const native = ngspice.analyses.find(a => a.type === analysis);
      const signals = native ? Object.keys(native.series.signals).filter(s => /^[vi]\([^()]+\)$/i.test(s)).sort() : ['v(0)'];
      const fixture = { name: key, netlist: input.toString('utf8'), analysis, signals } as ComparisonFixture;
      const xyce = await runXyce(fixture, { executable, timeoutMs: 20_000 });
      const comparisons = native && xyce.status === 'success'
        ? [{ analysis, signals, metrics: alignAndMeasure(native.series, xyce.series, signals) }] : [];
      report.fixtures.push({ key, reference: 'xyce-7.10.0', inputSha256: hash(input), declaredAnalyses: circuit.analyses,
        translation: translation(fixture), ngspice: { ...receipt(ngspice), runtimeMs }, xyce: receipt(xyce), comparisons });
      console.log(`${report.fixtures.length}/100 ${key}: ngspice=${ngspice.status} Xyce=${xyce.status} comparisons=${comparisons.length}`);
      save();
    }
    report.totals = summarize(report.fixtures as Parameters<typeof summarize>[0]);
  } else {
    const manifest = JSON.parse(readFileSync(resolve('benchmarks/reference/ekv/manifest.json'), 'utf8')) as { fixtures: Array<{ name: string; sha256: string }> };
    for (const spec of EKV) {
      const sourcePath = `benchmarks/reference/ekv/fixtures/${spec.name}.cir`;
      const source = readFileSync(resolve(sourcePath), 'utf8');
      if (hash(source) !== manifest.fixtures.find(f => f.name === spec.name)?.sha256) throw new Error(`EKV source hash mismatch: ${sourcePath}`);
      // Upstream DC decks omit .end. Append it uniformly before either engine sees the deck.
      const netlist = /^\s*\.end\s*$/im.test(source) ? source : source.trimEnd() + '\n.end\n';
      const fixture: ComparisonFixture = { ...spec, netlist };
      const xyce = await runXyce(fixture, { executable, timeoutMs: 20_000 });
      const spiceTs = await runSpiceTs(fixture);
      const circuit = { localPath: sourcePath, analyses: [spec.analysis] } as ClassicCircuit;
      const ngspice = await runNativeNgspice(Buffer.from(netlist), circuit);
      const native = ngspice.analyses.find(a => a.type === spec.analysis);
      const compare = (target: SampleSeries | undefined) => target && xyce.status === 'success' ? alignAndMeasure(target, xyce.series, spec.signals) : null;
      report.fixtures.push({ key: spec.name, reference: 'xyce-7.10.0', sourceUrl: `https://github.com/Xyce/Xyce_Regression/blob/${REVISION}/Netlists/EKV26/${spec.name}.cir`,
        sourceSha256: hash(source), inputSha256: hash(netlist), sharedChanges: netlist === source ? [] : ['Append missing .end for both engines'],
        translation: translation(fixture), spiceTsModel: 'MOS1 fallback, not EKV', ngspiceModel: 'MOS1 fallback, not EKV',
        xyce: receipt(xyce), spiceTs: receipt(spiceTs), ngspice: receipt(ngspice),
        series: { xyce: xyce.status === 'success' ? xyce.series : null, spiceTs: spiceTs.status === 'success' ? spiceTs.series : null, ngspice: native?.series ?? null },
        spiceTsVsXyce: compare(spiceTs.status === 'success' ? spiceTs.series : undefined), ngspiceVsXyce: compare(native?.series) });
      console.log(`${spec.name}: Xyce=${xyce.status} spice-ts=${spiceTs.status} ngspice=${ngspice.status}`);
      save();
    }
    report.totals = { fixtures: report.fixtures.length, ekvParityValidated: false, reason: 'spice-ts and ngspice currently use MOS1 for LEVEL=260' };
  }
  save();
  console.log(`Saved ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
