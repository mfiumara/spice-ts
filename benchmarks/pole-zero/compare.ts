#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { simulate, type PoleZeroValue } from '../../packages/core/src/index.js';

interface FixtureCase {
  id: string;
  path: string;
  source: string;
  license: string;
  revision: string;
}

const fixtures: FixtureCase[] = [
  {
    id: 'passive-rlc',
    path: 'benchmarks/pole-zero/passive-rlc.cir',
    source: 'spice-ts benchmark corpus',
    license: 'MIT',
    revision: 'issue-75-current-input-baseline',
  },
  {
    id: 'active-four-stage',
    path: 'benchmarks/pole-zero/active-four-stage.cir',
    source: 'spice-ts benchmark corpus',
    license: 'MIT',
    revision: 'issue-75-current-input-baseline',
  },
  {
    id: 'passive-rlc-voltage',
    path: 'benchmarks/pole-zero/passive-rlc-voltage.cir',
    source: 'spice-ts benchmark corpus; derived from passive-rlc.cir',
    license: 'MIT',
    revision: 'issue-265-voltage-input',
  },
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
    const netlist = readFileSync(resolve(fixture.path));
    const rawPath = join(workspace, `${fixture.id}.raw`);
    let ngspice: { poles: PoleZeroValue[]; zeros: PoleZeroValue[] };
    let ngspiceRuntimeMs = 0;
    try {
      const started = performance.now();
      execFileSync('ngspice', ['-b', '-r', rawPath, resolve(fixture.path)], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      ngspiceRuntimeMs = performance.now() - started;
      ngspice = readPoleZeroRaw(rawPath);
    } catch (error) {
      failures.push({ fixture: fixture.id, simulator: version, error: message(error) });
      continue;
    }

    try {
      const started = performance.now();
      const result = await simulate(netlist.toString('utf8'));
      const spiceTsRuntimeMs = performance.now() - started;
      if (!result.poleZero) throw new Error('spice-ts returned no poleZero result');
      comparisons.push({
        fixture: fixture.id,
        identicalNetlist: fixture.path,
        provenance: {
          source: fixture.source,
          license: fixture.license,
          revision: fixture.revision,
          sha256: createHash('sha256').update(netlist).digest('hex'),
        },
        command: `ngspice -b -r <temporary-raw-path> ${fixture.path}`,
        convergence: { ngspice: 'success', spiceTs: 'success' },
        runtimeMs: { ngspice: ngspiceRuntimeMs, spiceTs: spiceTsRuntimeMs },
        poles: metrics(result.poleZero.poles, ngspice.poles),
        zeros: metrics(result.poleZero.zeros, ngspice.zeros),
      });
    } catch (error) {
      failures.push({ fixture: fixture.id, simulator: 'spice-ts', error: message(error) });
    }
  }

  console.log(JSON.stringify({
    referenceSimulator: version,
    spiceTsRuntime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      command: 'pnpm exec tsx benchmarks/pole-zero/compare.ts',
    },
    comparisons,
    failures,
    losses: failures,
    unsupported: [
      '.pz input reference output 0 cur pz',
      '.pz input 0 output reference cur pz',
      '.pz voltage input with non-RLC devices',
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
    rmsAbsoluteError: rootMeanSquare(absoluteErrors),
    maximumRelativeError: Math.max(...relativeErrors, 0),
    rmsRelativeError: rootMeanSquare(relativeErrors),
    spiceTs: actual,
    ngspice: expected,
  };
}

function rootMeanSquare(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

function order(values: PoleZeroValue[]): PoleZeroValue[] {
  return values.map(value => ({ ...value }))
    .sort((left, right) => left.real - right.real || left.imaginary - right.imaginary);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
