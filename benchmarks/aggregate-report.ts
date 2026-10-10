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
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { basename, resolve } from 'node:path';
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

export interface AggregateReport {
  schemaVersion: typeof SCHEMA;
  outcomeSha256: string;
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
  };
  gapIssues: Array<{ url: string; scope: string }>;
  fixtures: FixtureReceipt[];
}

const GAP_ISSUES = [
  { url: 'https://github.com/mfiumara/spice-ts/issues/76', scope: 'parser syntax, directives, expressions, and unsupported device cards' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/75', scope: 'noise, pole-zero, and distortion analyses' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/7', scope: 'transmission-line devices' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/5', scope: 'BJT model coverage' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/3', scope: 'MOS model coverage' },
  { url: 'https://github.com/mfiumara/spice-ts/issues/123', scope: 'jimi-fuzz transient waveform divergence' },
] as const;

function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
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
  return [...issues];
}

async function timed(run: () => Promise<EngineExecution>): Promise<{ execution: EngineExecution; runtimeMs: number }> {
  const started = performance.now();
  const execution = await run();
  return { execution, runtimeMs: performance.now() - started };
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

export function validateAggregateAccounting(report: AggregateReport): void {
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
      const [ngspice, spiceTs] = await Promise.all([
        timed(() => runNativeNgspice(input, compatible)),
        timed(() => runNativeSpiceTs(input, compatible)),
      ]);
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
    },
    gapIssues: [...GAP_ISSUES],
    fixtures,
  };
  const report = { ...base, outcomeSha256: deterministicDigest(base) };
  validateAggregateAccounting(report);
  return report;
}

function markdown(report: AggregateReport): string {
  const { totals } = report;
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
    throw new Error('committed aggregate deterministic JSON projection differs from regenerated outcomes');
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

if (basename(process.argv[1] ?? '') === 'aggregate-report.ts') {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
