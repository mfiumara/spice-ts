#!/usr/bin/env tsx
/**
 * Aggregate, identical-input parity report for the five public 20-circuit corpora.
 *
 * Usage:
 *   pnpm exec tsx benchmarks/aggregate-report.ts
 *   pnpm exec tsx benchmarks/aggregate-report.ts --check
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { alignAndMeasure, type ComparisonMetrics, type SampleSeries } from './comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicAnalysisType,
  type ClassicCircuit,
  type EngineExecution,
} from './corpus/classic/report.js';

const SCHEMA = 'spice-ts-aggregate-parity/v1' as const;
const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'] as const;
const FIXTURES_PER_CORPUS = 20;
const TOTAL_FIXTURES = CORPORA.length * FIXTURES_PER_CORPUS;
const JSON_PATH = resolve('benchmarks/aggregate-report.json');
const MARKDOWN_PATH = resolve('benchmarks/AGGREGATE_PARITY.md');
const FIXTURE_TREE_SHA256 = '01b19fe5baf170d91aa5bd72c3ffb3891ed2f2c45cca5adfee8288552a7e14f1';
const SOURCES_SHA256 = 'f8cc57771ac07684b1bdebb43ad2ab572f048a9e67d5df98386dc9eb706a188f';

type CorpusId = typeof CORPORA[number];
type Status = 'success' | 'failed' | 'unsupported';

interface ExpectedStatus {
  expectedStatus?: 'pass' | 'fail';
  failureKind?: string;
  reason?: string;
  status?: string;
}

interface CorpusCircuit extends Omit<ClassicCircuit, 'ngspice' | 'spiceTs'> {
  ngspice?: ExpectedStatus;
  spiceTs: ExpectedStatus;
}

interface CorpusManifest {
  source: { name: string; revision: string; license: string };
  circuits: CorpusCircuit[];
}

interface EngineReceipt {
  status: Status;
  convergence: EngineExecution['convergence'];
  runtimeMs: number;
  command: string[];
  inputSha256: string;
  analyses: Array<{ type: ClassicAnalysisType; points: number; signals: string[] }>;
  error?: string;
}

interface FixtureReceipt {
  key: string;
  corpus: CorpusId;
  id: string;
  category: string;
  declaredAnalyses: ClassicAnalysisType[];
  localPath: string;
  input: { bytes: number; sha256: string; identicalForBothEngines: true };
  ngspice: EngineReceipt;
  spiceTs: EngineReceipt;
  comparisons: Array<{ analysis: ClassicAnalysisType; signals: string[]; metrics: ComparisonMetrics }>;
  gapIssues: string[];
}

interface MatchedPointEnvelope {
  comparedSignals: number;
  relativeComparedSignals: number;
  absoluteSamples: number;
  relativeSamples: number;
  excludedZeroReferences: number;
  maximumAbsoluteError: number;
  maximumAbsoluteRms: number;
  maximumRelativeError: number | null;
  maximumRelativeRms: number | null;
}

interface StatusTransition {
  engine: 'ngspice' | 'spiceTs';
  fixture: string;
  from: Status;
  to: Status;
  explanation: string;
  gapIssues: string[];
}

export interface AggregateReport {
  schemaVersion: typeof SCHEMA;
  outcomeSha256: string;
  provenance: { fixtureTreeSha256: string; sourcesSha256: string };
  corpusSources: Array<{ id: CorpusId; name: string; revision: string; license: string; fixtureCount: number }>;
  environment: { platform: string; release: string; arch: string; cpu: string; node: string };
  tools: { spiceTs: string; ngspice: string; pnpm: string };
  commands: { generate: string; verify: string; ngspice: string; spiceTs: string };
  policy: {
    input: 'byte-identical fixture for both engines';
    fixtureAdaptation: 'none';
    perCircuitToleranceTuning: false;
    comparisonGrid: 'spice-ts';
    interpolation: 'linear';
    timing: 'single wall-clock execution per engine and fixture; descriptive, not a speed claim';
    deterministicHashExcludes: ['environment', 'runtimeMs', 'error'];
  };
  totals: {
    fixtures: number;
    corpusFixtures: Record<CorpusId, number>;
    ngspice: Record<Status, number>;
    spiceTs: Record<Status, number>;
    comparedFixtures: number;
    comparedAnalyses: number;
    runtimeMs: Record<'ngspice' | 'spiceTs', number>;
  };
  matchedPointEnvelope: MatchedPointEnvelope;
  comparisonToPrevious: {
    issueUrl: string;
    pullRequestUrl: string;
    headSha: string;
    outcomeSha256: string;
    totals: AggregateReport['totals'];
    matchedPointEnvelope: MatchedPointEnvelope;
    statusTransitions: StatusTransition[];
    metricTransitions: string[];
  };
  gapIssues: Array<{ url: string; scope: string }>;
  fixtures: FixtureReceipt[];
}

const PREVIOUS_REPORT: AggregateReport['comparisonToPrevious'] = {
  issueUrl: 'https://github.com/mfiumara/spice-ts/issues/321',
  pullRequestUrl: 'https://github.com/mfiumara/spice-ts/pull/325',
  headSha: 'e400d87c791dfa27f572a349777c8ebb9f2450d4',
  outcomeSha256: '26be9f80744c077c0bdb98fa5c6c9cffc8615c2e2589383507abd59fd6fed41b',
  totals: {
    fixtures: 100,
    corpusFixtures: { ngspice: 20, classic: 20, xyce: 20, 'corpus-d': 20, 'corpus-e': 20 },
    ngspice: { success: 52, failed: 9, unsupported: 39 },
    spiceTs: { success: 51, failed: 3, unsupported: 46 },
    comparedFixtures: 39,
    comparedAnalyses: 54,
    runtimeMs: { ngspice: 24_921.976, spiceTs: 21_912.135 },
  },
  matchedPointEnvelope: {
    comparedSignals: 561,
    relativeComparedSignals: 535,
    absoluteSamples: 7_959_622,
    relativeSamples: 7_944_908,
    excludedZeroReferences: 14_714,
    maximumAbsoluteError: 1169140310571.719,
    maximumAbsoluteRms: 1169140310571.719,
    maximumRelativeError: 2110199067.731876,
    maximumRelativeRms: 326930690.296368,
  },
  statusTransitions: [
    ...['ngspice/ltra-line-transient', 'classic/lossy-line-24-inch', 'classic/lossy-line-aluminium', 'classic/coupled-lossy-lines'].map(fixture => ({
      engine: 'spiceTs' as const,
      fixture,
      from: 'unsupported' as const,
      to: 'success' as const,
      explanation: 'Accepted benchmark-bounded lossy LTRA parsing and transient stamping (#308, PR #320) lets the unchanged fixture complete; every per-signal max/RMS error remains published.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/7', 'https://github.com/mfiumara/spice-ts/issues/308'],
    })),
    ...['ngspice/hfet-inverter', 'ngspice/mesa-oscillator'].map(fixture => ({
      engine: 'spiceTs' as const,
      fixture,
      from: 'failed' as const,
      to: 'unsupported' as const,
      explanation: 'Accepted subcircuit device validation (#338, PR #341) now rejects the unsupported Z or B card at parse time; the earlier singular-matrix failure no longer occurs, and the fixture remains a published loss.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/76', 'https://github.com/mfiumara/spice-ts/issues/338'],
    })),
    {
      engine: 'spiceTs',
      fixture: 'xyce/inductor-transient',
      from: 'unsupported',
      to: 'failed',
      explanation: 'Accepted disabled NEWBPSTEPPING TIMEINT compatibility (#322, PR #326) removes the parse rejection. The unchanged transient then never terminates, so the aggregate now bounds spice-ts at the same 120000 ms wall clock as ngspice and records a failed execution (#366).',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/322', 'https://github.com/mfiumara/spice-ts/issues/366'],
    },
  ],
  metricTransitions: [
    'Comparable coverage increased from 54 analyses across 39 fixtures to 58 analyses across 43 fixtures. The four LTRA fixtures add one transient comparison each.',
    'Two-source nested DC sweeps (#354, PR #359) now emit every nested point. ngspice/jfet-vds-vgs, xyce/njfet-2109-dc, xyce/nmos-level1-dc, and xyce/pnp-dc compare on the full nested grid with the same signal sets. corpus-e/diode-temperature-sweep emits 2 DC points instead of 3. It has no ngspice comparison.',
    'Matched coverage increased from 561 to 878 absolute signals and from 535 to 848 relative signals. Absolute samples increased from 7,959,622 to 9,182,709; relative samples increased from 7,944,908 to 9,147,783; excluded zero references increased from 14,714 to 34,926. The LTRA fixtures add 317 signals and 1,219,613 absolute samples; the nested DC grids add 3,474 absolute samples.',
    'The worst per-signal absolute max and RMS remain 1169140310571.719 from ngspice/vbic-common-emitter-ac. classic/coupled-lossy-lines v(5) raises the worst relative max from 2110199067.731876 to 45497356677842.63 and relative RMS from 326930690.296368 to 872317191517.6284. These are published losses: the relative metric divides by near-zero ngspice samples on that signal, whose absolute max is 1.4200318868351707 V. No tolerance changed.',
    'Status-preserving diagnostic changes: bounded TEMP LIST stepping (#318, PR #327) makes xyce/diode-level2-temperature-breakdown report a missing top-level transient result instead of a TEMP step error. The classic noise-interval fix (#336, PR #337) makes classic/bjt-noise and classic/resistor-noise report a missing noise result instead of a parse error. All three remain unsupported.',
    'spice-ts now runs in a child process bounded at the 120000 ms ngspice subprocess timeout. Its runtime is the child-measured adapter time, and the engines now run sequentially so neither receipt includes the other engine. Runtime sums are not comparable with the previous in-process sample and support no speed claim.',
  ],
};

const GAP_ISSUES = [
  { url: 'https://github.com/mfiumara/spice-ts/issues/76', scope: 'parser syntax, directives, expressions, and unsupported device cards' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/75', scope: 'noise, pole-zero, and distortion analyses' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/7', scope: 'transmission-line devices' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/5', scope: 'BJT model coverage' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/3', scope: 'MOS model coverage' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/123', scope: 'jimi-fuzz transient waveform divergence' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/280', scope: 'newly exposed classic-corpus execution failures and RCA3040 regression' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/366', scope: 'non-terminating xyce/inductor-transient simulation' },
] as const;

function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return paths.flat().sort();
}

async function provenance(): Promise<AggregateReport['provenance']> {
  const fixtureFiles = (await Promise.all(
    CORPORA.map(corpus => filesBelow(resolve(`benchmarks/corpus/${corpus}`))),
  )).flat().sort();
  const fixtureTree = createHash('sha256');
  for (const path of fixtureFiles) {
    fixtureTree.update(relative(resolve('.'), path));
    fixtureTree.update('\0');
    fixtureTree.update(await readFile(path));
    fixtureTree.update('\0');
  }
  return {
    fixtureTreeSha256: fixtureTree.digest('hex'),
    sourcesSha256: sha256(await readFile(resolve('benchmarks/SOURCES.md'))),
  };
}

function commandVersion(command: string, args: string[], pattern?: RegExp): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  const output = `${result.stdout}\n${result.stderr}`;
  return pattern?.exec(output)?.[0] ?? output.trim().split(/\r?\n/).find(Boolean) ?? 'unknown';
}

function normalizeStatus(execution: EngineExecution, expected?: ExpectedStatus): Status {
  if (execution.status === 'success') return 'success';
  if (execution.status === 'unsupported' || expected?.failureKind === 'unsupported') return 'unsupported';
  return 'failed';
}

function receipt(
  execution: EngineExecution,
  expected: ExpectedStatus | undefined,
  runtimeMs: number,
  command: string[],
  digest: string,
): EngineReceipt {
  const value: EngineReceipt = {
    status: normalizeStatus(execution, expected),
    convergence: execution.convergence,
    runtimeMs: Number(runtimeMs.toFixed(3)),
    command,
    inputSha256: digest,
    analyses: execution.analyses.map(analysis => ({
      type: analysis.type,
      points: analysis.series.grid.length,
      signals: Object.keys(analysis.series.signals).sort(),
    })).sort((left, right) => left.type.localeCompare(right.type)),
  };
  if (execution.error) value.error = execution.error;
  return value;
}

function commonSignals(left: SampleSeries, right: SampleSeries): string[] {
  return Object.keys(left.signals).filter(signal => right.signals[signal] !== undefined).sort();
}

function measureInChunks(spiceTs: SampleSeries, ngspice: SampleSeries, signals: string[]): ComparisonMetrics {
  const chunkSize = 25_000;
  const chunks = Array.from({ length: Math.ceil(spiceTs.grid.length / chunkSize) }, (_, index) => {
    const start = index * chunkSize;
    const end = start + chunkSize;
    return alignAndMeasure({
      grid: spiceTs.grid.slice(start, end),
      signals: Object.fromEntries(signals.map(signal => [signal, spiceTs.signals[signal].slice(start, end)])),
    }, ngspice, signals);
  });
  const comparedSignals: ComparisonMetrics['signals'] = {};
  for (const signal of signals) {
    const parts = chunks.map(chunk => chunk.signals[signal]);
    if (parts.some(part => part.status !== 'compared')) {
      comparedSignals[signal] = { status: 'missing', missingFrom: ['spice-ts'] };
      continue;
    }
    const values = parts.filter(part => part.status === 'compared');
    const absoluteCount = values.reduce((sum, value) => sum + value.sampleCount, 0);
    const relativeCount = values.reduce((sum, value) => sum + value.relativeError.sampleCount, 0);
    comparedSignals[signal] = {
      status: 'compared',
      sampleCount: absoluteCount,
      absoluteError: {
        max: Math.max(0, ...values.map(value => value.absoluteError.max)),
        rms: absoluteCount === 0 ? 0 : Math.sqrt(values.reduce(
          (sum, value) => sum + value.absoluteError.rms ** 2 * value.sampleCount,
          0,
        ) / absoluteCount),
      },
      relativeError: {
        max: relativeCount === 0 ? null : Math.max(...values.flatMap(value => value.relativeError.max === null ? [] : [value.relativeError.max])),
        rms: relativeCount === 0 ? null : Math.sqrt(values.reduce(
          (sum, value) => sum + (value.relativeError.rms ?? 0) ** 2 * value.relativeError.sampleCount,
          0,
        ) / relativeCount),
        sampleCount: relativeCount,
        excludedZeroReferences: values.reduce((sum, value) => sum + value.relativeError.excludedZeroReferences, 0),
      },
    };
  }
  return {
    grid: {
      spiceTsPoints: spiceTs.grid.length,
      ngspicePoints: ngspice.grid.length,
      alignedPoints: chunks.reduce((sum, chunk) => sum + chunk.grid.alignedPoints, 0),
      excludedOutOfRange: chunks.reduce((sum, chunk) => sum + chunk.grid.excludedOutOfRange, 0),
    },
    signals: comparedSignals,
  };
}

function compare(left: EngineExecution, right: EngineExecution): FixtureReceipt['comparisons'] {
  const comparisons: FixtureReceipt['comparisons'] = [];
  for (const spiceAnalysis of left.analyses) {
    const ngspiceAnalysis = right.analyses.find(candidate => candidate.type === spiceAnalysis.type);
    if (!ngspiceAnalysis) continue;
    const signals = commonSignals(spiceAnalysis.series, ngspiceAnalysis.series);
    if (signals.length === 0) continue;
    comparisons.push({
      analysis: spiceAnalysis.type,
      signals,
      metrics: measureInChunks(spiceAnalysis.series, ngspiceAnalysis.series, signals),
    });
  }
  return comparisons.sort((a, b) => a.analysis.localeCompare(b.analysis));
}

function gapIssues(circuit: CorpusCircuit): string[] {
  const text = `${circuit.category} ${circuit.analyses.join(' ')} ${circuit.spiceTs.reason ?? ''}`.toLowerCase();
  const issues = new Set<string>(['https://github.com/mfiumara/spice-ts/issues/76']);
  if (/noise|pole|pz|disto/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/75');
  if (/transmission|lossy|ltra/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/7');
  if (/bjt|vbic|npn|pnp/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/5');
  if (/mos|bsim/.test(text)) issues.add('https://github.com/mfiumara/spice-ts/issues/3');
  if (circuit.id === 'jimi-fuzz') issues.add('https://github.com/mfiumara/spice-ts/issues/123');
  if (circuit.localPath.endsWith('/INDUCTOR/inductor.cir')) issues.add('https://github.com/mfiumara/spice-ts/issues/366');
  if (['mos6-inverter-chain', 'mos-amplifier', 'mos-memory-cell', 'rca3040-wideband-amplifier'].includes(circuit.id)) {
    issues.add('https://github.com/mfiumara/spice-ts/issues/280');
  }
  return [...issues];
}

async function timed(run: () => Promise<EngineExecution>): Promise<{ execution: EngineExecution; runtimeMs: number }> {
  const started = performance.now();
  const execution = await run();
  return { execution, runtimeMs: performance.now() - started };
}

/** Same wall-clock bound the classic runner applies to every ngspice subprocess. */
export const SPICE_TS_TIMEOUT_MS = 120_000;
const SPICE_TS_CHILD_FLAG = '--spice-ts-child';

/**
 * Runs the in-process spice-ts adapter inside a child process so a non-terminating
 * simulation is recorded as a failed execution instead of stalling the aggregate.
 * The child reports its own adapter runtime; v8 serialization preserves typed arrays
 * and non-finite samples exactly.
 */
export async function runBoundedSpiceTs(
  input: Buffer,
  circuit: ClassicCircuit,
  timeoutMs: number,
): Promise<{ execution: EngineExecution; runtimeMs: number }> {
  const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-aggregate-'));
  const inputPath = resolve(directory, 'fixture.cir');
  const circuitPath = resolve(directory, 'circuit.json');
  const outputPath = resolve(directory, 'execution.v8');
  const started = performance.now();
  try {
    await writeFile(inputPath, input);
    await writeFile(circuitPath, JSON.stringify(circuit));
    const completed = spawnSync(
      process.execPath,
      [...process.execArgv, fileURLToPath(import.meta.url), SPICE_TS_CHILD_FLAG, inputPath, circuitPath, outputPath],
      { cwd: process.cwd(), encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 },
    );
    if (completed.error || completed.status !== 0) {
      const timedOut = (completed.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
      const detail = timedOut
        ? `spice-ts exceeded the ${timeoutMs} ms aggregate execution bound`
        : completed.error?.message || [completed.stderr, completed.stdout].filter(Boolean).join('\n').trim()
          || `spice-ts child exited ${completed.status}`;
      return {
        execution: { status: 'failed', convergence: timedOut ? 'failed' : 'not-run', analyses: [], error: detail.slice(0, 1000) },
        runtimeMs: performance.now() - started,
      };
    }
    return deserialize(await readFile(outputPath)) as { execution: EngineExecution; runtimeMs: number };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function spiceTsChild(inputPath: string, circuitPath: string, outputPath: string): Promise<void> {
  const input = await readFile(inputPath);
  const circuit = JSON.parse(await readFile(circuitPath, 'utf8')) as ClassicCircuit;
  await writeFile(outputPath, serialize(await timed(() => runNativeSpiceTs(input, circuit))));
}

function deterministicView(report: Omit<AggregateReport, 'outcomeSha256'> | AggregateReport): unknown {
  return JSON.parse(JSON.stringify(
    report,
    (key, value) => key === 'outcomeSha256' || key === 'environment' || key === 'runtimeMs' || key === 'error'
      ? undefined
      : value,
  ));
}

function deterministicDigest(report: Omit<AggregateReport, 'outcomeSha256'> | AggregateReport): string {
  return sha256(`${JSON.stringify(deterministicView(report))}\n`);
}

function countStatuses(fixtures: FixtureReceipt[], engine: 'ngspice' | 'spiceTs'): Record<Status, number> {
  const totals: Record<Status, number> = { success: 0, failed: 0, unsupported: 0 };
  for (const fixture of fixtures) totals[fixture[engine].status] += 1;
  return totals;
}

function runtimeSums(fixtures: FixtureReceipt[]): AggregateReport['totals']['runtimeMs'] {
  const sum = (engine: 'ngspice' | 'spiceTs') => Number(fixtures
    .reduce((total, fixture) => total + fixture[engine].runtimeMs, 0)
    .toFixed(3));
  return { ngspice: sum('ngspice'), spiceTs: sum('spiceTs') };
}

export function matchedPointEnvelope(fixtures: FixtureReceipt[]): MatchedPointEnvelope {
  const compared = fixtures.flatMap(fixture => fixture.comparisons.flatMap(comparison =>
    Object.values(comparison.metrics.signals).filter(signal => signal.status === 'compared'),
  ));
  const relative = compared.filter(signal => signal.relativeError.max !== null);
  return {
    comparedSignals: compared.length,
    relativeComparedSignals: relative.length,
    absoluteSamples: compared.reduce((sum, signal) => sum + signal.sampleCount, 0),
    relativeSamples: compared.reduce((sum, signal) => sum + signal.relativeError.sampleCount, 0),
    excludedZeroReferences: compared.reduce((sum, signal) => sum + signal.relativeError.excludedZeroReferences, 0),
    maximumAbsoluteError: Math.max(0, ...compared.map(signal => signal.absoluteError.max)),
    maximumAbsoluteRms: Math.max(0, ...compared.map(signal => signal.absoluteError.rms)),
    maximumRelativeError: relative.length === 0 ? null : Math.max(...relative.map(signal => signal.relativeError.max as number)),
    maximumRelativeRms: relative.length === 0 ? null : Math.max(...relative.map(signal => signal.relativeError.rms as number)),
  };
}

export function validateAggregateAccounting(report: AggregateReport): void {
  if (
    report.provenance.fixtureTreeSha256 !== FIXTURE_TREE_SHA256
    || report.provenance.sourcesSha256 !== SOURCES_SHA256
  ) {
    throw new Error(
      `aggregate provenance changed: fixture tree ${report.provenance.fixtureTreeSha256}; sources ${report.provenance.sourcesSha256}`,
    );
  }
  if (report.fixtures.length !== TOTAL_FIXTURES || report.totals.fixtures !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} fixtures`);
  }

  if (new Set(report.fixtures.map(fixture => fixture.key)).size !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} unique fixture keys`);
  }
  if (new Set(report.fixtures.map(fixture => fixture.localPath)).size !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} unique local paths`);
  }
  if (new Set(report.fixtures.map(fixture => fixture.input.sha256)).size !== TOTAL_FIXTURES) {
    throw new Error(`aggregate accounting must contain ${TOTAL_FIXTURES} unique input hashes`);
  }

  for (const corpus of CORPORA) {
    const actual = report.fixtures.filter(fixture => fixture.corpus === corpus).length;
    if (actual !== FIXTURES_PER_CORPUS || report.totals.corpusFixtures[corpus] !== actual) {
      throw new Error(`${corpus}: aggregate accounting must contain ${FIXTURES_PER_CORPUS} fixtures`);
    }
  }
  if (report.corpusSources.length !== CORPORA.length) {
    throw new Error(`aggregate accounting must retain ${CORPORA.length} corpus sources`);
  }

  for (const fixture of report.fixtures) {
    if (
      fixture.input.identicalForBothEngines !== true
      || fixture.ngspice.inputSha256 !== fixture.input.sha256
      || fixture.spiceTs.inputSha256 !== fixture.input.sha256
    ) {
      throw new Error(`${fixture.key}: engine input hashes must match the byte-identical fixture`);
    }
  }

  for (const engine of ['ngspice', 'spiceTs'] as const) {
    const statuses = report.totals[engine];
    if (statuses.success + statuses.failed + statuses.unsupported !== TOTAL_FIXTURES) {
      throw new Error(`${engine} outcomes must reconcile to ${TOTAL_FIXTURES} fixtures`);
    }
    if (JSON.stringify(statuses) !== JSON.stringify(countStatuses(report.fixtures, engine))) {
      throw new Error(`${engine} outcome totals differ from per-fixture outcomes`);
    }
  }

  const comparedFixtures = report.fixtures.filter(fixture => fixture.comparisons.length > 0).length;
  const comparedAnalyses = report.fixtures.reduce((sum, fixture) => sum + fixture.comparisons.length, 0);
  if (report.totals.comparedFixtures !== comparedFixtures || report.totals.comparedAnalyses !== comparedAnalyses) {
    throw new Error('comparison totals differ from per-fixture error availability');
  }
  if (JSON.stringify(report.totals.runtimeMs) !== JSON.stringify(runtimeSums(report.fixtures))) {
    throw new Error('runtime sums differ from per-fixture receipts');
  }
  if (JSON.stringify(report.matchedPointEnvelope) !== JSON.stringify(matchedPointEnvelope(report.fixtures))) {
    throw new Error('matched-point envelope differs from per-signal metrics');
  }
  for (const transition of report.comparisonToPrevious.statusTransitions) {
    const fixture = report.fixtures.find(candidate => candidate.key === transition.fixture);
    if (!fixture || fixture[transition.engine].status !== transition.to || transition.explanation.length === 0) {
      throw new Error(`${transition.engine}/${transition.fixture}: invalid or unexplained status transition`);
    }
  }
}

export async function buildAggregateReport(): Promise<AggregateReport> {
  const fixtures: FixtureReceipt[] = [];
  const corpusSources: AggregateReport['corpusSources'] = [];

  for (const corpus of CORPORA) {
    const manifest = JSON.parse(
      await readFile(resolve(`benchmarks/corpus/${corpus}/manifest.json`), 'utf8'),
    ) as CorpusManifest;
    if (manifest.circuits.length !== FIXTURES_PER_CORPUS) {
      throw new Error(`${corpus}: expected ${FIXTURES_PER_CORPUS} fixtures, found ${manifest.circuits.length}`);
    }
    corpusSources.push({ id: corpus, ...manifest.source, fixtureCount: manifest.circuits.length });

    for (const circuit of manifest.circuits) {
      const input = await readFile(resolve(circuit.localPath));
      const digest = sha256(input);
      if (digest !== circuit.sha256) throw new Error(`${corpus}/${circuit.id}: fixture SHA-256 mismatch`);
      const compatible = circuit as ClassicCircuit;
      const ngspice = await timed(() => runNativeNgspice(input, compatible));
      const spiceTs = await runBoundedSpiceTs(input, compatible, SPICE_TS_TIMEOUT_MS);
      fixtures.push({
        key: `${corpus}/${circuit.id}`,
        corpus,
        id: circuit.id,
        category: circuit.category,
        declaredAnalyses: circuit.analyses,
        localPath: circuit.localPath,
        input: { bytes: input.byteLength, sha256: digest, identicalForBothEngines: true },
        ngspice: receipt(ngspice.execution, circuit.ngspice, ngspice.runtimeMs, ['ngspice', '-b', '-r', '<raw>', '<identical-fixture>'], digest),
        spiceTs: receipt(spiceTs.execution, circuit.spiceTs, spiceTs.runtimeMs, ['@spice-ts/core', 'simulate', '<identical-fixture>'], digest),
        comparisons: compare(spiceTs.execution, ngspice.execution),
        gapIssues: gapIssues(circuit),
      });
    }
  }

  const corpusFixtures = Object.fromEntries(CORPORA.map(corpus => [corpus, fixtures.filter(fixture => fixture.corpus === corpus).length])) as Record<CorpusId, number>;
  const base: Omit<AggregateReport, 'outcomeSha256'> = {
    schemaVersion: SCHEMA,
    provenance: await provenance(),
    corpusSources,
    environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown', node: process.version },
    tools: {
      spiceTs: (JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')) as { version: string }).version,
      ngspice: commandVersion('ngspice', ['--version'], /ngspice-\d+(?:\.\d+)*/i),
      pnpm: commandVersion('pnpm', ['--version']),
    },
    commands: {
      generate: 'pnpm exec tsx benchmarks/aggregate-report.ts',
      verify: 'pnpm exec tsx benchmarks/aggregate-report.ts --check',
      ngspice: 'ngspice -b -r <raw> <identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<identical-fixture>)',
    },
    policy: {
      input: 'byte-identical fixture for both engines',
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
      timing: 'single wall-clock execution per engine and fixture; descriptive, not a speed claim',
      deterministicHashExcludes: ['environment', 'runtimeMs', 'error'],
    },
    totals: {
      fixtures: fixtures.length,
      corpusFixtures,
      ngspice: countStatuses(fixtures, 'ngspice'),
      spiceTs: countStatuses(fixtures, 'spiceTs'),
      comparedFixtures: fixtures.filter(fixture => fixture.comparisons.length > 0).length,
      comparedAnalyses: fixtures.reduce((sum, fixture) => sum + fixture.comparisons.length, 0),
      runtimeMs: runtimeSums(fixtures),
    },
    matchedPointEnvelope: matchedPointEnvelope(fixtures),
    comparisonToPrevious: PREVIOUS_REPORT,
    gapIssues: [...GAP_ISSUES],
    fixtures,
  };
  const report = { ...base, outcomeSha256: deterministicDigest(base) };
  validateAggregateAccounting(report);
  return report;
}

function markdown(report: AggregateReport): string {
  const { totals } = report;
  const { matchedPointEnvelope: envelope, comparisonToPrevious: previous } = report;
  const issueNumber = previous.issueUrl.split('/').at(-1);
  const pullRequestNumber = previous.pullRequestUrl.split('/').at(-1);
  const transitionLines = previous.statusTransitions.length === 0
    ? ['- Status transitions: none. Both engines retained every prior success, failure, and unsupported classification.']
    : previous.statusTransitions.map(transition => `- ${transition.engine} \`${transition.fixture}\`: ${transition.from} → ${transition.to}. ${transition.explanation}`);
  const lines = [
    '# Aggregate 100-circuit parity report',
    '',
    'This report publishes all outcomes, including failures and unsupported cases. It makes no speed or superiority claim.',
    '',
    '## Reproduction',
    '',
    `- Generate: \`${report.commands.generate}\``,
    `- Verify committed outcomes: \`${report.commands.verify}\``,
    `- Machine: ${report.environment.cpu}; ${report.environment.platform} ${report.environment.release} ${report.environment.arch}; Node ${report.environment.node}`,
    `- Tools: spice-ts ${report.tools.spiceTs}; ${report.tools.ngspice}; pnpm ${report.tools.pnpm}`,
    `- Deterministic outcome SHA-256 (host, timings, and error text excluded): \`${report.outcomeSha256}\``,
    `- Aggregate fixture-tree SHA-256: \`${report.provenance.fixtureTreeSha256}\`.`,
    `- Source catalogue SHA-256: \`${report.provenance.sourcesSha256}\`.`,
    '- Runtime is one wall-clock sample per engine/fixture. Treat it as diagnostic data, not a performance comparison.',
    '',
    '## Policy and totals',
    '',
    '- Both engines receive the exact same fixture bytes; each row records the common SHA-256.',
    '- No fixture adaptation and no per-circuit tolerance tuning.',
    `- Accounted fixtures: ${totals.fixtures} (${CORPORA.map(corpus => `${corpus}=${totals.corpusFixtures[corpus]}`).join(', ')}).`,
    `- ngspice: ${totals.ngspice.success} success, ${totals.ngspice.failed} failed, ${totals.ngspice.unsupported} unsupported.`,
    `- spice-ts: ${totals.spiceTs.success} success, ${totals.spiceTs.failed} failed, ${totals.spiceTs.unsupported} unsupported.`,
    `- Matched-point errors: ${totals.comparedAnalyses} analyses across ${totals.comparedFixtures} fixtures. Full per-signal max/RMS absolute and relative errors are in \`benchmarks/aggregate-report.json\`.`,
    `- Matched signals: ${envelope.comparedSignals} absolute (${envelope.absoluteSamples} samples); ${envelope.relativeComparedSignals} relative (${envelope.relativeSamples} samples, ${envelope.excludedZeroReferences} zero references excluded).`,
    `- Matched-point envelope (worst per signal): absolute max ${envelope.maximumAbsoluteError}, absolute RMS ${envelope.maximumAbsoluteRms}, relative max ${envelope.maximumRelativeError}, relative RMS ${envelope.maximumRelativeRms}.`,
    `- Descriptive single-run runtime sums: ngspice ${totals.runtimeMs.ngspice.toFixed(3)} ms; spice-ts ${totals.runtimeMs.spiceTs.toFixed(3)} ms.`,
    '',
    '## Transition from the previous accepted report',
    '',
    `- Baseline: [issue #${issueNumber}](${previous.issueUrl}), [PR #${pullRequestNumber}](${previous.pullRequestUrl}), head \`${previous.headSha}\`, outcome \`${previous.outcomeSha256}\`.`,
    `- Previous totals: ngspice ${previous.totals.ngspice.success}/${previous.totals.ngspice.failed}/${previous.totals.ngspice.unsupported} success/failed/unsupported; spice-ts ${previous.totals.spiceTs.success}/${previous.totals.spiceTs.failed}/${previous.totals.spiceTs.unsupported}; ${previous.totals.comparedAnalyses} analyses across ${previous.totals.comparedFixtures} fixtures.`,
    `- Previous matched-point envelope: absolute max ${previous.matchedPointEnvelope.maximumAbsoluteError}, absolute RMS ${previous.matchedPointEnvelope.maximumAbsoluteRms}, relative max ${previous.matchedPointEnvelope.maximumRelativeError}, relative RMS ${previous.matchedPointEnvelope.maximumRelativeRms}.`,
    ...transitionLines,
    ...previous.metricTransitions.map(transition => `- ${transition}`),
    '',
    '## Gap tracking',
    '',
    ...report.gapIssues.map(issue => `- ${issue.url} — ${issue.scope}`),
    '',
    '## Per-circuit outcomes',
    '',
    '| Fixture | Analyses | ngspice | spice-ts | Runtime ms (ng/spice-ts) | Compared analyses | Gap issues |',
    '|---|---|---|---|---:|---:|---|',
    ...report.fixtures.map(fixture => {
      const gaps = fixture.gapIssues.map(url => `[#${url.split('/').at(-1)}](${url})`).join(', ');
      return `| ${fixture.key} | ${fixture.declaredAnalyses.join(', ') || 'none'} | ${fixture.ngspice.status}/${fixture.ngspice.convergence} | ${fixture.spiceTs.status}/${fixture.spiceTs.convergence} | ${fixture.ngspice.runtimeMs}/${fixture.spiceTs.runtimeMs} | ${fixture.comparisons.length} | ${gaps} |`;
    }),
    '',
    'Every unsupported or failed spice-ts row is a published loss. Engine error strings, input hashes, commands, signal lists, point counts, and matched-point metrics are retained in the JSON report.',
    '',
  ];
  return lines.join('\n');
}

function stableReport(report: AggregateReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function verifyCommittedArtifacts(
  generated: AggregateReport,
  committedJson: string,
  committedMarkdown: string,
): void {
  let committed: AggregateReport;
  try {
    committed = JSON.parse(committedJson) as AggregateReport;
  } catch (error) {
    throw new Error(`committed aggregate JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const committedProjection = JSON.stringify(deterministicView(committed));
  const generatedProjection = JSON.stringify(deterministicView(generated));
  if (committedProjection !== generatedProjection) {
    const committedByKey = new Map((committed.fixtures ?? []).map(fixture => [fixture.key, fixture]));
    const differing = (generated.fixtures ?? []).flatMap(fixture => {
      const previous = committedByKey.get(fixture.key);
      if (previous && JSON.stringify(deterministicView(previous as never)) === JSON.stringify(deterministicView(fixture as never))) return [];
      return [`${fixture.key} (spice-ts ${previous?.spiceTs.status ?? 'missing'} -> ${fixture.spiceTs.status}; ngspice ${previous?.ngspice.status ?? 'missing'} -> ${fixture.ngspice.status})`];
    });
    throw new Error(`committed aggregate deterministic JSON projection differs from regenerated outcomes; differing fixtures: ${differing.join(', ') || 'none'}`);
  }

  const digest = deterministicDigest(committed);
  if (committed.outcomeSha256 !== digest || generated.outcomeSha256 !== digest) {
    throw new Error(`aggregate deterministic JSON projection hash mismatch: committed=${committed.outcomeSha256}; regenerated=${generated.outcomeSha256}; calculated=${digest}`);
  }

  validateAggregateAccounting(committed);

  if (committedMarkdown !== markdown(committed)) {
    throw new Error('committed aggregate Markdown differs from the committed JSON projection');
  }
}

async function main(): Promise<void> {
  const report = await buildAggregateReport();
  const json = stableReport(report);
  const md = markdown(report);
  if (process.argv.includes('--check')) {
    const [committedJson, committedMarkdown] = await Promise.all([
      readFile(JSON_PATH, 'utf8'),
      readFile(MARKDOWN_PATH, 'utf8'),
    ]);
    verifyCommittedArtifacts(report, committedJson, committedMarkdown);
  } else {
    await writeFile(JSON_PATH, json);
    await writeFile(MARKDOWN_PATH, md);
  }
  process.stderr.write(`aggregate: ${report.totals.fixtures} fixtures; outcome ${report.outcomeSha256}; compared ${report.totals.comparedAnalyses} analyses\n`);
}

if (process.argv[2] === SPICE_TS_CHILD_FLAG) {
  const [inputPath, circuitPath, outputPath] = process.argv.slice(3);
  spiceTsChild(inputPath, circuitPath, outputPath).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (basename(process.argv[1] ?? '') === 'aggregate-report.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
