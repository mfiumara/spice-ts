#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { alignAndMeasure, type ComparisonMetrics, type SampleSeries } from './comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
} from './corpus/classic/report.js';

const FIXTURE_PATH = 'benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir';
const EXPECTED_BYTES = 1_009;
const EXPECTED_SHA256 = '0607c7f358628d0ce60eff584b329a4d685ae215894c466622a19357c7163b0e';

function measureInChunks(
  spiceTs: SampleSeries,
  ngspice: SampleSeries,
  signals: string[],
): ComparisonMetrics {
  const chunkSize = 10_000;
  const chunks = Array.from({ length: Math.ceil(spiceTs.grid.length / chunkSize) }, (_, index) => {
    const start = index * chunkSize;
    const end = start + chunkSize;
    return alignAndMeasure({
      grid: spiceTs.grid.slice(start, end),
      signals: Object.fromEntries(
        signals.map(signal => [signal, spiceTs.signals[signal].slice(start, end)]),
      ),
    }, ngspice, signals);
  });
  const comparedSignals: ComparisonMetrics['signals'] = {};
  for (const signal of signals) {
    const values = chunks
      .map(chunk => chunk.signals[signal])
      .filter(part => part.status === 'compared');
    const absoluteCount = values.reduce((sum, value) => sum + value.sampleCount, 0);
    const relativeCount = values.reduce(
      (sum, value) => sum + value.relativeError.sampleCount,
      0,
    );
    comparedSignals[signal] = {
      status: 'compared',
      sampleCount: absoluteCount,
      absoluteError: {
        max: Math.max(0, ...values.map(value => value.absoluteError.max)),
        rms: Math.sqrt(values.reduce(
          (sum, value) => sum + value.absoluteError.rms ** 2 * value.sampleCount,
          0,
        ) / absoluteCount),
      },
      relativeError: {
        max: relativeCount === 0
          ? null
          : Math.max(...values.flatMap(value =>
            value.relativeError.max === null ? [] : [value.relativeError.max])),
        rms: relativeCount === 0
          ? null
          : Math.sqrt(values.reduce(
            (sum, value) => sum
              + (value.relativeError.rms ?? 0) ** 2 * value.relativeError.sampleCount,
            0,
          ) / relativeCount),
        sampleCount: relativeCount,
        excludedZeroReferences: values.reduce(
          (sum, value) => sum + value.relativeError.excludedZeroReferences,
          0,
        ),
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

async function main(): Promise<void> {
  const input = readFileSync(resolve(FIXTURE_PATH));
  const digest = createHash('sha256').update(input).digest('hex');
  if (input.byteLength !== EXPECTED_BYTES || digest !== EXPECTED_SHA256) {
    throw new Error(`jimi-fuzz fixture identity changed: ${input.byteLength} bytes, ${digest}`);
  }
  const circuit: ClassicCircuit = {
    id: 'jimi-fuzz',
    category: 'nonlinear',
    analyses: ['op', 'tran'],
    sourcePath: 'examples/wave/jimi_fuzz.cir',
    sourceUrl: 'https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/examples/wave/jimi_fuzz.cir',
    localPath: FIXTURE_PATH,
    sha256: digest,
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  };
  const ngStarted = performance.now();
  const ngspice = await runNativeNgspice(input, circuit);
  const ngRuntimeMs = performance.now() - ngStarted;
  const spiceStarted = performance.now();
  const spiceTs = await runNativeSpiceTs(input, circuit);
  const spiceRuntimeMs = performance.now() - spiceStarted;
  if (ngspice.status !== 'success' || spiceTs.status !== 'success') {
    throw new Error(JSON.stringify({ ngspice, spiceTs }));
  }
  const comparisons = spiceTs.analyses.map(left => {
    const right = ngspice.analyses.find(candidate => candidate.type === left.type);
    if (!right) throw new Error(`ngspice result is missing ${left.type}`);
    const signals = Object.keys(left.series.signals)
      .filter(signal => right.series.signals[signal] !== undefined)
      .sort();
    return { analysis: left.type, signals, metrics: measureInChunks(left.series, right.series, signals) };
  });
  const reportBase = {
    schemaVersion: 'spice-ts-issue-146/v1',
    input: {
      path: FIXTURE_PATH,
      bytes: input.byteLength,
      sha256: digest,
      identicalForBothEngines: true,
    },
    tools: {
      ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' })
        .match(/ngspice-\d+/i)?.[0] ?? 'unknown',
      spiceTs: 'workspace',
      node: process.version,
    },
    commands: {
      report: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/issue-146-jimi-fuzz.ts --output benchmarks/results/issue-146/jimi-fuzz-after.json',
      ngspice: 'ngspice -b -r <temporary-rawfile> <byte-identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<byte-identical-fixture>)',
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
      relativeZeroThreshold: 1e-15,
    },
    runtimeMs: { ngspice: ngRuntimeMs, spiceTs: spiceRuntimeMs },
    comparisons,
  };
  const deterministicView = { ...reportBase, runtimeMs: undefined };
  const report = {
    ...reportBase,
    outcomeSha256: createHash('sha256')
      .update(`${JSON.stringify(deterministicView)}\n`)
      .digest('hex'),
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output requires a path');
    writeFileSync(resolve(output), json);
  } else {
    process.stdout.write(json);
  }
}

void main();
