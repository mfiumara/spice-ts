#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  runNativeNgspice,
  type ClassicCircuit,
} from '../../corpus/classic/report.js';

const FIXTURE_PATH = 'benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir';
const FIXTURE_SHA256 = 'de57231ef8879e785b07068db662bfa5ecfde8734011b88b09f319b826242e92';
const SIGNALS = ['i(vc)', 'i(vb)'] as const;
const RELATIVE_ZERO_THRESHOLD = 1e-15;

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return `${result.stdout}\n${result.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown';
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function metrics(actual: number[], reference: number[]) {
  if (actual.length !== reference.length) throw new Error('signal point counts differ');
  const absolute = actual.map((value, index) => Math.abs(value - reference[index]));
  const relative = absolute.flatMap((value, index) =>
    Math.abs(reference[index]) > RELATIVE_ZERO_THRESHOLD
      ? [value / Math.abs(reference[index])]
      : []);
  return {
    sampleCount: absolute.length,
    absoluteError: { max: Math.max(...absolute), rms: rms(absolute) },
    relativeError: {
      max: relative.length > 0 ? Math.max(...relative) : null,
      rms: relative.length > 0 ? rms(relative) : null,
      sampleCount: relative.length,
      excludedZeroReferences: absolute.length - relative.length,
      zeroThreshold: RELATIVE_ZERO_THRESHOLD,
    },
  };
}

function assertGrid(primary: number[], secondary: number[]): void {
  if (primary.length !== 707 || secondary.length !== 707) {
    throw new Error(`expected 707 nested DC points, got ${primary.length}/${secondary.length}`);
  }
  for (let outer = 0; outer < 7; outer += 1) {
    for (let inner = 0; inner < 101; inner += 1) {
      const index = outer * 101 + inner;
      const expectedPrimary = inner * 0.05;
      const expectedSecondary = 0.7 + outer * 0.05;
      if (Math.abs(primary[index] - expectedPrimary) > 1e-12
        || Math.abs(secondary[index] - expectedSecondary) > 1e-12) {
        throw new Error(`unexpected nested DC coordinate at index ${index}`);
      }
    }
  }
}

function withoutRuntime(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRuntime);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'runtimeMs')
      .map(([key, child]) => [key, withoutRuntime(child)]));
  }
  return value;
}

async function buildReport() {
  const input = await readFile(resolve(FIXTURE_PATH));
  const digest = sha256(input);
  if (digest !== FIXTURE_SHA256) throw new Error('fixture SHA-256 mismatch');
  const circuit: ClassicCircuit = {
    id: 'vbic-fo',
    category: 'op-dc',
    analyses: ['dc'],
    sourcePath: 'tests/vbic/FO.cir',
    sourceUrl: 'https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/vbic/FO.cir',
    localPath: FIXTURE_PATH,
    sha256: FIXTURE_SHA256,
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  };

  const ngspiceStart = performance.now();
  const ngspice = await runNativeNgspice(input, circuit);
  const ngspiceRuntimeMs = performance.now() - ngspiceStart;
  if (ngspice.status !== 'success' || ngspice.analyses.length !== 1) {
    throw new Error(`ngspice did not produce one successful analysis: ${ngspice.error ?? ngspice.status}`);
  }

  const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href);
  const spiceTsStart = performance.now();
  const spiceTsResult = await core.simulate(input.toString('utf8'));
  const spiceTsRuntimeMs = performance.now() - spiceTsStart;
  const dcSweep = spiceTsResult.dcSweep;
  if (!dcSweep?.secondarySweepValues) throw new Error('spice-ts omitted nested DC coordinates');
  const primary = Array.from(dcSweep.sweepValues) as number[];
  const secondary = Array.from(dcSweep.secondarySweepValues) as number[];
  assertGrid(primary, secondary);

  const ngspiceAnalysis = ngspice.analyses[0];
  if (ngspiceAnalysis.type !== 'dc' || ngspiceAnalysis.series.grid.length !== 707) {
    throw new Error('ngspice did not produce the required 707-point DC analysis');
  }
  for (let index = 0; index < primary.length; index += 1) {
    if (Math.abs(primary[index] - ngspiceAnalysis.series.grid[index]) > 1e-12) {
      throw new Error(`engine primary grids differ at index ${index}`);
    }
  }

  const comparisons: Record<string, ReturnType<typeof metrics>> = {};
  for (const signal of SIGNALS) {
    const reference = ngspiceAnalysis.series.signals[signal]?.map(value => value.re);
    if (!reference) throw new Error(`ngspice omitted ${signal}`);
    const source = signal === 'i(vc)' ? 'VC' : 'VB';
    const actual = Array.from(dcSweep.current(source)) as number[];
    if (!actual.every(Number.isFinite)) throw new Error(`spice-ts produced non-finite ${signal}`);
    comparisons[signal] = metrics(actual, reference);
  }

  const packageJson = JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')) as { version: string };
  return {
    schemaVersion: 'spice-ts-issue-352/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/352',
    tools: {
      ngspice: ngspiceVersion(),
      spiceTs: packageJson.version,
      node: process.version,
    },
    machine: {
      platform: platform(),
      architecture: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    commands: {
      generate: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-352/verify.ts --output benchmarks/results/issue-352/report.json',
      verify: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-352/verify.ts --check',
      ngspice: 'ngspice -b -r <temporary-rawfile> <byte-identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<byte-identical-fixture>)',
    },
    processBoundaries: {
      ngspice: 'One native ngspice subprocess with an isolated temporary HOME and ASCII rawfile.',
      spiceTs: 'One in-process @spice-ts/core simulate call in the verifier Node.js process.',
      timing: 'Single wall-clock observation per engine. Descriptive only, not a speed claim.',
    },
    input: {
      path: FIXTURE_PATH,
      bytes: input.byteLength,
      sha256: digest,
      identicalForBothEngines: true,
      adaptation: 'none',
      perCircuitToleranceTuning: false,
    },
    beforeSpiceTs: {
      status: 'unsupported',
      convergence: 'not-run',
      error: "Unsupported bounded BJT model parameter: 'IBEI'",
      evidenceCommit: '96eb20b',
    },
    supportedContract: {
      model: 'NPN LEVEL=4 only',
      analyses: ['op', 'dc'],
      activeParameters: [
        'IS', 'IBEI', 'IBEN', 'IBCI', 'IBCN', 'ISP',
        'RCX', 'RCI', 'RBX', 'RBI', 'RE', 'RS', 'RBP',
        'VEF', 'VER', 'IKF', 'IKR', 'IKP', 'VO', 'GAMM', 'HRCF', 'AVC1', 'AVC2',
      ],
      dcInertParameters: [
        'CJE', 'CJC', 'CJEP', 'CJCP', 'QCO', 'TF', 'TR', 'TD', 'ITF', 'XTF', 'RTH',
      ],
      equations: [
        'isothermal intrinsic forward/reverse transport with Early and high-current rolloff',
        'BE and BC ideal/non-ideal junction currents',
        'parasitic substrate transistor transport',
        'quasi-saturation collector resistance and avalanche multiplication',
        'explicit external and intrinsic series resistances',
      ],
      unsupported: [
        'PNP LEVEL=4 polarity',
        'VBIC model parameters outside the listed set',
        'AC, transient, noise, distortion, sensitivity, transfer-function, and pole-zero analyses',
        'self-heating, charge storage, and temperature-dependent equations',
      ],
    },
    grid: {
      analysis: 'dc',
      order: 'primary-fast Cartesian product',
      primary: { source: 'VC', start: 0, stop: 5, step: 0.05, pointsPerOuterStep: 101 },
      secondary: { source: 'VB', start: 0.7, stop: 1, step: 0.05, points: 7 },
      totalPoints: 707,
    },
    ngspice: {
      status: ngspice.status,
      convergence: ngspice.convergence,
      runtimeMs: ngspiceRuntimeMs,
      analyses: [{ type: 'dc', points: 707, comparedSignals: SIGNALS }],
    },
    spiceTs: {
      status: 'success',
      convergence: spiceTsResult.convergence?.dc?.failure === null ? 'converged' : 'failed',
      runtimeMs: spiceTsRuntimeMs,
      acceptedSolves: spiceTsResult.convergence?.dc?.acceptedSolves ?? null,
      rejectedSolves: spiceTsResult.convergence?.dc?.rejectedSolves ?? null,
      analyses: [{ type: 'dc', points: 707, comparedSignals: SIGNALS }],
    },
    comparisons,
    losses: [
      'This is a benchmark-bounded, nominal-temperature NPN VBIC DC subset, not broad VBIC support.',
      'Dynamic charge, self-heating, temperature dependence, PNP, and non-DC analyses remain unsupported.',
      'Runtime observations are single runs and do not support a performance claim.',
    ],
  };
}

async function main(): Promise<void> {
  const report = await buildReport();
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const path = process.argv[outputIndex + 1];
    if (!path) throw new Error('--output requires a path');
    await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${path}`);
    return;
  }
  if (process.argv.includes('--check')) {
    const committed = JSON.parse(await readFile(resolve('benchmarks/results/issue-352/report.json'), 'utf8'));
    if (JSON.stringify(withoutRuntime(committed)) !== JSON.stringify(withoutRuntime(report))) {
      throw new Error('issue-352 report deterministic fields are stale');
    }
    console.log('issue-352 report verified; deterministic fields match and runtime observations are finite');
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}

void main();
