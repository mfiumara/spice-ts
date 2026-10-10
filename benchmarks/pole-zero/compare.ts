#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate, type PoleZeroValue } from '../../packages/core/src/index.js';

interface FixtureCase {
  id: string;
  path: string;
}

const fixtures: FixtureCase[] = [
  { id: 'passive-rlc', path: 'benchmarks/pole-zero/passive-rlc.cir' },
  { id: 'active-four-stage', path: 'benchmarks/pole-zero/active-four-stage.cir' },
];

void main();

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-pz-'));
  try {
  const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
  const version = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';
  const comparisons = [];
  const failures: Array<{ fixture: string; simulator: string; error: string }> = [];

  for (const fixture of fixtures) {
    const rawPath = join(workspace, `${fixture.id}.raw`);
    let ngspice: { poles: PoleZeroValue[]; zeros: PoleZeroValue[] };
    try {
      execFileSync('ngspice', ['-b', '-r', rawPath, resolve(fixture.path)], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      ngspice = readPoleZeroRaw(rawPath);
    } catch (error) {
      failures.push({ fixture: fixture.id, simulator: version, error: message(error) });
      continue;
    }

    try {
      const result = await simulate(readFileSync(resolve(fixture.path), 'utf8'));
      if (!result.poleZero) throw new Error('spice-ts returned no poleZero result');
      comparisons.push({
        fixture: fixture.id,
        identicalNetlist: fixture.path,
        command: `ngspice -b -r <temporary-raw-path> ${fixture.path}`,
        convergence: { ngspice: 'success', spiceTs: 'success' },
        poles: metrics(result.poleZero.poles, ngspice.poles),
        zeros: metrics(result.poleZero.zeros, ngspice.zeros),
      });
    } catch (error) {
      failures.push({ fixture: fixture.id, simulator: 'spice-ts', error: message(error) });
    }
  }

  console.log(JSON.stringify({
    referenceSimulator: version,
    comparisons,
    failures,
    unsupported: [
      '.pz input 0 output 0 vol pz',
      '.pz input reference output 0 cur pz',
      '.pz input 0 output reference cur pz',
      '.pz input 0 output 0 cur zer',
      '.step combined with .pz',
      'dynamic order greater than 12',
    ],
  }, null, 2));

  if (failures.length > 0) process.exitCode = 1;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function readPoleZeroRaw(path: string): { poles: PoleZeroValue[]; zeros: PoleZeroValue[] } {
  const raw = readFileSync(path);
  const marker = Buffer.from('Binary:\n');
  const binaryOffset = raw.indexOf(marker);
  if (binaryOffset < 0) throw new Error(`ngspice raw file has no binary payload: ${path}`);
  const header = raw.subarray(0, binaryOffset).toString('utf8');
  const variableCount = Number(header.match(/No\. Variables:\s+(\d+)/)?.[1]);
  const variableBlock = header.split('Variables:\n')[1];
  if (!Number.isInteger(variableCount) || !variableBlock) {
    throw new Error(`ngspice raw file has invalid PZ header: ${path}`);
  }
  const names = variableBlock.trim().split('\n').map(line => line.trim().split(/\s+/)[1]);
  const dataStart = binaryOffset + marker.length;
  const poles: PoleZeroValue[] = [];
  const zeros: PoleZeroValue[] = [];
  for (let index = 0; index < variableCount; index++) {
    const value = {
      real: raw.readDoubleLE(dataStart + index * 16),
      imaginary: raw.readDoubleLE(dataStart + index * 16 + 8),
    };
    const target = names[index]?.includes('pole(') ? poles : zeros;
    target.push(value);
  }
  return { poles: order(poles), zeros: order(zeros) };
}

function metrics(actualInput: PoleZeroValue[], expectedInput: PoleZeroValue[]): object {
  const actual = order(actualInput);
  const expected = order(expectedInput);
  if (actual.length !== expected.length) {
    return { status: 'count-mismatch', spiceTsCount: actual.length, ngspiceCount: expected.length };
  }
  const absoluteErrors = actual.map((value, index) => Math.hypot(
    value.real - expected[index].real,
    value.imaginary - expected[index].imaginary,
  ));
  const relativeErrors = absoluteErrors.map((error, index) =>
    error / Math.max(Math.hypot(expected[index].real, expected[index].imaginary), 1));
  return {
    status: 'matched',
    count: actual.length,
    maximumAbsoluteError: Math.max(...absoluteErrors, 0),
    maximumRelativeError: Math.max(...relativeErrors, 0),
    spiceTs: actual,
    ngspice: expected,
  };
}

function order(values: PoleZeroValue[]): PoleZeroValue[] {
  return values.map(value => ({ ...value }))
    .sort((left, right) => left.real - right.real || left.imaginary - right.imaginary);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
