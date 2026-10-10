#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate } from '../../../packages/core/src/index.js';
import {
  runNativeNgspice,
  type ClassicCircuit,
  type ClassicManifest,
  type EngineAnalysis,
} from '../../corpus/classic/report.js';

const fixtureIds = ['bjt-noise', 'resistor-noise'] as const;

void main();

async function main(): Promise<void> {
  const manifest = JSON.parse(
    readFileSync(resolve('benchmarks/corpus/classic/manifest.json'), 'utf8'),
  ) as ClassicManifest;
  const fixtures = [];

  for (const fixtureId of fixtureIds) {
    const circuit = manifest.circuits.find(candidate => candidate.id === fixtureId);
    if (!circuit) throw new Error(`missing classic fixture ${fixtureId}`);
    fixtures.push(await compareFixture(circuit));
  }

  const report = {
    schema: 'spice-ts-issue-336/v1',
    source: {
      name: manifest.source.name,
      revision: manifest.source.revision,
      licence: manifest.source.license,
      notice: 'benchmarks/corpus/classic/COPYRIGHT.txt',
      provenance: 'benchmarks/SOURCES.md',
    },
    policy: {
      fixtureAdaptation: 'none',
      identicalFixtureBytesForBothEngines: true,
      perCircuitToleranceTuning: false,
      superiorityClaim: false,
    },
    commands: {
      reproduce: 'pnpm exec tsx benchmarks/results/issue-336/compare.ts --output benchmarks/results/issue-336/report.json',
      ngspice: 'ngspice -b -r <temporary-raw-path> <unchanged-fixture>',
      spiceTs: '@spice-ts/core simulate(<unchanged-fixture>)',
    },
    versions: {
      ngspice: ngspiceVersion(),
      node: process.version,
      spiceTsRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      spiceTsWorkingTreeDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    },
    machine: {
      platform: platform(),
      release: release(),
      architecture: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    fixtures,
    losses: [
      'ngspice emits per-generator contribution summaries because points_per_summary=1; the spice-ts NoiseResult exposes only total output/input spectra and integrated totals, so only those four shared signals are compared.',
      'Every non-zero residual is retained. No tolerance, circuit value, or fixture byte is changed per engine.',
      'Runtime values are descriptive only. ngspice includes process startup and raw-file I/O; spice-ts runs in-process.',
      'Current-valued noise outputs, dependent-source input referral, differential semiconductor noise, stepped noise, and temperature cards remain outside this issue.',
    ],
    redReceipt: 'Before implementation, the focused unchanged-fixture test failed twice with Unsupported .noise form at bjtnoise.cir:15 and resnoise.cir:14.',
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--output requires a path');
    writeFileSync(resolve(outputPath), serialized);
  }
  process.stdout.write(serialized);
}

async function compareFixture(circuit: ClassicCircuit): Promise<object> {
  const input = readFileSync(resolve(circuit.localPath));
  const digest = createHash('sha256').update(input).digest('hex');
  if (digest !== circuit.sha256) {
    throw new Error(`${circuit.id}: fixture SHA-256 mismatch`);
  }

  const ngspiceStart = performance.now();
  const referenceExecution = await runNativeNgspice(input, circuit);
  const ngspiceRuntime = performance.now() - ngspiceStart;
  if (referenceExecution.status !== 'success') {
    throw new Error(`${circuit.id}: ngspice failed: ${referenceExecution.error ?? 'unknown error'}`);
  }

  const spiceTsStart = performance.now();
  const result = await simulate(input.toString('utf8'));
  const spiceTsRuntime = performance.now() - spiceTsStart;
  if (!result.noise) throw new Error(`${circuit.id}: spice-ts returned no noise result`);

  const spectral = requiredAnalysis(referenceExecution.analyses, 'Noise Spectral Density Curves');
  const integrated = requiredAnalysis(referenceExecution.analyses, 'Integrated Noise');
  const referenceOutput = realSignal(spectral, 'onoise_spectrum');
  const referenceInput = realSignal(spectral, 'inoise_spectrum');
  const referenceIntegratedOutput = realSignal(integrated, integratedSignal(integrated, 'onoise_total'));
  const referenceIntegratedInput = realSignal(integrated, integratedSignal(integrated, 'inoise_total'));
  const actualIntegratedOutput = required(result.noise.integratedOutputNoise, 'integrated output noise');
  const actualIntegratedInput = required(result.noise.integratedInputNoise, 'integrated input noise');

  return {
    id: circuit.id,
    fixture: circuit.localPath,
    input: {
      bytes: input.byteLength,
      sha256: digest,
      expectedSha256: circuit.sha256,
      unchanged: true,
      identicalForBothEngines: true,
    },
    parsedPointsPerSummary: 1,
    status: { ngspice: 'success', spiceTs: 'success' },
    points: {
      ngspiceSpectral: spectral.series.grid.length,
      ngspiceIntegrated: integrated.series.grid.length,
      spiceTsSpectral: result.noise.frequencies.length,
      spiceTsIntegrated: 1,
    },
    signals: {
      ngspiceSpectral: Object.keys(spectral.series.signals).sort(),
      ngspiceIntegrated: Object.keys(integrated.series.signals).sort(),
      spiceTs: ['inoise_spectrum', 'onoise_spectrum', 'inoise_total', 'onoise_total'],
      compared: ['frequency', 'inoise_spectrum', 'onoise_spectrum', 'inoise_total', 'onoise_total'],
    },
    errors: {
      frequency: metrics(result.noise.frequencies, spectral.series.grid),
      onoise_spectrum: metrics(result.noise.outputNoiseDensity, referenceOutput),
      inoise_spectrum: metrics(result.noise.inputNoiseDensity, referenceInput),
      onoise_total: metrics([actualIntegratedOutput], referenceIntegratedOutput),
      inoise_total: metrics([actualIntegratedInput], referenceIntegratedInput),
    },
    runtimeMilliseconds: {
      ngspiceProcessAndRawIo: ngspiceRuntime,
      spiceTsInProcess: spiceTsRuntime,
      directlyComparable: false,
    },
    losses: [
      `ngspice exposes ${Object.keys(spectral.series.signals).length - 2} per-generator spectral signals and ${Object.keys(integrated.series.signals).length - 2} per-generator integrated signals that spice-ts does not expose.`,
    ],
  };
}

function requiredAnalysis(analyses: EngineAnalysis[], plotName: string): EngineAnalysis {
  const analysis = analyses.find(candidate => candidate.plotName === plotName);
  if (!analysis) throw new Error(`ngspice returned no ${plotName} plot`);
  return analysis;
}

function realSignal(analysis: EngineAnalysis, signal: string): number[] {
  const values = analysis.series.signals[signal];
  if (!values) throw new Error(`ngspice plot ${analysis.plotName} has no ${signal}`);
  return values.map(value => value.re);
}

function integratedSignal(analysis: EngineAnalysis, suffix: string): string {
  const signal = Object.keys(analysis.series.signals).find(candidate => candidate.includes(`(${suffix})`));
  if (!signal) throw new Error(`ngspice integrated plot has no ${suffix}`);
  return signal;
}

function metrics(actual: number[], expected: number[]): object {
  if (actual.length !== expected.length) {
    throw new Error(`metric length mismatch: ${actual.length} vs ${expected.length}`);
  }
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((value, index) =>
    value / Math.max(Math.abs(expected[index]), Number.MIN_VALUE));
  return {
    maximumAbsoluteError: Math.max(...absolute),
    rmsAbsoluteError: Math.sqrt(absolute.reduce((sum, value) => sum + value * value, 0) / absolute.length),
    maximumRelativeError: Math.max(...relative),
    rmsRelativeError: Math.sqrt(relative.reduce((sum, value) => sum + value * value, 0) / relative.length),
  };
}

function required(value: number | undefined, label: string): number {
  if (value === undefined) throw new Error(`spice-ts returned no ${label}`);
  return value;
}

function ngspiceVersion(): string {
  const output = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
  return output.match(/ngspice-\d+(?:\.\d+)*/)?.[0] ?? 'unknown';
}
