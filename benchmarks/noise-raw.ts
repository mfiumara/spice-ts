// Shared ngspice noise-raw reader and error metrics for the benchmarks/*-noise/compare.ts scripts.
import { readFileSync } from 'node:fs';

export interface NoiseData {
  frequencies: number[];
  output: number[];
  input: number[];
  integratedOutput: number;
  integratedInput: number;
}

export function readNoiseRaw(path: string): NoiseData {
  const raw = readFileSync(path);
  const title = Buffer.from('Title:');
  const offsets: number[] = [];
  for (let offset = raw.indexOf(title); offset >= 0; offset = raw.indexOf(title, offset + title.length)) {
    offsets.push(offset);
  }
  const plots = offsets.map((offset, index) => raw.subarray(offset, offsets[index + 1] ?? raw.length));
  if (plots.length !== 2) throw new Error(`expected two ngspice noise plots, got ${plots.length}`);
  const spectral = binaryValues(plots[0]);
  const integrated = binaryValues(plots[1]);
  if (spectral.length % 3 !== 0 || integrated.length !== 2) {
    throw new Error('unexpected ngspice noise raw shape');
  }
  return {
    frequencies: spectral.filter((_value, index) => index % 3 === 0),
    output: spectral.filter((_value, index) => index % 3 === 1),
    input: spectral.filter((_value, index) => index % 3 === 2),
    integratedOutput: integrated[0],
    integratedInput: integrated[1],
  };
}

function binaryValues(plot: Buffer): number[] {
  const marker = Buffer.from('Binary:\n');
  const binaryOffset = plot.indexOf(marker);
  if (binaryOffset < 0) throw new Error('ngspice raw plot has no binary payload');
  const header = plot.subarray(0, binaryOffset).toString('utf8');
  const variableCount = Number(header.match(/No\. Variables:\s+(\d+)/)?.[1]);
  const pointCount = Number(header.match(/No\. Points:\s+(\d+)/)?.[1]);
  if (!Number.isInteger(variableCount) || !Number.isInteger(pointCount)) {
    throw new Error('ngspice raw plot has invalid dimensions');
  }
  const values: number[] = [];
  const dataOffset = binaryOffset + marker.length;
  for (let index = 0; index < variableCount * pointCount; index++) {
    values.push(plot.readDoubleLE(dataOffset + index * 8));
  }
  return values;
}

export function assertMatchedFrequencies(actual: number[], expected: number[]): void {
  if (actual.length !== expected.length) throw new Error('frequency count mismatch');
  actual.forEach((value, index) => {
    if (Math.abs(value - expected[index]) > Math.abs(expected[index]) * 1e-12) {
      throw new Error(`frequency mismatch at ${index}: ${value} vs ${expected[index]}`);
    }
  });
}

export function metrics(actual: number[], expected: number[]): object {
  if (actual.length !== expected.length) throw new Error('metric count mismatch');
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((value, index) => value / Math.max(Math.abs(expected[index]), Number.MIN_VALUE));
  return {
    maximumAbsoluteError: Math.max(...absolute),
    rmsAbsoluteError: Math.sqrt(absolute.reduce((sum, value) => sum + value * value, 0) / absolute.length),
    maximumRelativeError: Math.max(...relative),
    rmsRelativeError: Math.sqrt(relative.reduce((sum, value) => sum + value * value, 0) / relative.length),
  };
}

export function required(value: number | undefined, label: string): number {
  if (value === undefined) throw new Error(`spice-ts returned no ${label}`);
  return value;
}
