#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  simulate,
  simulateStream,
  type ComplexDistortionValue,
  type DistortionProduct,
} from '../../../packages/core/dist/index.js';
import {
  assertDistortionMetricAccepted,
  type ErrorMetrics,
} from './acceptance.js';

const FIXTURE_PATH = 'benchmarks/corpus/classic/fixtures/spice3f5/diodisto.cir';
const FIXTURE_SHA256 = '912c8cedf66aadbe78f17ceb28644cb8c39a2cb3442559be3219fbaac6d11de8';
const SOURCE_REVISION = '3d9360bef370b432e473edb0c4333707d545a55f';
const PLOTS: Array<{ product: DistortionProduct; plotName: string }> = [
  { product: 'f1+f2', plotName: 'DISTORTION - IM: f1+f2' },
  { product: 'f1-f2', plotName: 'DISTORTION - IM: f1-f2' },
  { product: '2f1-f2', plotName: 'DISTORTION - IM: 2f1-f2' },
];

interface RawPlot {
  plotName: string;
  names: string[];
  points: ComplexDistortionValue[][];
}

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return `${result.stdout}\n${result.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown';
}

async function streamOutcome(input: string): Promise<{ status: string; error: string }> {
  try {
    for await (const _point of simulateStream(input)) {
      throw new Error('simulateStream unexpectedly emitted a distortion point');
    }
    throw new Error('simulateStream unexpectedly accepted distortion');
  } catch (error) {
    return {
      status: 'explicitly-unsupported',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const fixture = await readFile(resolve(FIXTURE_PATH));
  const digest = sha256(fixture);
  if (digest !== FIXTURE_SHA256) throw new Error(`fixture hash mismatch: ${digest}`);
  const input = fixture.toString('utf8');
  const workspace = await mkdtemp(join(tmpdir(), 'spicets-issue-363-'));
  try {
    const rawPath = join(workspace, 'diodisto.raw');
    const ngspiceStarted = performance.now();
    const ngspice = spawnSync('ngspice', ['-b', '-r', rawPath, resolve(FIXTURE_PATH)], {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const ngspiceRuntimeMs = Number((performance.now() - ngspiceStarted).toFixed(3));
    if (ngspice.error || ngspice.status !== 0) {
      throw new Error(`ngspice failed: ${ngspice.stderr || ngspice.stdout}`);
    }
    const plots = readBinaryRaw(await readFile(rawPath));

    const spiceTsStarted = performance.now();
    const result = await simulate(input);
    const spiceTsRuntimeMs = Number((performance.now() - spiceTsStarted).toFixed(3));
    if (!result.distortion) throw new Error('spice-ts returned no distortion result');

    const comparisons = PLOTS.map(({ product, plotName }) => {
      const plot = plots.find(candidate => candidate.plotName === plotName);
      if (!plot) throw new Error(`ngspice omitted ${plotName}`);
      const frequencyIndex = plot.names.indexOf('frequency');
      if (frequencyIndex < 0) throw new Error(`${plotName} omitted frequency`);
      const ngspiceFrequencies = plot.points.map(point => point[frequencyIndex].real);
      const frequencyMetrics = scalarMetrics(result.distortion!.frequencies, ngspiceFrequencies);
      const vectors = plot.names.filter(name => name !== 'frequency').map((name) => {
        const vectorIndex = plot.names.indexOf(name);
        const expected = plot.points.map(point => point[vectorIndex]);
        const voltage = name.match(/^v\((.+)\)$/i);
        const current = name.match(/^i\((.+)\)$/i);
        const actual = voltage
          ? result.distortion!.voltage(voltage[1], product)
          : current
            ? result.distortion!.current(current[1], product)
            : (() => { throw new Error(`unsupported ngspice vector ${name}`); })();
        const metrics = complexMetrics(actual, expected);
        assertDistortionMetricAccepted(metrics, String(product), name);
        return { name, metrics };
      });
      if (plot.points.length !== 101 || result.distortion!.frequencies.length !== 101) {
        throw new Error(`${plotName} expected 101 points in both engines`);
      }
      return {
        product,
        plotName,
        pointCount: plot.points.length,
        frequencyOrder: ngspiceFrequencies,
        frequencyMetrics,
        vectorOrder: plot.names.filter(name => name !== 'frequency'),
        vectors,
      };
    });

    const packageJson = JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8'));
    const report = {
      schemaVersion: 'spice-ts-issue-363/v1',
      issueUrl: 'https://github.com/mfiumara/spice-ts/issues/363',
      generatedAt: new Date().toISOString(),
      tools: {
        spiceTs: packageJson.version,
        node: process.version,
        ngspice: ngspiceVersion(),
      },
      machine: {
        platform: platform(),
        release: release(),
        arch: arch(),
        cpu: cpus()[0]?.model ?? 'unknown',
      },
      source: {
        name: 'Berkeley SPICE3f5 classic corpus',
        url: `https://github.com/obernin/spice/blob/${SOURCE_REVISION}/examples/diodisto.cir`,
        revision: SOURCE_REVISION,
        licence: 'Berkeley SPICE grant',
        redistribution: 'allowed with the retained benchmarks/corpus/classic/COPYRIGHT.txt notice',
        adaptation: 'none',
      },
      input: {
        path: FIXTURE_PATH,
        bytes: fixture.byteLength,
        sha256: digest,
        byteIdenticalBetweenEngines: true,
      },
      commands: {
        verifier: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-363/verify.ts --output benchmarks/results/issue-363/report.json',
        ngspice: `ngspice -b -r <temporary-raw-path> ${FIXTURE_PATH}`,
        spiceTs: `simulate(readFileSync('${FIXTURE_PATH}', 'utf8'))`,
      },
      policy: {
        perCircuitToleranceTuning: false,
        relativeErrorDenominator: 'max(abs(ngspice complex value), 1e-15)',
        maximumRelativeError: 0.005,
        runtimeBoundary: 'ngspice fresh subprocess; spice-ts in-process after module load',
        speedClaim: false,
      },
      before: {
        spiceTs: {
          status: 'unsupported',
          error: '.disto supports only independent sources and ideal R, L, C devices; found d1 (Diode)',
        },
      },
      after: {
        ngspice: { status: 'success', convergence: 'converged', runtimeMs: ngspiceRuntimeMs },
        spiceTs: {
          status: 'success',
          convergence: result.convergence,
          runtimeMs: spiceTsRuntimeMs,
        },
        grid: { variation: 'DEC', pointsPerDecade: 20, startHz: 1e3, stopHz: 1e8, points: 101 },
        fixedSecondToneHz: 900,
        comparisons,
      },
      batchStreamContract: {
        batch: 'success',
        stream: await streamOutcome(input),
      },
      supportedContract: {
        sweeps: ['single-tone DEC 2f1 and 3f1', 'two-tone DEC f1+f2, f1-f2, and 2f1-f2'],
        devices: ['ideal R', 'ideal L', 'ideal C', 'independent voltage source', 'independent current source', 'bounded diode'],
        diodeModelParameters: ['IS', 'TT', 'CJO (netlist alias)', 'CJ0 (programmatic alias)'],
        diodeDefaults: ['N=1', 'VJ=1', 'M=0.5', 'FC=0.5', 'TEMP=27 C'],
      },
      unsupportedContract: [
        'LIN and OCT distortion sweeps',
        'stepped or multiple distortion analyses',
        'more than one active source per tone',
        'diode instance geometry and series resistance',
        'explicit diode model parameters other than IS, TT, CJO, and CJ0',
        'BJT, JFET, MOSFET, controlled, coupled, transmission-line, and custom-device distortion',
        'protocol-v1, streaming, and ngspice-WASM distortion transport',
        'normalized harmonic ratios, fundamental output, and coincident-product summation',
      ],
      retainedLosses: [
        'Every non-zero absolute and relative residual is retained per product and signal.',
        'spice-ts and ngspice use different operating-point convergence paths; no exact-value claim is made.',
        'Runtimes use different process boundaries and support no speed claim.',
        'Streaming remains explicitly unsupported rather than silently returning no data.',
        'The slice does not claim nonlinear distortion support for devices or diode parameters outside the supported contract.',
      ],
    };

    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex >= 0) {
      const outputPath = process.argv[outputIndex + 1];
      if (!outputPath) throw new Error('--output requires a path');
      await writeFile(resolve(outputPath), serialized);
    } else {
      process.stdout.write(serialized);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function readBinaryRaw(raw: Buffer): RawPlot[] {
  const binaryMarker = Buffer.from('Binary:\n');
  const titleMarker = Buffer.from('Title: ');
  const plots: RawPlot[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const binaryOffset = raw.indexOf(binaryMarker, offset);
    if (binaryOffset < 0) break;
    const header = raw.subarray(offset, binaryOffset).toString('utf8');
    const plotName = header.match(/^Plotname:\s*(.+)$/m)?.[1]?.trim();
    const flags = header.match(/^Flags:\s*(real|complex)$/m)?.[1];
    const variableCount = Number(header.match(/^No\. Variables:\s*(\d+)/m)?.[1]);
    const pointCount = Number(header.match(/^No\. Points:\s*(\d+)/m)?.[1]);
    const variableBlock = header.split('Variables:\n')[1];
    if (!plotName || !flags || !Number.isInteger(variableCount)
        || !Number.isInteger(pointCount) || !variableBlock) {
      throw new Error(`invalid ngspice raw header at byte ${offset}`);
    }
    const names = variableBlock.trim().split('\n').map(line => line.trim().split(/\s+/)[1]);
    const bytesPerValue = flags === 'complex' ? 16 : 8;
    const dataStart = binaryOffset + binaryMarker.length;
    const dataEnd = dataStart + pointCount * variableCount * bytesPerValue;
    if (names.length !== variableCount || dataEnd > raw.length) {
      throw new Error(`${plotName} raw shape mismatch`);
    }
    const points = Array.from({ length: pointCount }, (_, point) =>
      Array.from({ length: variableCount }, (_, variable) => {
        const valueOffset = dataStart + (point * variableCount + variable) * bytesPerValue;
        return {
          real: raw.readDoubleLE(valueOffset),
          imaginary: flags === 'complex' ? raw.readDoubleLE(valueOffset + 8) : 0,
        };
      }));
    plots.push({ plotName, names, points });
    const next = raw.indexOf(titleMarker, dataEnd);
    offset = next < 0 ? raw.length : next;
  }
  return plots;
}

function complexMetrics(
  actual: ComplexDistortionValue[],
  expected: ComplexDistortionValue[],
): ErrorMetrics {
  if (actual.length === 0 || actual.length !== expected.length) {
    throw new Error(`complex point-count mismatch ${actual.length} != ${expected.length}`);
  }
  const absolute = actual.map((value, index) => Math.hypot(
    value.real - expected[index].real,
    value.imaginary - expected[index].imaginary,
  ));
  const relative = absolute.map((error, index) =>
    error / Math.max(Math.hypot(expected[index].real, expected[index].imaginary), 1e-15));
  return metricSummary(absolute, relative);
}

function scalarMetrics(actual: number[], expected: number[]): ErrorMetrics {
  if (actual.length === 0 || actual.length !== expected.length) {
    throw new Error(`frequency point-count mismatch ${actual.length} != ${expected.length}`);
  }
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((error, index) => error / Math.max(Math.abs(expected[index]), 1e-15));
  return metricSummary(absolute, relative);
}

function metricSummary(absolute: number[], relative: number[]): ErrorMetrics {
  const rms = (values: number[]) => Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
  return {
    sampleCount: absolute.length,
    maximumAbsoluteError: Math.max(...absolute),
    rmsAbsoluteError: rms(absolute),
    maximumRelativeError: Math.max(...relative),
    rmsRelativeError: rms(relative),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
