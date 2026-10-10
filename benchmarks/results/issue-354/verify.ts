#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Circuit } from '../../../packages/core/src/circuit.js';
import { parse } from '../../../packages/core/src/parser/index.js';
import { simulate } from '../../../packages/core/src/simulate.js';
import type { DCSweepAnalysis } from '../../../packages/core/src/types.js';

const FIXTURE_PATH = 'benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir';
const FIXTURE_SHA256 = 'de57231ef8879e785b07068db662bfa5ecfde8734011b88b09f319b826242e92';

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function pointCount(start: number, stop: number, step: number): number {
  return Math.round((stop - start) / step) + 1;
}

async function ngspicePointCount(fixturePath: string): Promise<{ version: string; points: number }> {
  const directory = await mkdtemp(join(tmpdir(), 'spice-ts-issue-354-'));
  try {
    await writeFile(join(directory, '.spiceinit'), 'set filetype=ascii\n');
    const rawPath = join(directory, 'vbic-fo.raw');
    const run = spawnSync('ngspice', ['-b', '-r', rawPath, resolve(fixturePath)], {
      cwd: directory,
      env: { ...process.env, HOME: directory },
      encoding: 'utf8',
    });
    if (run.error || run.status !== 0) {
      throw new Error(`ngspice failed: ${run.error?.message ?? run.stderr}`);
    }
    const raw = await readFile(rawPath, 'utf8');
    const match = raw.match(/^No\. Points:\s+(\d+)/m);
    if (!match) throw new Error('ngspice raw output has no point count');
    const versionRun = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
    const versionText = `${versionRun.stdout ?? ''}\n${versionRun.stderr ?? ''}`;
    return {
      version: versionText.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      points: Number(match[1]),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function syntheticResult(): Promise<{
  points: number;
  primary: number[];
  secondary: number[];
  textProgrammaticAgreement: boolean;
}> {
  const netlist = [
    'Issue #354 two-source grid',
    'VC collector 0 0',
    'VB base 0 0',
    'R1 collector base 1k',
    '.dc VC 0 5 50m VB 700m 1 50m',
    '.end',
  ].join('\n');
  const text = (await simulate(netlist)).dcSweep!;
  const circuit = new Circuit();
  circuit.addVoltageSource('VC', 'collector', '0', { dc: 0 });
  circuit.addVoltageSource('VB', 'base', '0', { dc: 0 });
  circuit.addResistor('R1', 'collector', 'base', 1000);
  circuit.addAnalysis('dc', {
    source: 'VC', start: 0, stop: 5, step: 0.05,
    secondary: { source: 'VB', start: 0.7, stop: 1, step: 0.05 },
  });
  const programmatic = (await simulate(circuit)).dcSweep!;
  const primary = [...text.sweepValues];
  const secondary = [...text.secondarySweepValues!];
  return {
    points: primary.length,
    primary,
    secondary,
    textProgrammaticAgreement: JSON.stringify(primary) === JSON.stringify([...programmatic.sweepValues])
      && JSON.stringify(secondary) === JSON.stringify([...programmatic.secondarySweepValues!]),
  };
}

async function main(): Promise<void> {
  const fixture = await readFile(resolve(FIXTURE_PATH));
  const digest = sha256(fixture);
  if (digest !== FIXTURE_SHA256) throw new Error(`fixture SHA-256 mismatch: ${digest}`);
  const analysis = parse(fixture.toString('utf8')).analyses[0] as DCSweepAnalysis;
  if (analysis.type !== 'dc' || analysis.secondary === undefined) {
    throw new Error('two-source .dc analysis was not preserved');
  }
  const primaryPoints = pointCount(analysis.start, analysis.stop, analysis.step);
  const secondaryPoints = pointCount(
    analysis.secondary.start, analysis.secondary.stop, analysis.secondary.step,
  );
  const [ngspice, synthetic] = await Promise.all([
    ngspicePointCount(FIXTURE_PATH),
    syntheticResult(),
  ]);
  if (ngspice.points !== 707 || synthetic.points !== 707 || !synthetic.textProgrammaticAgreement) {
    throw new Error('two-source DC grid verification failed');
  }

  const report = {
    schemaVersion: 'spice-ts-issue-354/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/354',
    fixture: {
      path: FIXTURE_PATH,
      bytes: fixture.byteLength,
      sha256: digest,
      adaptation: 'none',
    },
    commands: {
      verify: 'pnpm exec tsx benchmarks/results/issue-354/verify.ts --output benchmarks/results/issue-354/report.json',
      ngspice: 'ngspice -b -r <temporary-ascii-raw> benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir',
      spiceTs: '@spice-ts/core simulate(<synthetic deck with the unchanged fixture .dc grid>)',
    },
    before: {
      parsedPrimaryPoints: 101,
      parsedSecondarySweep: false,
      returnedPoints: 101,
      evidence: 'Focused RED retained only VC 0..5 by 0.05 and omitted VB 0.7..1 by 0.05.',
    },
    reference: {
      engine: ngspice.version,
      unchangedFixturePoints: ngspice.points,
    },
    after: {
      parsedAnalysis: analysis,
      primaryPoints,
      secondaryPoints,
      cartesianPoints: synthetic.points,
      ordering: 'secondary outer/slow, primary inner/fast; flatIndex = secondaryIndex * primaryPoints + primaryIndex',
      orderingSamples: [0, 100, 101, 706].map(index => ({
        index,
        primary: synthetic.primary[index],
        secondary: synthetic.secondary[index],
      })),
      textProgrammaticAgreement: synthetic.textProgrammaticAgreement,
    },
    contract: {
      supported: 'exactly one or two independent voltage/current source ranges; finite nonzero steps directed toward stop',
      unsupported: 'partial secondary ranges, trailing arguments, and three or more dimensions are rejected explicitly',
      resultCoordinates: 'sweepValues is the point-aligned primary coordinate; secondarySweepValues is the point-aligned outer coordinate when present',
    },
    losses: [
      'The unchanged vbic-fo fixture still cannot execute in spice-ts because VBIC LEVEL=4 model parameters are outside issue #354.',
      'No waveform-error or runtime superiority claim is made; this receipt verifies grid parsing, ordering, and point count only.',
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
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
