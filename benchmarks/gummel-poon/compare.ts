#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate } from '../../packages/core/src/index.js';

const fixtures = ['vce-1.cir', 'vce-5.cir', 'vce-9.cir'];
const signals = ['v(base)', 'v(collector)', 'i(vbe)', 'i(vce)'] as const;

type Signal = typeof signals[number];
type SignalValues = Record<Signal, number[]>;

void main();

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-gp-'));
  const failures: Array<{ fixture: string; simulator: string; error: string }> = [];
  const comparisons: Array<{ fixture: string; points: number; metrics: Record<Signal, Metrics> }> = [];
  const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
  const version = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';

  try {
    for (const fixture of fixtures) {
      const fixturePath = resolve('benchmarks/gummel-poon', fixture);
      const netlist = readFileSync(fixturePath, 'utf8');
      let reference: SignalValues;
      try {
        const rawPath = join(workspace, `${fixture}.raw`);
        execFileSync('ngspice', ['-b', '-r', rawPath, fixturePath], {
          encoding: 'utf8', timeout: 30_000,
        });
        reference = readBinaryRaw(rawPath);
      } catch (error) {
        failures.push({ fixture, simulator: version, error: message(error) });
        continue;
      }

      try {
        const result = await simulate(netlist);
        if (!result.dcSweep) throw new Error('spice-ts returned no DC sweep');
        const actual: SignalValues = {
          'v(base)': [...result.dcSweep.voltage('base')],
          'v(collector)': [...result.dcSweep.voltage('collector')],
          'i(vbe)': [...result.dcSweep.current('VBE')],
          'i(vce)': [...result.dcSweep.current('VCE')],
        };
        comparisons.push({
          fixture,
          points: actual['v(base)'].length,
          metrics: Object.fromEntries(signals.map(signal => [
            signal, metrics(actual[signal], reference[signal]),
          ])) as Record<Signal, Metrics>,
        });
      } catch (error) {
        failures.push({ fixture, simulator: 'spice-ts', error: message(error) });
      }
    }

    console.log(JSON.stringify({
      referenceSimulator: version,
      identicalNetlists: fixtures.map(fixture => `benchmarks/gummel-poon/${fixture}`),
      grid: { vbe: { start: 0.55, stop: 0.70, step: 0.025 }, vce: [1, 5, 9] },
      comparisons,
      convergenceFailures: failures,
    }, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

interface Metrics {
  maximumAbsoluteError: number;
  rmsAbsoluteError: number;
  maximumRelativeError: number;
  rmsRelativeError: number;
}

function metrics(actual: number[], expected: number[]): Metrics {
  if (actual.length !== expected.length) {
    throw new Error(`point-count mismatch: spice-ts=${actual.length}, ngspice=${expected.length}`);
  }
  const absolute = actual.map((value, index) => Math.abs(value - expected[index]));
  const relative = absolute.map((value, index) => value / Math.max(Math.abs(expected[index]), 1e-30));
  return {
    maximumAbsoluteError: Math.max(...absolute, 0),
    rmsAbsoluteError: rms(absolute),
    maximumRelativeError: Math.max(...relative, 0),
    rmsRelativeError: rms(relative),
  };
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function readBinaryRaw(path: string): SignalValues {
  const raw = readFileSync(path);
  const marker = Buffer.from('Binary:\n');
  const binaryOffset = raw.indexOf(marker);
  if (binaryOffset < 0) throw new Error(`ngspice raw file has no binary payload: ${path}`);
  const header = raw.subarray(0, binaryOffset).toString('utf8');
  const variableCount = Number(header.match(/No\. Variables:\s+(\d+)/)?.[1]);
  const pointCount = Number(header.match(/No\. Points:\s+(\d+)/)?.[1]);
  const variableBlock = header.split('Variables:\n')[1];
  if (!Number.isInteger(variableCount) || !Number.isInteger(pointCount) || !variableBlock) {
    throw new Error(`invalid ngspice binary raw file: ${path}`);
  }
  const names = variableBlock.trim().split('\n').map(line => line.trim().split(/\s+/)[1]);
  const dataStart = binaryOffset + marker.length;
  const rows = Array.from({ length: pointCount }, (_, point) =>
    Array.from({ length: variableCount }, (_, variable) =>
      raw.readDoubleLE(dataStart + (point * variableCount + variable) * 8)));
  const result = {} as SignalValues;
  for (const signal of signals) {
    const index = names.indexOf(signal);
    if (index < 0) throw new Error(`ngspice raw file is missing ${signal}`);
    result[signal] = rows.map(row => row[index]);
  }
  return result;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
