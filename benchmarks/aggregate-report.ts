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
  findMatchingAnalysis,
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
const FIXTURE_TREE_SHA256 = '00365c397b0ee279767f8167a9d3ee121bf186421cb684af30ef5e1bd44d83d7';
const SOURCES_SHA256 = '49379991e8f1f84c1289f78d50608fc7b6d1b3d3a8bcaed67320e5202213f2e5';

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
  headSha: 'ad7ba71b65848053afa7bc64ba22fd989ef89ca4',
  outcomeSha256: '68aa8e2e7b78b82f801da84cf5c88c489634d203f44bca5df9345a1946deddb9',
  totals: {
    fixtures: 100,
    corpusFixtures: { ngspice: 20, classic: 20, xyce: 20, 'corpus-d': 20, 'corpus-e': 20 },
    ngspice: { success: 52, failed: 9, unsupported: 39 },
    spiceTs: { success: 55, failed: 2, unsupported: 43 },
    comparedFixtures: 43,
    comparedAnalyses: 58,
    runtimeMs: { ngspice: 77_150.906, spiceTs: 270_491.926 },
  },
  matchedPointEnvelope: {
    comparedSignals: 878,
    relativeComparedSignals: 848,
    absoluteSamples: 9_182_709,
    relativeSamples: 9_147_783,
    excludedZeroReferences: 34_926,
    maximumAbsoluteError: 1169140310571.719,
    maximumAbsoluteRms: 1169140310571.719,
    maximumRelativeError: 45497356677842.63,
    maximumRelativeRms: 872317191517.6284,
  },
  statusTransitions: [
    {
      engine: 'spiceTs',
      fixture: 'classic/diode-distortion',
      from: 'failed',
      to: 'unsupported',
      explanation: 'Accepted bounded nonlinear diode distortion (#363, PR #367) removes the ideal-RLC-only .disto rejection, and simulate() now returns a 101-frequency distortion result for the unchanged fixture. The corpus harness does not map .disto results yet, so the row records no comparable disto analysis (#391). This is not a parity gain: no distortion error is measured or published until the harness maps the result.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/75', 'https://github.com/mfiumara/spice-ts/issues/391'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/vbic-fo',
      from: 'unsupported',
      to: 'success',
      explanation: 'Accepted bounded VBIC FO DC support (#352, PR #361) lets the unchanged nested DC sweep complete with 707 points, adding one DC comparison of 6 signals. With per-segment nested-DC alignment (#384, PR #394) 700 points align and 7 are excluded out of range; worst absolute max is 6.71e-6 A on i(vc) and 3.77e-6 A on i(vb), matching the #352 point-by-point verifier. Before #394 the same run reported a 0.3 V harness artifact on source-forced nodes (#401).',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/5', 'https://github.com/mfiumara/spice-ts/issues/352'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/vbic-common-emitter-ac',
      from: 'success',
      to: 'unsupported',
      explanation: 'Accepted grounded-substrate BJT model resolution (#382, PR #392) makes Q1 use its LEVEL=4 VBIC .model instead of silently running a default level-1 NPN, and bounded VBIC support (#361) rejects .ac and .pz. The previous success was not a VBIC simulation; its AC and pole-zero comparisons (including the 1169140310571.719 pole envelope) are removed, and the fixture is now a published unsupported loss.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/5', 'https://github.com/mfiumara/spice-ts/issues/75', 'https://github.com/mfiumara/spice-ts/issues/382'],
    },
    {
      engine: 'spiceTs',
      fixture: 'ngspice/hfet-inverter',
      from: 'unsupported',
      to: 'success',
      explanation: 'Accepted bounded NHFET level-5 support (#339, PR #360) accepts the Z cards, so the unchanged transient completes and adds one comparison. Published losses: v(4) absolute max 2.272 V (RMS 1.611 V) and v(3) 2.231 V (RMS 1.239 V); i(vdd) absolute max 0.00372 A.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/76', 'https://github.com/mfiumara/spice-ts/issues/339'],
    },
    ...['classic/bjt-noise', 'classic/resistor-noise'].map(fixture => ({
      engine: 'spiceTs' as const,
      fixture,
      from: 'unsupported' as const,
      to: 'success' as const,
      explanation: 'Accepted classic-corpus .noise mapping (#380, PR #383) compares the noise spectra and integrated totals spice-ts already produced, adding two noise analyses. Worst relative max is 4.9e-4 (bjt-noise onoise) and 1.7e-7 (resistor-noise). The change is in the harness, not the simulator.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/75', 'https://github.com/mfiumara/spice-ts/issues/380'],
    })),
    {
      engine: 'spiceTs',
      fixture: 'xyce/inductor-transient',
      from: 'failed',
      to: 'success',
      explanation: 'Accepted inductor-ringing step-loop termination (#366, PR #377) lets the unchanged transient finish inside the 120000 ms bound and adds one comparison. Published loss: v(1) and v(2) absolute max 31.65 V (RMS 8.27 V, relative max about 1.0), while i(l1) agrees to 2.4e-14 A.',
      gapIssues: ['https://github.com/mfiumara/spice-ts/issues/366'],
    },
  ],
  metricTransitions: [
    'Totals: ngspice unchanged at 52/9/39 success/failed/unsupported; spice-ts 55/2/43 to 59/0/41. Comparable coverage changes from 58 analyses across 43 fixtures to 63 across 47: ngspice/vbic-fo, ngspice/hfet-inverter and xyce/inductor-transient add one analysis each, classic/bjt-noise and classic/resistor-noise add two each, and ngspice/vbic-common-emitter-ac removes its AC and PZ analyses. Signals change from 878 to 894 absolute and from 848 to 865 relative. Samples change from 9,182,709 to 9,189,895 absolute and from 9,147,783 to 9,155,140 relative; excluded zero references change from 34,926 to 34,755.',
    'Nested DC sweeps are now aligned per segment (#384, PR #394). Worst per-signal absolute max: ngspice/jfet-vds-vgs 3 V v(1) to 3.10e-6 A i(vd); xyce/njfet-2109-dc 1.875 V v(2) to 1.47e-6 A; xyce/nmos-level1-dc 18 V v(4) to 0.000682 V v(2); xyce/pnp-dc 2 V v(4) to 0.00119 V v(3). The old values were harness artifacts, not simulator errors.',
    'Grounded-substrate BJT model resolution (#382, PR #392) changes three corpus-e fixtures. Gains: bjt-rtl-inverter-chain worst DC abs max 4.71 to 1.86 V and OP 0.194 to 0.119 V; bjt-diffpair-current-source worst AC abs max 90.1 to 83.9 V. Published losses: bjt-diffpair-transient and bjt-diffpair-current-source OP v(4)/v(5) abs 1.107 to 1.148 V and supply currents i(vcc)/i(vee) rel about 0.086 to 0.089 in OP and TRAN; bjt-diffpair-current-source AC v(3) abs max 0.0859 to 0.0997 V and TRAN v(4) rel max 68.1 to 348.7 (rel RMS 9.54 to 35.3) and v(5) rel max 43.8 to 97.5; bjt-rtl-inverter-chain DC i(vin) rel max 78.2 to 157.9 (rel RMS 17.9 to 35.1), TRAN i(vcc) abs max 0.00437 to 0.00457 A and v(2) rel max 1.13 to 1.21. Transient grids change from 198 to 191, 111 to 107 and 170 to 156 points.',
    'PULSE zero TR/TF now defaults to TSTEP like ngspice (#375, PR #379). xyce/rlc-transient worst absolute max falls from 10 V v(1) to 0.000752 V v(2) on 1018 instead of 1002 points; classic/mos-memory-cell from 22496.7 A i(vwb) to 9.91 V v(8) on 144 instead of 158 points (v(8) remains a 9.9 V loss); ngspice/ltra-line-transient from 2.499 V v(168) to 0.416 V v(3) on 665 instead of 685 points. Published losses: ltra-line-transient v(3) abs RMS +5.2% (0.04522 to 0.04755 V); mos-memory-cell i(vw) abs RMS +4.7%; classic/lossy-line-aluminium (3968 to 3969 points) raises abs RMS on 89 of 261 signals by at most 0.1% on non-negligible signals and v(x1.x1.x1.x1.x1.x1.x1.x1.4) rel max 2314.5 to 7220.6 at an unchanged 0.2614 V abs max. classic/lossy-line-24-inch and classic/coupled-lossy-lines change only at rounding level.',
    'Worst per-signal envelope: absolute max falls from 1169140310571.719 to 154.02408984579006 and absolute RMS from 1169140310571.719 to 66.59015057379884, now from classic/rca3040-wideband-amplifier AC v(15), only because the ngspice/vbic-common-emitter-ac pole comparison is no longer made. That is a coverage change, not an accuracy gain. Relative max 45497356677842.63 and RMS 872317191517.6284 from classic/coupled-lossy-lines v(5) are unchanged. No tolerance changed.',
    'Diode CJO aliasing (#365, PR #390) changed no aggregate outcome: the deterministic projection was identical before and after merging it.',
    'Transient step-control change from inductor-ringing termination (#366, PR #377), the only transient-engine change merged in the final window (none of these netlists has a diode, HFET or .noise card, so #405, #360 and #383 cannot affect them): xyce/rlc-transient worsens, with abs max 0.000752 to 0.00213 V on v(2) and 0.000251 to 0.000711 A on i(l1), abs RMS up on all 5 signals, 1018 to 1037 points. This is a published loss. ngspice/mos6-inverter-transient and classic/mos6-inverter-chain (3760 to 3777 points) lower abs RMS on 30 and raise it on 14 of 44 signals, with worst abs max 5.0044 V on v(43) essentially unchanged. ngspice/mos6-simple-inverter-transient (3438 to 3451 points) and corpus-e/mos1-inverter-sweep TRAN (111 to 113 points) change abs RMS by about 1% or less.',
    'Diode VJ/FC depletion-capacitance parity (#388, PR #405) changed no compared diode fixture metric in this run.',
    'The runtime sums in the totals above are single samples on a shared, heavily loaded host. No spice-ts run hit the 120000 ms bound in this run. They are not comparable with the previous 77150.906 / 270491.926 ms sample and support no speed claim.',
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
  { url: 'https://github.com/mfiumara/spice-ts/issues/391', scope: 'unmapped .disto results in the corpus harness' },
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
    const ngspiceAnalysis = findMatchingAnalysis(right.analyses, spiceAnalysis);
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
