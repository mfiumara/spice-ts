#!/usr/bin/env tsx
/** All corpus runs must be launched through spice-heavy. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { alignAndMeasure, parseNgspiceRaw, type AnalysisType, type SampleSeries } from '../comparison-harness.js';
import { analysisType } from '../corpus/classic/report.js';
import { canonicalize, projectAnalysis } from './canonical.js';
import { loadCorpus, summarize } from './compare.js';
import { runXyce, translateForXyce, type ReferenceRun } from './xyce.js';

export const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The shared legacy parser is permissive. Reject incomplete/nonfinite native exports first. */
export function parseReferenceRaw(raw: string): ReturnType<typeof parseNgspiceRaw> {
  const sections = raw.split(/(?=^Title:)/m).filter(section => section.startsWith('Title:'));
  if (!sections.length) throw new Error('No ASCII raw plots');
  for (const section of sections) {
    const variables = Number(section.match(/^No\. Variables:\s*(\d+)/m)?.[1]);
    const points = Number(section.match(/^No\. Points:\s*(\d+)/m)?.[1]);
    if (!(variables > 0) || !(points > 0)) throw new Error('Invalid raw plot dimensions');
    const values = section.split(/^Values:\s*$/m)[1]?.trim().split(/\r?\n/).filter(line => line.trim());
    if (!values || values.length !== variables * points) throw new Error('Truncated/extra raw numeric fields');
    for (const [index, line] of values.entries()) {
      const token = index % variables === 0 ? line.replace(/^\s*\d+\s+/, '').trim() : line.trim();
      const parts = token.split(',');
      if (parts.length > 2 || parts.some(part => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(part) || !Number.isFinite(Number(part)))) {
        throw new Error('Invalid/nonfinite raw numeric field');
      }
    }
  }
  const plots = parseNgspiceRaw(raw);
  if (plots.length !== sections.length || plots.some(plot => !Object.keys(plot.signals).length)) throw new Error('Malformed raw plot metadata');
  return plots;
}

/** Native execution/export/parse errors are not convergence measurements. */
export function runNgspiceReference(netlist: string, analysis?: AnalysisType): ReferenceRun {
  const directory = mkdtempSync(join(tmpdir(), 'spice-ts-reference-ng-'));
  const start = performance.now();
  const command = ['ngspice', '-b', '-r', 'output.raw', 'input.cir'];
  let output = '', failureKind: ReferenceRun['failureKind'] = 'execution';
  try {
    writeFileSync(join(directory, 'input.cir'), netlist);
    writeFileSync(join(directory, '.spiceinit'), 'set filetype=ascii\n');
    const result = spawnSync(command[0], command.slice(1), {
      cwd: directory, encoding: 'utf8', env: { ...process.env, HOME: directory }, timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
    });
    output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ngspice exited ${result.status} (${result.signal})`);
    failureKind = 'export';
    const raw = readFileSync(join(directory, 'output.raw'), 'utf8');
    failureKind = 'parse';
    const plots = parseReferenceRaw(raw);
    const plot = analysis ? plots.find(p => analysisType(p.plotName) === analysis) : plots[0];
    if (!plot || !plot.grid.length) throw new Error('No requested numeric analysis output');
    const series: SampleSeries = { grid: analysis === 'op' ? [0] : plot.grid, signals: plot.signals };
    return { status: 'success', convergence: 'converged', command, runtimeMs: performance.now() - start, series, output };
  } catch (error) {
    return { status: 'failed', convergence: failureKind === 'execution' ? 'unknown' : 'not-run', failureKind,
      command, runtimeMs: performance.now() - start, output, error: String(error) };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function compact(run: ReferenceRun, outputPath: string): object {
  writeFileSync(outputPath, run.output ?? '');
  const { output, ...rest } = run;
  const warnings = (output ?? '').split(/\r?\n/).flatMap((line, i, lines) => /warning|ignored|unrecognized|not supported/i.test(line) ? lines.slice(i, i + 3) : []);
  if ('series' in rest) {
    const { series, ...fields } = rest;
    return { ...fields, points: series.grid.length, signals: Object.keys(series.signals), seriesSha256: sha256(JSON.stringify(series)),
      outputPath, outputSha256: sha256(output ?? ''), warnings };
  }
  return { ...rest, outputPath, outputSha256: sha256(output ?? ''), warnings };
}

export function fixtureStatus(runs: ReferenceRun[]): 'success' | 'failed' | 'unsupported' {
  if (!runs.length || runs.some(run => run.status === 'unsupported')) return 'unsupported';
  return runs.every(run => run.status === 'success') ? 'success' : 'failed';
}

export async function main(): Promise<void> {
  const outputFlag = process.argv.indexOf('--output-dir');
  const directory = outputFlag < 0 ? 'benchmarks/reference/adapter-948' : process.argv[outputFlag + 1];
  mkdirSync(directory, { recursive: true });
  const version = (exe: string, args: string[]) => {
    const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 10_000 });
    if (r.error || r.status !== 0) throw new Error(`${exe}: ${r.error?.message ?? r.stderr}`);
    return r.stdout.trim();
  };
  const executable = process.env.XYCE_BIN ?? 'Xyce';
  const xyceVersion = version(executable, ['-v']);
  if (!/Release 7\.10\.0\b/.test(xyceVersion)) throw new Error(`Expected Xyce 7.10.0: ${xyceVersion}`);
  const report = {
    schemaVersion: 'spice-ts-reference-canonical/v1', generatedAt: new Date().toISOString(), head: version('git', ['rev-parse', 'HEAD']),
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    tools: { xyce: xyceVersion, ngspice: version('ngspice', ['--version']) },
    adapterSourceHashes: Object.fromEntries(['canonical.ts', 'xyce.ts', 'expanded.ts', 'compare.ts'].map(file =>
      [file, sha256(readFileSync(`benchmarks/reference/${file}`))])),
    beforeReportSha256: sha256(readFileSync('benchmarks/reference/corpus-report.json')),
    policy: { canonicalCircuitShared: true, ordinalAnalysisProjectionsShared: true, engineDifferences: 'Xyce CSV .print vs ngspice -r output.raw and ascii .spiceinit only',
      solverToleranceTuning: false, unsupportedSettingsDiscarded: false, parityClaim: false,
      counts: 'success requires every projected analysis to export numeric data; unsupported circuit still gets an ngspice diagnostic run on canonical bytes',
      comparisons: 'All projected analyses must succeed in both engines; any reference warning of ignored/unsupported semantics excludes the fixture. Signal selection is native ngspice v()/i() names, not numeric outcome.',
      fallbackSignals: 'If ngspice fails to export, Xyce is requested v(0) only; never compared.',
      timing: 'single run including startup/output, not a speed benchmark', xyceTimeoutMs: 20_000, ngspiceTimeoutMs: 120_000 },
    before: JSON.parse(readFileSync('benchmarks/reference/corpus-report.json', 'utf8')).totals,
    totals: {} as object, fixtures: [] as Array<Record<string, any>>,
  };
  const save = () => {
    report.totals = summarize(report.fixtures as Parameters<typeof summarize>[0]);
    writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(join(directory, 'hash-manifest.json'), JSON.stringify(report.fixtures.map(row => ({ key: row.key,
      originalSha256: row.originalSha256, canonicalSha256: row.canonicalSha256, canonicalPath: row.canonicalPath,
      limitations: row.limitations, projections: row.projections.map((p: any) => ({ ordinal: p.ordinal, analysis: p.analysis,
        sharedInputPath: p.sharedInputPath, sharedInputSha256: p.sharedInputSha256, xyceInputPath: p.xyceInputPath, xyceInputSha256: p.xyceInputSha256 })) })), null, 2) + '\n');
  };
  for (const { key, input } of loadCorpus()) {
    const plan = canonicalize(input.toString('utf8'));
    const rowDir = join(directory, key); mkdirSync(rowDir, { recursive: true });
    const canonicalPath = join(rowDir, 'canonical.cir'); writeFileSync(canonicalPath, plan.netlist);
    const ngRuns: ReferenceRun[] = [], xyRuns: ReferenceRun[] = [];
    const projections: Array<Record<string, any>> = [];
    const comparisons: Array<Record<string, any>> = [];
    const losses: string[] = [];
    if (plan.limitations.length) {
      const ng = runNgspiceReference(plan.netlist); ngRuns.push(ng);
      const xy: ReferenceRun = { status: 'unsupported', convergence: 'unsupported', failureKind: 'translation', runtimeMs: 0, command: [], error: plan.limitations.join('; ') }; xyRuns.push(xy);
      projections.push({ ordinal: null, analysis: null, sharedInputPath: canonicalPath, sharedInputSha256: sha256(plan.netlist),
        ngspice: compact(ng, join(rowDir, 'ngspice-diagnostic.log')), xyce: xy });
    } else {
      for (const [ordinal, spec] of plan.analyses.entries()) {
        const shared = projectAnalysis(plan, ordinal);
        const sharedInputPath = join(rowDir, `${ordinal}-${spec.type}.cir`); writeFileSync(sharedInputPath, shared);
        const ng = runNgspiceReference(shared, spec.type); ngRuns.push(ng);
        const signals = ng.status === 'success' ? Object.keys(ng.series.signals).filter(s => /^[vi]\([^()]+\)$/i.test(s)).sort() : ['v(0)'];
        const fixture = { name: key, analysis: spec.type, netlist: shared, signals };
        let translated: ReturnType<typeof translateForXyce> | undefined;
        try { translated = translateForXyce(fixture); } catch { /* runXyce retains the typed limitation below */ }
        const xyceInputPath = translated ? join(rowDir, `${ordinal}-${spec.type}-xyce.cir`) : null;
        if (xyceInputPath && translated) writeFileSync(xyceInputPath, translated.netlist);
        const xy = await runXyce(fixture, { executable, timeoutMs: 20_000 }); xyRuns.push(xy);
        if (/ignored|unrecognized|not supported|unknown parameter/i.test(xy.output ?? '')) losses.push(`analysis ${ordinal}: Xyce ignored/unsupported statement warning`);
        if (/ignored|unrecognized parameter|unknown parameter/i.test(ng.output ?? '')) losses.push(`analysis ${ordinal}: ngspice ignored/unsupported statement warning`);
        if (ng.status === 'success' && xy.status === 'success') comparisons.push({ ordinal, analysis: spec.type, signals, metrics: alignAndMeasure(ng.series, xy.series, signals) });
        projections.push({ ordinal, analysis: spec.type, directive: spec.directive, sharedInputPath, sharedInputSha256: sha256(shared),
          xyceInputPath, xyceInputSha256: translated ? sha256(translated.netlist) : null, outputDifferences: translated?.changes ?? [],
          ngspiceOutputDirectives: ['argv -r output.raw', '.spiceinit: set filetype=ascii'],
          ngspice: compact(ng, join(rowDir, `${ordinal}-ngspice.log`)), xyce: compact(xy, join(rowDir, `${ordinal}-xyce.log`)) });
      }
    }
    const ngStatus = fixtureStatus(ngRuns), xyStatus = fixtureStatus(xyRuns);
    const eligible = !plan.limitations.length && !losses.length && ngStatus === 'success' && xyStatus === 'success';
    report.fixtures.push({ key, originalSha256: sha256(input), canonicalSha256: sha256(plan.netlist), canonicalPath,
      changes: plan.changes, limitations: plan.limitations, losses, eligibility: eligible ? 'comparable' : plan.limitations.length ? 'unsupported' : losses.length ? 'transformed-with-loss' : 'native-failure',
      ngspice: { status: ngStatus }, xyce: { status: xyStatus }, projections, comparisons: eligible ? comparisons : [],
      partialComparisons: eligible ? [] : comparisons });
    console.log(`${report.fixtures.length}/100 ${key} ngspice=${ngStatus} Xyce=${xyStatus} ${report.fixtures.at(-1)!.eligibility}`);
    save();
  }
  console.log(JSON.stringify({ before: report.before, after: report.totals }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
