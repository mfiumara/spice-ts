#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate } from '../../packages/core/src/index.js';

interface NoiseData {
  frequencies: number[];
  output: number[];
  input: number[];
  integratedOutput: number;
  integratedInput: number;
}

void main();

async function main(): Promise<void> {
  const fixturePath = resolve('benchmarks/bjt-noise/bjt-noise.cir');
  const fixture = readFileSync(fixturePath);
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-bjt-noise-'));
  try {
    const rawPath = join(workspace, 'ngspice.raw');
    const ngspiceVersionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const ngspiceVersion = ngspiceVersionOutput.match(/ngspice-(\d+)/)?.[0]
      ?? 'ngspice (version not parsed)';
    const ngspiceStart = performance.now();
    execFileSync('ngspice', ['-b', '-r', rawPath, fixturePath], {
      encoding: 'utf8', timeout: 30_000,
    });
    const ngspiceRuntimeMilliseconds = performance.now() - ngspiceStart;
    const reference = readNoiseRaw(rawPath);

    const spiceStart = performance.now();
    const result = await simulate(fixture.toString('utf8'));
    const spiceTsRuntimeMilliseconds = performance.now() - spiceStart;
    if (!result.noise) throw new Error('spice-ts returned no noise result');
    const actual: NoiseData = {
      frequencies: result.noise.frequencies,
      output: result.noise.outputNoiseDensity,
      input: result.noise.inputNoiseDensity,
      integratedOutput: required(result.noise.integratedOutputNoise, 'integrated output noise'),
      integratedInput: required(result.noise.integratedInputNoise, 'integrated input noise'),
    };
    assertMatchedFrequencies(actual.frequencies, reference.frequencies);

    const report = JSON.stringify({
      fixture: 'benchmarks/bjt-noise/bjt-noise.cir',
      sha256: createHash('sha256').update(fixture).digest('hex'),
      source: {
        url: 'https://github.com/mfiumara/spice-ts/issues/199',
        revision: 'issue-199 project-authored reference fixture',
        licence: 'MIT',
      },
      identicalNetlistForBothEngines: true,
      commands: {
        ngspice: 'ngspice -b -r <temporary-raw-path> benchmarks/bjt-noise/bjt-noise.cir',
        spiceTs: 'pnpm exec tsx benchmarks/bjt-noise/compare.ts',
      },
      versions: {
        reference: ngspiceVersion,
        spiceTsBaseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        spiceTsWorkingTreeDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
        node: process.version,
      },
      machine: {
        platform: platform(), release: release(), architecture: process.arch,
        cpu: cpus()[0]?.model ?? 'unknown',
      },
      convergence: { ngspice: 'success', spiceTs: 'success' },
      runtimeMilliseconds: {
        ngspiceProcess: ngspiceRuntimeMilliseconds,
        spiceTsInProcess: spiceTsRuntimeMilliseconds,
        caveat: 'Different process boundaries; reported honestly, not a speed claim.',
      },
      matchedPointCount: reference.frequencies.length,
      errors: {
        outputDensity: metrics(actual.output, reference.output),
        inputDensity: metrics(actual.input, reference.input),
        integratedOutput: metrics([actual.integratedOutput], [reference.integratedOutput]),
        integratedInput: metrics([actual.integratedInput], [reference.integratedInput]),
      },
      losses: [
        'Only BJT LEVEL=1 collector and base shot noise is supported.',
        'Internal RB/RC/RE thermal noise, KF/AF flicker noise, junction-capacitance noise, and temperature variation remain unsupported.',
        'Runtime values are not directly comparable because ngspice includes process startup.',
      ],
      redReceipt: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts => 7 failed, 30 passed; BJT noise rejected before implementation',
    }, null, 2);

    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex >= 0) {
      const outputPath = process.argv[outputIndex + 1];
      if (!outputPath) throw new Error('--output requires a path');
      writeFileSync(resolve(outputPath), `${report}\n`);
    }
    console.log(report);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function readNoiseRaw(path: string): NoiseData {
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

function assertMatchedFrequencies(actual: number[], expected: number[]): void {
  if (actual.length !== expected.length) throw new Error('frequency count mismatch');
  actual.forEach((value, index) => {
    if (Math.abs(value - expected[index]) > Math.abs(expected[index]) * 1e-12) {
      throw new Error(`frequency mismatch at ${index}: ${value} vs ${expected[index]}`);
    }
  });
}

function metrics(actual: number[], expected: number[]): object {
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

function required(value: number | undefined, label: string): number {
  if (value === undefined) throw new Error(`spice-ts returned no ${label}`);
  return value;
}
