#!/usr/bin/env tsx
/**
 * Deterministic report runner for the licensed Berkeley SPICE3f5 corpus.
 *
 * Usage:
 *   pnpm exec tsx benchmarks/corpus/classic/report.ts --output benchmarks/corpus/classic/report.json
 *   pnpm exec tsx benchmarks/corpus/classic/report.ts --check
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  alignAndMeasure,
  parseNgspiceRaw,
  type AnalysisType as ComparisonAnalysisType,
  type ComparisonMetrics,
  type ComplexValue,
  type SampleSeries,
} from '../../comparison-harness.js';

export const CLASSIC_REPORT_SCHEMA = 'spice-ts-classic-comparison/v1' as const;
export type ClassicAnalysisType = ComparisonAnalysisType | 'pz' | 'noise' | 'disto';
export type EngineStatus = 'success' | 'failed' | 'unsupported';
export type ConvergenceStatus = 'converged' | 'failed' | 'not-run';

export interface ExpectedStatus {
  expectedStatus: 'pass' | 'fail';
  reason?: string;
}

export interface ClassicCircuit {
  id: string;
  category: string;
  analyses: ClassicAnalysisType[];
  sourcePath: string;
  sourceUrl: string;
  localPath: string;
  sha256: string;
  ngspice: ExpectedStatus;
  spiceTs: ExpectedStatus;
}

export interface ClassicManifest {
  schemaVersion: number;
  source: Record<string, unknown> & { name: string; revision: string; license: string };
  circuits: ClassicCircuit[];
}

export interface EngineAnalysis {
  type: ClassicAnalysisType;
  plotName: string;
  series: SampleSeries;
}

export interface EngineExecution {
  status: EngineStatus;
  convergence: ConvergenceStatus;
  analyses: EngineAnalysis[];
  error?: string;
}

interface EngineAnalysisReport {
  type: ClassicAnalysisType;
  plotName: string;
  points: number;
  signals: string[];
}

interface EngineReport {
  status: EngineStatus;
  convergence: ConvergenceStatus;
  inputSha256: string;
  analyses: EngineAnalysisReport[];
  error?: string;
}

export interface AnalysisComparison {
  analysis: ClassicAnalysisType;
  signals: string[];
  metrics: ComparisonMetrics;
}

export interface ClassicFixtureReport {
  id: string;
  category: string;
  declaredAnalyses: ClassicAnalysisType[];
  sourcePath: string;
  localPath: string;
  input: {
    bytes: number;
    sha256: string;
    identicalForBothEngines: true;
  };
  ngspice: EngineReport;
  spiceTs: EngineReport;
  comparisons: AnalysisComparison[];
  gapIssues: string[];
}

export interface ClassicTotals {
  fixtures: number;
  ngspice: Record<EngineStatus, number>;
  spiceTs: Record<EngineStatus, number>;
  comparedAnalyses: number;
}

export interface ClassicReport {
  schemaVersion: typeof CLASSIC_REPORT_SCHEMA;
  corpus: {
    name: string;
    revision: string;
    license: string;
    fixtureCount: number;
  };
  tools: { ngspice: string; spiceTs: string };
  policy: {
    fixtureAdaptation: 'none';
    perCircuitToleranceTuning: false;
    comparisonGrid: 'spice-ts';
    interpolation: 'linear';
  };
  gapIssues: Array<{ url: string; scope: string }>;
  totals: ClassicTotals;
  fixtures: ClassicFixtureReport[];
}

export interface ClassicReportDependencies {
  readFixture: (localPath: string) => Promise<Buffer>;
  runNgspice: (input: Buffer, circuit: ClassicCircuit) => Promise<EngineExecution>;
  runSpiceTs: (input: Buffer, circuit: ClassicCircuit) => Promise<EngineExecution>;
  tools: { ngspice: string; spiceTs: string };
}

const GAP_ISSUES = [
  {
    url: 'https://github.com/mfiumara/spice-ts/issues/76',
    scope: 'benchmark-driven parser and unsupported device-card coverage',
  },
  {
    url: 'https://github.com/mfiumara/spice-ts/issues/75',
    scope: 'noise, pole-zero, and distortion analysis coverage',
  },
  {
    url: 'https://github.com/mfiumara/spice-ts/issues/7',
    scope: 'transmission-line device coverage',
  },
] as const;

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function sortedSignals(series: SampleSeries): string[] {
  return Object.keys(series.signals).sort((left, right) => left.localeCompare(right));
}

function reportEngine(execution: EngineExecution, inputSha256: string): EngineReport {
  const report: EngineReport = {
    status: execution.status,
    convergence: execution.convergence,
    inputSha256,
    analyses: execution.analyses
      .map(analysis => ({
        type: analysis.type,
        plotName: analysis.plotName,
        points: analysis.series.grid.length,
        signals: sortedSignals(analysis.series),
      }))
      .sort((left, right) => left.type.localeCompare(right.type) || left.plotName.localeCompare(right.plotName)),
  };
  if (execution.error) report.error = execution.error;
  return report;
}

function compareExecutions(spiceTs: EngineExecution, ngspice: EngineExecution): AnalysisComparison[] {
  const comparisons: AnalysisComparison[] = [];
  for (const spiceAnalysis of spiceTs.analyses) {
    const ngspiceAnalysis = ngspice.analyses.find(analysis => analysis.type === spiceAnalysis.type);
    if (!ngspiceAnalysis) continue;
    const signals = sortedSignals(spiceAnalysis.series)
      .filter(signal => ngspiceAnalysis.series.signals[signal] !== undefined);
    if (signals.length === 0) continue;
    comparisons.push({
      analysis: spiceAnalysis.type,
      signals,
      metrics: alignAndMeasure(spiceAnalysis.series, ngspiceAnalysis.series, signals),
    });
  }
  return comparisons.sort((left, right) => left.analysis.localeCompare(right.analysis));
}

function gapsFor(circuit: ClassicCircuit): string[] {
  const gaps = new Set<string>(['https://github.com/mfiumara/spice-ts/issues/76']);
  if (circuit.analyses.some(analysis => analysis === 'noise' || analysis === 'pz' || analysis === 'disto')) {
    gaps.add('https://github.com/mfiumara/spice-ts/issues/75');
  }
  if (circuit.category === 'transmission-line') {
    gaps.add('https://github.com/mfiumara/spice-ts/issues/7');
  }
  return [...gaps];
}

export function summarizeClassicReport(fixtures: ClassicFixtureReport[]): ClassicTotals {
  const totals: ClassicTotals = {
    fixtures: fixtures.length,
    ngspice: { success: 0, failed: 0, unsupported: 0 },
    spiceTs: { success: 0, failed: 0, unsupported: 0 },
    comparedAnalyses: 0,
  };
  for (const fixture of fixtures) {
    totals.ngspice[fixture.ngspice.status] += 1;
    totals.spiceTs[fixture.spiceTs.status] += 1;
    totals.comparedAnalyses += fixture.comparisons.length;
  }
  return totals;
}

export async function buildClassicReport(
  manifest: ClassicManifest,
  dependencies: ClassicReportDependencies,
): Promise<ClassicReport> {
  const fixtures: ClassicFixtureReport[] = [];
  for (const circuit of manifest.circuits) {
    const input = await dependencies.readFixture(circuit.localPath);
    const digest = sha256(input);
    if (digest !== circuit.sha256) {
      throw new Error(`${circuit.id}: SHA-256 mismatch (expected ${circuit.sha256}, observed ${digest})`);
    }

    // Both runners receive the same immutable Buffer object. Native ngspice is
    // given these bytes directly; spice-ts receives their lossless UTF-8 text.
    const [ngspice, spiceTs] = await Promise.all([
      dependencies.runNgspice(input, circuit),
      dependencies.runSpiceTs(input, circuit),
    ]);
    fixtures.push({
      id: circuit.id,
      category: circuit.category,
      declaredAnalyses: circuit.analyses,
      sourcePath: circuit.sourcePath,
      localPath: circuit.localPath,
      input: { bytes: input.byteLength, sha256: digest, identicalForBothEngines: true },
      ngspice: reportEngine(ngspice, digest),
      spiceTs: reportEngine(spiceTs, digest),
      comparisons: compareExecutions(spiceTs, ngspice),
      gapIssues: gapsFor(circuit),
    });
  }

  return {
    schemaVersion: CLASSIC_REPORT_SCHEMA,
    corpus: {
      name: manifest.source.name,
      revision: manifest.source.revision,
      license: manifest.source.license,
      fixtureCount: manifest.circuits.length,
    },
    tools: dependencies.tools,
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
    },
    gapIssues: [...GAP_ISSUES],
    totals: summarizeClassicReport(fixtures),
    fixtures,
  };
}

function analysisType(plotName: string): ClassicAnalysisType | null {
  const name = plotName.toLowerCase();
  if (name.includes('operating point')) return 'op';
  if (name.includes('dc transfer')) return 'dc';
  if (name.includes('ac analysis')) return 'ac';
  if (name.includes('transient')) return 'tran';
  if (name.includes('noise')) return 'noise';
  if (name.includes('pole-zero') || name.includes('pole zero')) return 'pz';
  if (name.includes('distortion')) return 'disto';
  return null;
}

function cleanError(error: string, temporaryDirectory?: string): string {
  const withoutDirectory = temporaryDirectory ? error.split(temporaryDirectory).join('<temporary-directory>') : error;
  return withoutDirectory.trim().replaceAll(/\s+/g, ' ').slice(0, 1000);
}

export async function runNativeNgspice(input: Buffer, circuit: ClassicCircuit): Promise<EngineExecution> {
  const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-classic-report-'));
  const netlistPath = resolve(directory, basename(circuit.localPath));
  const rawPath = resolve(directory, 'output.raw');
  try {
    await writeFile(netlistPath, input);
    await writeFile(resolve(directory, '.spiceinit'), 'set filetype=ascii\n');
    const completed = spawnSync('ngspice', ['-b', '-r', basename(rawPath), basename(netlistPath)], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, HOME: directory },
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (completed.error || completed.status !== 0) {
      const detail = completed.error?.message ?? [completed.stderr, completed.stdout].filter(Boolean).join('\n');
      return {
        status: 'failed',
        convergence: 'failed',
        analyses: [],
        error: cleanError(detail || `ngspice exited ${completed.status}`, directory),
      };
    }

    let raw: string;
    try {
      raw = await readFile(rawPath, 'utf8');
    } catch {
      return {
        status: 'failed',
        convergence: 'not-run',
        analyses: [],
        error: 'no raw analysis data produced',
      };
    }
    const analyses = parseNgspiceRaw(raw)
      .map(plot => {
        const type = analysisType(plot.plotName);
        return type ? { type, plotName: plot.plotName, series: { grid: plot.grid, signals: plot.signals } } : null;
      })
      .filter((analysis): analysis is EngineAnalysis => analysis !== null);
    if (analyses.length === 0) {
      return {
        status: 'failed',
        convergence: 'not-run',
        analyses: [],
        error: 'no raw analysis data produced',
      };
    }
    return { status: 'success', convergence: 'converged', analyses };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function real(values: Iterable<number>): ComplexValue[] {
  return Array.from(values, re => ({ re, im: 0 }));
}

function phasors(values: Iterable<{ magnitude: number; phase: number }>): ComplexValue[] {
  return Array.from(values, value => {
    const radians = value.phase * Math.PI / 180;
    return { re: value.magnitude * Math.cos(radians), im: value.magnitude * Math.sin(radians) };
  });
}

function mapSignals<T>(
  voltages: Map<string, T>,
  currents: Map<string, T>,
  convert: (values: T) => ComplexValue[],
): Record<string, ComplexValue[]> {
  const signals: Record<string, ComplexValue[]> = {};
  for (const [name, values] of [...voltages.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    signals[`v(${name.toLowerCase()})`] = convert(values);
  }
  for (const [name, values] of [...currents.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    signals[`i(${name.toLowerCase()})`] = convert(values);
  }
  return signals;
}

export async function runNativeSpiceTs(input: Buffer, circuit: ClassicCircuit): Promise<EngineExecution> {
  const text = input.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(input)) {
    return {
      status: 'unsupported',
      convergence: 'not-run',
      analyses: [],
      error: 'fixture is not lossless UTF-8 and cannot be supplied to the spice-ts string API',
    };
  }

  try {
    const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href);
    core.parse(text);
    const result = await core.simulate(text);
    const analyses: EngineAnalysis[] = [];
    for (const type of circuit.analyses) {
      if (type === 'op' && result.dc) {
        const voltages = new Map([...result.dc.voltages].map(([name, value]: [string, number]) => [name, [value]]));
        const currents = new Map([...result.dc.currents].map(([name, value]: [string, number]) => [name, [value]]));
        analyses.push({ type, plotName: 'Operating Point', series: { grid: [0], signals: mapSignals(voltages, currents, real) } });
      } else if (type === 'tran' && result.transient) {
        analyses.push({
          type,
          plotName: 'Transient Analysis',
          series: {
            grid: result.transient.time,
            signals: mapSignals(result.transient.voltages, result.transient.currents, real),
          },
        });
      } else if (type === 'ac' && result.ac) {
        analyses.push({
          type,
          plotName: 'AC Analysis',
          series: {
            grid: result.ac.frequencies,
            signals: mapSignals(result.ac.voltages, result.ac.currents, phasors),
          },
        });
      } else if (type === 'dc' && result.dcSweep) {
        const internal = result.dcSweep as unknown as {
          sweepValues: Float64Array;
          voltageArrays: Map<string, Float64Array>;
          currentArrays: Map<string, Float64Array>;
        };
        analyses.push({
          type,
          plotName: 'DC transfer characteristic',
          series: {
            grid: Array.from(internal.sweepValues),
            signals: mapSignals(internal.voltageArrays, internal.currentArrays, real),
          },
        });
      }
    }
    if (analyses.length !== circuit.analyses.length || analyses.length === 0) {
      const missing = circuit.analyses.filter(type => !analyses.some(analysis => analysis.type === type));
      return {
        status: 'unsupported',
        convergence: analyses.length > 0 ? 'converged' : 'not-run',
        analyses,
        error: missing.length > 0
          ? `no spice-ts result for analyses: ${missing.join(', ')}`
          : 'fixture declares no runnable analysis',
      };
    }
    return { status: 'success', convergence: 'converged', analyses };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: /unsupported|unknown|parse|expected|invalid/i.test(message) ? 'unsupported' : 'failed',
      convergence: /converg|singular|timestep/i.test(message) ? 'failed' : 'not-run',
      analyses: [],
      error: cleanError(message),
    };
  }
}

function commandVersion(command: string, args: string[], pattern: RegExp): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  const output = `${result.stdout}\n${result.stderr}`;
  return output.match(pattern)?.[0] ?? output.trim().split(/\r?\n/).find(Boolean) ?? 'unknown';
}

export function serializeClassicReport(report: ClassicReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const repoRoot = resolve('.');
const corpusRoot = resolve(repoRoot, 'benchmarks/corpus/classic');

async function createNativeReport(): Promise<ClassicReport> {
  const manifest = JSON.parse(await readFile(resolve(corpusRoot, 'manifest.json'), 'utf8')) as ClassicManifest;
  const corePackage = JSON.parse(await readFile(resolve(repoRoot, 'packages/core/package.json'), 'utf8')) as { version: string };
  return buildClassicReport(manifest, {
    readFixture: localPath => readFile(resolve(repoRoot, localPath)),
    runNgspice: runNativeNgspice,
    runSpiceTs: runNativeSpiceTs,
    tools: {
      ngspice: commandVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i),
      spiceTs: corePackage.version,
    },
  });
}

async function main(): Promise<void> {
  const report = await createNativeReport();
  const json = serializeClassicReport(report);
  const outputIndex = process.argv.indexOf('--output');
  const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !outputPath) throw new Error('--output requires a path');
  if (outputPath) await writeFile(resolve(outputPath), json);
  else if (!process.argv.includes('--check')) process.stdout.write(json);

  if (process.argv.includes('--check')) {
    const expected = await readFile(resolve(corpusRoot, 'report.json'), 'utf8');
    if (expected !== json) throw new Error('classic report differs; regenerate report.json and review the changed outcomes');
  }

  const { totals } = report;
  process.stderr.write(
    `classic corpus: ${totals.fixtures}; ngspice ${totals.ngspice.success}/${totals.fixtures} success; `
      + `spice-ts ${totals.spiceTs.success}/${totals.fixtures} success; ${totals.comparedAnalyses} analyses compared\n`,
  );
}

if (basename(process.argv[1] ?? '') === 'report.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
