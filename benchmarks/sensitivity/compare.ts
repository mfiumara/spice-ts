#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  simulate,
  type ComplexSensitivityValue,
  type SensitivityEntry,
} from '../../packages/core/src/index.js';

interface FixtureCase {
  id: string;
  path: string;
}

interface RawData {
  flags: 'real' | 'complex';
  names: string[];
  points: ComplexSensitivityValue[][];
}

const fixtures: FixtureCase[] = [
  { id: 'passive-rlc-dc', path: 'benchmarks/sensitivity/passive-rlc-dc.cir' },
  { id: 'passive-rlc-ac', path: 'benchmarks/sensitivity/passive-rlc-ac.cir' },
  { id: 'active-vcvs-ac', path: 'benchmarks/sensitivity/active-vcvs-ac.cir' },
];

void main();

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-sens-'));
  const failures: Array<{ fixture: string; simulator: string; error: string }> = [];
  const comparisons: object[] = [];
  try {
    writeFileSync(join(workspace, '.spiceinit'), 'set filetype=ascii\n');
    const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const version = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';

    for (const fixture of fixtures) {
      try {
        const rawPath = join(workspace, `${fixture.id}.raw`);
        execFileSync('ngspice', ['-b', '-r', rawPath, resolve(fixture.path)], {
          cwd: workspace,
          encoding: 'utf8',
          timeout: 30_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const ngspice = readAsciiRaw(rawPath);
        const result = await simulate(readFileSync(resolve(fixture.path), 'utf8'));
        if (!result.sensitivity) throw new Error('spice-ts returned no sensitivity result');

        const vectors = result.sensitivity.entries.map(entry => ({
          entry,
          ngspiceName: ngspiceName(entry, result.sensitivity!.mode),
          actual: values(entry),
        }));
        const samples = vectors.flatMap(({ actual, ngspiceName }) => {
          const index = ngspice.names.indexOf(ngspiceName);
          if (index < 0) throw new Error(`ngspice raw output omitted ${ngspiceName}`);
          const expected = ngspice.points.map(point => point[index]);
          if (expected.length !== actual.length) {
            throw new Error(`${ngspiceName} point-count mismatch ${actual.length} != ${expected.length}`);
          }
          return actual.map((value, point) => ({ value, expected: expected[point] }));
        });
        const perParameter = Object.fromEntries(vectors.map(({ entry, actual, ngspiceName }) => {
          const index = ngspice.names.indexOf(ngspiceName);
          const expected = ngspice.points.map(point => point[index]);
          return [`${entry.device}.${entry.parameter}`, metrics(actual.map((value, point) => ({
            value, expected: expected[point],
          })))];
        }));

        comparisons.push({
          fixture: fixture.id,
          identicalNetlist: fixture.path,
          command: `ngspice -b -r <temporary-raw-path> ${fixture.path}`,
          convergence: { ngspice: 'success', spiceTs: 'success' },
          mode: result.sensitivity.mode,
          pointCount: result.sensitivity.mode === 'dc' ? 1 : result.sensitivity.frequencies.length,
          spiceTsOrder: result.sensitivity.entries.map(entry => entry.device),
          ngspicePrimaryOrder: ngspice.names.filter(name =>
            vectors.some(vector => vector.ngspiceName === name)),
          metrics: metrics(samples),
          perParameter,
        });
      } catch (error) {
        failures.push({ fixture: fixture.id, simulator: 'comparison', error: message(error) });
      }
    }

    console.log(JSON.stringify({
      referenceSimulator: version,
      machine: `${platform()} ${arch()}, Node ${process.version}`,
      sourceRevisions: {
        berkeleySpice3f5: '3d9360bef370b432e473edb0c4333707d545a55f',
        gnucap: '5acb027125d6ea7c546badd03e026d8781c6a400',
      },
      derivative: 'absolute change in output per unit change in primary device value',
      relativeErrorDenominator: 'max(abs(ngspice), 1e-12)',
      comparisons,
      failures,
      losses: fixtures.map(fixture => ({
        fixture: fixture.id,
        retained: 'non-zero max/RMS residuals are published in comparisons.metrics',
      })),
      unsupported: [
        { form: '.sens V(out,ref)', reason: 'differential voltage output' },
        { form: '.sens I(Vsource)', reason: 'branch-current output' },
        { form: '.sens V(out) AC LIN ...', reason: 'LIN AC mode' },
        { form: '.sens V(out) AC OCT ...', reason: 'OCT AC mode' },
        { form: '.sens V(out) TRAN ...', reason: 'transient mode' },
        { form: '.step combined with .sens', reason: 'stepped sensitivity' },
        { form: 'nonlinear or unrecognized devices', reason: 'device outside RLC/source/linear-controlled-source slice' },
        { form: 'multiple .sens directives', reason: 'single-result bounded API' },
        { form: 'ngspice-wasm backend', reason: 'sensitivity raw-result mapping is not implemented' },
      ],
    }, null, 2));

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function values(entry: SensitivityEntry): ComplexSensitivityValue[] {
  if (entry.dc !== undefined) return [{ real: entry.dc, imaginary: 0 }];
  if (entry.ac) return entry.ac;
  throw new Error(`${entry.device}.${entry.parameter} has no values`);
}

function ngspiceName(entry: SensitivityEntry, mode: 'dc' | 'ac'): string {
  const device = entry.device.toLowerCase();
  switch (entry.parameter) {
    case 'resistance':
      return mode === 'ac' ? `v(${device}_ac)` : `v(${device})`;
    case 'capacitance':
    case 'inductance':
      return `v(${device})`;
    case 'gain':
      return `v(${device}_gain)`;
    case 'dc':
      return `v(${device})`;
    case 'acMagnitude':
      return `v(${device}_acmag)`;
  }
}

function readAsciiRaw(path: string): RawData {
  const raw = readFileSync(path, 'utf8');
  const variableCount = Number(raw.match(/^No\. Variables:\s*(\d+)/m)?.[1]);
  const pointCount = Number(raw.match(/^No\. Points:\s*(\d+)/m)?.[1]);
  const flags = raw.match(/^Flags:\s*(real|complex)/m)?.[1] as RawData['flags'] | undefined;
  const variablesStart = raw.indexOf('Variables:\n');
  const valuesStart = raw.indexOf('Values:\n');
  if (!Number.isInteger(variableCount) || !Number.isInteger(pointCount) || !flags
      || variablesStart < 0 || valuesStart < 0) {
    throw new Error(`invalid ngspice sensitivity raw header: ${path}`);
  }
  const variableLines = raw.slice(variablesStart + 'Variables:\n'.length, valuesStart)
    .trim().split('\n');
  const names = variableLines.map(line => line.trim().split(/\s+/)[1]);
  if (names.length !== variableCount) throw new Error(`raw variable-count mismatch: ${path}`);

  const scalarLines = raw.slice(valuesStart + 'Values:\n'.length).trim().split('\n');
  const scalars = scalarLines.map(line => {
    const trimmed = line.trim().replace(/^\d+\s+/, '');
    const [real, imaginary = '0'] = trimmed.split(',');
    return { real: Number(real), imaginary: Number(imaginary) };
  });
  if (scalars.length !== variableCount * pointCount) {
    throw new Error(`raw scalar-count mismatch: ${scalars.length} != ${variableCount * pointCount}`);
  }
  const points = Array.from({ length: pointCount }, (_, point) =>
    scalars.slice(point * variableCount, (point + 1) * variableCount));
  return { flags, names, points };
}

function metrics(samples: Array<{
  value: ComplexSensitivityValue;
  expected: ComplexSensitivityValue;
}>): object {
  const absolute = samples.map(({ value, expected }) => Math.hypot(
    value.real - expected.real,
    value.imaginary - expected.imaginary,
  ));
  const relative = absolute.map((error, index) => {
    const expected = samples[index].expected;
    return error / Math.max(Math.hypot(expected.real, expected.imaginary), 1e-12);
  });
  return {
    sampleCount: samples.length,
    maximumAbsoluteError: Math.max(...absolute, 0),
    rmsAbsoluteError: rms(absolute),
    maximumRelativeError: Math.max(...relative, 0),
    rmsRelativeError: rms(relative),
  };
}

function rms(valuesInput: number[]): number {
  if (valuesInput.length === 0) return 0;
  return Math.sqrt(valuesInput.reduce((sum, value) => sum + value * value, 0) / valuesInput.length);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
