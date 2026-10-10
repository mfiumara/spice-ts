#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  simulate, type ComplexDistortionValue, type DistortionProduct,
} from '../../packages/core/src/index.js';

interface RawPlot {
  plotName: string;
  flags: 'real' | 'complex';
  names: string[];
  points: ComplexDistortionValue[][];
}

interface BenchmarkCase {
  id: string;
  fixturePath: string;
  plots: Array<{ product: DistortionProduct; plotName: string }>;
}

const benchmarkCases: BenchmarkCase[] = [
  {
    id: 'single-tone-linear-lowpass',
    fixturePath: 'benchmarks/distortion/linear-lowpass.cir',
    plots: [
      { product: 2, plotName: 'DISTORTION - 2nd harmonic' },
      { product: 3, plotName: 'DISTORTION - 3rd harmonic' },
    ],
  },
  {
    id: 'two-tone-linear-lowpass',
    fixturePath: 'benchmarks/distortion/two-tone-linear-lowpass.cir',
    plots: [
      { product: 'f1+f2', plotName: 'DISTORTION - IM: f1+f2' },
      { product: 'f1-f2', plotName: 'DISTORTION - IM: f1-f2' },
      { product: '2f1-f2', plotName: 'DISTORTION - IM: 2f1-f2' },
    ],
  },
];
const unsupported = [
  { form: '.disto LIN or OCT', reason: 'sweep outside the bounded DEC slice' },
  { form: 'diode/BJT/JFET/MOSFET distortion', reason: 'semiconductor nonlinear distortion' },
  { form: 'controlled, coupled, transmission-line, or custom devices', reason: 'device outside ideal RLC/source slice' },
  { form: 'multiple non-zero DISTOF1 or DISTOF2 excitations', reason: 'bounded one-source-per-tone slice' },
  { form: 'single-tone intermodulation or two-tone harmonic selectors', reason: 'products outside the selected analysis mode' },
  { form: 'f2overf1 outside 0 < ratio < 1', reason: 'unsupported two-tone frequency ordering' },
  { form: '.step combined with .disto', reason: 'stepped distortion' },
  { form: 'multiple .disto directives', reason: 'single-result bounded API' },
  { form: 'protocol v1, streaming, or ngspice-wasm result mapping', reason: 'result transport is not implemented' },
];

void main();

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-disto-'));
  const failures: string[] = [];
  try {
    const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const version = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';
    const cases = [];
    for (const benchmarkCase of benchmarkCases) {
      const fixture = readFileSync(resolve(benchmarkCase.fixturePath));
      const rawPath = join(workspace, `${benchmarkCase.id}.raw`);
      const ngspiceStart = performance.now();
      execFileSync('ngspice', ['-b', '-r', rawPath, resolve(benchmarkCase.fixturePath)], {
        encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const ngspiceRuntimeMs = performance.now() - ngspiceStart;
      const plots = readBinaryRaw(rawPath);
      const spiceTsStart = performance.now();
      const result = await simulate(fixture.toString('utf8'));
      const spiceTsRuntimeMs = performance.now() - spiceTsStart;
      if (!result.distortion) throw new Error(`${benchmarkCase.id}: spice-ts returned no distortion result`);

      const comparisons = benchmarkCase.plots.map(({ product, plotName }) => {
        const plot = plots.find(candidate => candidate.plotName === plotName);
        if (!plot) throw new Error(`${benchmarkCase.id}: ngspice raw output omitted ${plotName}`);
        const frequencyIndex = plot.names.indexOf('frequency');
        if (frequencyIndex < 0) throw new Error(`${plotName} omitted frequency`);
        const ngspiceFrequencies = plot.points.map(point => point[frequencyIndex].real);
        const frequencyMetrics = scalarMetrics(result.distortion!.frequencies, ngspiceFrequencies);
        const vectors = plot.names.filter(name => name !== 'frequency').map(name => {
          const index = plot.names.indexOf(name);
          const expected = plot.points.map(point => point[index]);
          const voltage = name.match(/^v\((.+)\)$/i);
          const current = name.match(/^i\((.+)\)$/i);
          const actual = voltage
            ? result.distortion!.voltage(voltage[1], product)
            : current
              ? result.distortion!.current(current[1].toUpperCase(), product)
              : (() => { throw new Error(`unsupported ngspice vector ${name}`); })();
          return { name, metrics: complexMetrics(actual, expected) };
        });
        return {
          product, plotName, pointCount: plot.points.length,
          frequencies: ngspiceFrequencies, frequencyMetrics,
          vectorOrder: plot.names.filter(name => name !== 'frequency'), vectors,
        };
      });
      for (const comparison of comparisons) {
        for (const vector of comparison.vectors) {
          if (vector.metrics.maximumAbsoluteError !== 0) {
            failures.push(`${benchmarkCase.id} ${comparison.product} ${vector.name} mismatch`);
          }
        }
      }
      cases.push({
        id: benchmarkCase.id,
        source: {
          url: 'https://sourceforge.net/p/ngspice/ngspice/ci/3ef069fb1f04177a153f342a32d941fc20ff047e/tree/tests/filters/lowpass.cir',
          revision: '3ef069fb1f04177a153f342a32d941fc20ff047e',
          licence: 'BSD-3-Clause', fixture: benchmarkCase.fixturePath,
          fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
          fixtureBytes: fixture.length, identicalNetlistBytes: true,
        },
        commands: {
          ngspice: `ngspice -b -r <temporary-raw-path> ${benchmarkCase.fixturePath}`,
          spiceTs: `simulate(readFileSync('${benchmarkCase.fixturePath}', 'utf8'))`,
        },
        convergence: { ngspice: 'success', spiceTs: 'success', spiceTsTelemetry: result.convergence },
        runtimesMs: { ngspiceSubprocess: ngspiceRuntimeMs, spiceTsInProcess: spiceTsRuntimeMs },
        productCount: comparisons.length,
        frequencyOrder: result.distortion.frequencies,
        comparisons,
      });
    }

    const report = {
      referenceSimulator: version,
      machine: `${platform()} ${arch()}, Node ${process.version}`,
      cases,
      relativeErrorDenominator: 'max(abs(ngspice complex value), 1e-15)',
      failures,
      losses: [
        'Only ideal linear RLC/source circuits are supported; all covered product values are exactly zero.',
        'Only DEC sweeps, single-tone second/third harmonics, and two-tone f1+f2, f1-f2, and 2f1-f2 products are represented.',
        'No nonlinear coefficient, normalized distortion ratio, fundamental response, or coincident-product summation is computed.',
        'Two-tone raw frequency axes are ngspice swept-F1 coordinates, not derived product frequencies.',
        'Non-zero matched-frequency residuals are published in each comparison.frequencyMetrics.',
        'Runtime figures use different process boundaries and support no speed claim.',
      ],
      runtimeCaveat: 'Different process boundaries; no speed superiority claim is made.',
      unsupported,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function readBinaryRaw(path: string): RawPlot[] {
  const raw = readFileSync(path);
  const binaryMarker = Buffer.from('Binary:\n');
  const titleMarker = Buffer.from('Title: ');
  const plots: RawPlot[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const binaryOffset = raw.indexOf(binaryMarker, offset);
    if (binaryOffset < 0) break;
    const header = raw.subarray(offset, binaryOffset).toString('utf8');
    const plotName = header.match(/^Plotname:\s*(.+)$/m)?.[1]?.trim();
    const flags = header.match(/^Flags:\s*(real|complex)$/m)?.[1] as RawPlot['flags'] | undefined;
    const variableCount = Number(header.match(/^No\. Variables:\s*(\d+)/m)?.[1]);
    const pointCount = Number(header.match(/^No\. Points:\s*(\d+)/m)?.[1]);
    const variableBlock = header.split('Variables:\n')[1];
    if (!plotName || !flags || !Number.isInteger(variableCount)
        || !Number.isInteger(pointCount) || !variableBlock) {
      throw new Error(`invalid ngspice raw header at byte ${offset}`);
    }
    const names = variableBlock.trim().split('\n').map(line => line.trim().split(/\s+/)[1]);
    if (names.length !== variableCount) throw new Error(`${plotName} variable-count mismatch`);
    const bytesPerValue = flags === 'complex' ? 16 : 8;
    const dataStart = binaryOffset + binaryMarker.length;
    const dataEnd = dataStart + pointCount * variableCount * bytesPerValue;
    if (dataEnd > raw.length) throw new Error(`${plotName} has a truncated binary payload`);
    const points = Array.from({ length: pointCount }, (_, point) =>
      Array.from({ length: variableCount }, (_, variable) => {
        const valueOffset = dataStart + (point * variableCount + variable) * bytesPerValue;
        return {
          real: raw.readDoubleLE(valueOffset),
          imaginary: flags === 'complex' ? raw.readDoubleLE(valueOffset + 8) : 0,
        };
      }));
    plots.push({ plotName, flags, names, points });
    const next = raw.indexOf(titleMarker, dataEnd);
    offset = next < 0 ? raw.length : next;
  }
  return plots;
}

function complexMetrics(actual: ComplexDistortionValue[], expected: ComplexDistortionValue[]): object & {
  maximumAbsoluteError: number;
} {
  if (actual.length !== expected.length) {
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

function scalarMetrics(actual: number[], expected: number[]): object & {
  maximumAbsoluteError: number;
} {
  if (actual.length !== expected.length) {
    throw new Error(`frequency point-count mismatch ${actual.length} != ${expected.length}`);
  }
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((error, index) => error / Math.max(Math.abs(expected[index]), 1e-15));
  return metricSummary(absolute, relative);
}

function metricSummary(absolute: number[], relative: number[]): {
  sampleCount: number;
  maximumAbsoluteError: number;
  rmsAbsoluteError: number;
  maximumRelativeError: number;
  rmsRelativeError: number;
} {
  return {
    sampleCount: absolute.length,
    maximumAbsoluteError: Math.max(...absolute, 0),
    rmsAbsoluteError: rms(absolute),
    maximumRelativeError: Math.max(...relative, 0),
    rmsRelativeError: rms(relative),
  };
}

function rms(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}
