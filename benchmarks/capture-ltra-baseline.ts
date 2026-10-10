#!/usr/bin/env tsx
/** Capture or verify the four unchanged issue #308 O/LTRA baselines. */
import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { cpus, platform, release } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RELATIVE_ZERO_THRESHOLD,
  compareFixture,
  type ComparisonFixture,
  type EngineRun,
  type FixtureReport,
} from './comparison-harness.js';

const SCHEMA_VERSION = 'spice-ts-issue-308-pre-change-baseline/v1';
const NOT_COMPUTED_REASON = 'spice-ts did not produce a comparable transient waveform';

interface FixtureDefinition extends Omit<ComparisonFixture, 'netlist'> {
  sourcePath: string;
}

interface CapturedFixture extends FixtureReport {
  sourcePath: string;
  perSignalLosses: Record<string, unknown>;
}

const FIXTURES: FixtureDefinition[] = [
  {
    name: 'ngspice-ltra-line-transient',
    analysis: 'tran',
    sourcePath: 'benchmarks/corpus/ngspice/fixtures/tests/transmission/ltra1_1_line.cir',
    signals: ['v(2)', 'v(3)'],
  },
  {
    name: 'classic-lossy-line-24-inch',
    analysis: 'tran',
    sourcePath: 'benchmarks/corpus/classic/fixtures/spice3f5/ltra_1.cir',
    signals: ['v(1)', 'v(2)', 'v(3)'],
  },
  {
    name: 'classic-lossy-line-aluminium',
    analysis: 'tran',
    sourcePath: 'benchmarks/corpus/classic/fixtures/spice3f5/ltra_2.cir',
    signals: ['v(1)', 'v(2)', 'v(3)'],
  },
  {
    name: 'classic-coupled-lossy-lines',
    analysis: 'tran',
    sourcePath: 'benchmarks/corpus/classic/fixtures/spice3f5/ltra_3.cir',
    signals: ['v(1)', 'v(2)', 'v(3)', 'v(4)', 'v(5)'],
  },
];

function commandOutput(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function ngspiceVersion(): string {
  const output = commandOutput('ngspice', ['--version']);
  return output.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? output.split('\n')[0];
}

function pointCount(run: EngineRun): number | null {
  return run.status === 'success' ? run.series.grid.length : null;
}

function retainRequestedSignals(run: EngineRun, signals: string[]): EngineRun & { pointCount: number | null } {
  if (run.status !== 'success') return { ...run, pointCount: null };
  const retained = Object.fromEntries(signals.map(signal => {
    const name = signal.toLowerCase();
    return [name, run.series.signals[name]];
  }));
  return {
    ...run,
    series: { ...run.series, signals: retained },
    pointCount: pointCount(run),
  };
}

async function captureFixtures(): Promise<CapturedFixture[]> {
  const captures: CapturedFixture[] = [];
  for (const definition of FIXTURES) {
    const netlist = readFileSync(resolve(definition.sourcePath), 'utf8');
    const report = await compareFixture({ ...definition, netlist });
    const spiceTs = retainRequestedSignals(report.spiceTs, definition.signals);
    const ngspice = retainRequestedSignals(report.ngspice, definition.signals);
    const perSignalLosses = Object.fromEntries(definition.signals.map(signal => [
      signal,
      report.metrics?.signals[signal] ?? {
        status: 'not-computed',
        reason: NOT_COMPUTED_REASON,
        absoluteError: null,
        relativeError: null,
      },
    ]));
    captures.push({ ...report, spiceTs, ngspice, sourcePath: definition.sourcePath, perSignalLosses });
  }
  return captures;
}

function macOSMetadata(): Record<string, string> {
  if (platform() !== 'darwin') return {};
  return {
    macOSProductVersion: commandOutput('sw_vers', ['-productVersion']),
    macOSBuildVersion: commandOutput('sw_vers', ['-buildVersion']),
  };
}

async function createCapture() {
  const packageJson = JSON.parse(readFileSync(resolve('packages/core/package.json'), 'utf8')) as { version: string };
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repository: {
      headSha: commandOutput('git', ['rev-parse', 'HEAD']),
      dirtyFixturePolicy: 'fixture bytes are read unchanged from the recorded source paths',
    },
    capture: {
      command: ['pnpm', 'exec', 'tsx', 'benchmarks/capture-ltra-baseline.ts', 'benchmarks/results/issue-308/baseline.json'],
      buildCommand: ['pnpm', '-C', 'packages/core', 'build'],
      harness: 'benchmarks/comparison-harness.ts',
    },
    environment: {
      platform: platform(),
      arch: process.arch,
      node: process.version,
      cpu: cpus()[0]?.model ?? 'unknown',
      operatingSystem: `${platform()} ${release()}`,
      cpuCount: cpus().length,
      architecture: process.arch,
      ...macOSMetadata(),
    },
    tools: {
      spiceTs: { version: packageJson.version, command: ['pnpm', 'bench:compare:v2'] },
      ngspice: { version: ngspiceVersion(), command: ['ngspice', '-b', '-r', '<raw>', '<netlist>'] },
    },
    alignment: {
      targetGrid: 'spice-ts',
      interpolation: 'linear',
      relativeZeroThreshold: RELATIVE_ZERO_THRESHOLD,
    },
    fixtures: await captureFixtures(),
  };
}

function stableEngine(run: EngineRun & { pointCount?: number | null }) {
  const { runtimeMs: _runtimeMs, ...stable } = run;
  return stable;
}

function stableFixture(fixture: CapturedFixture) {
  return {
    ...fixture,
    spiceTs: stableEngine(fixture.spiceTs),
    ngspice: stableEngine(fixture.ngspice),
  };
}

async function verify(path: string): Promise<void> {
  const expected = JSON.parse(readFileSync(resolve(path), 'utf8')) as {
    schemaVersion: string;
    fixtures: CapturedFixture[];
  };
  assert.equal(expected.schemaVersion, SCHEMA_VERSION, 'baseline schema version');
  assert.equal(expected.fixtures.length, FIXTURES.length, 'baseline fixture count');
  const actual = await captureFixtures();
  assert.deepEqual(actual.map(stableFixture), expected.fixtures.map(stableFixture));
  const points = actual.map(fixture => pointCount(fixture.ngspice)).join('/');
  const signals = actual.reduce((count, fixture) => count + fixture.signals.length, 0);
  process.stdout.write(`Verified ${actual.length} fixtures, ${signals} waveforms, ngspice points ${points}\n`);
}

async function main(): Promise<void> {
  if (process.argv[2] === '--verify') {
    const path = process.argv[3];
    if (!path) throw new Error('--verify requires a baseline JSON path');
    await verify(path);
    return;
  }
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error('usage: capture-ltra-baseline.ts <output.json> | --verify <baseline.json>');
  const report = await createCapture();
  writeFileSync(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Captured ${report.fixtures.length} fixtures to ${outputPath}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
