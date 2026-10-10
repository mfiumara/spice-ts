#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate } from '../../packages/core/src/index.js';
import { assertMatchedFrequencies, metrics, readNoiseRaw, required, type NoiseData } from '../noise-raw.js';

void main();

async function main(): Promise<void> {
  const fixturePath = resolve(
    'benchmarks/bjt-internal-resistance-noise/bjt-internal-resistance-noise.cir',
  );
  const fixture = readFileSync(fixturePath);
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-bjt-rnoise-'));
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
      fixture: 'benchmarks/bjt-internal-resistance-noise/bjt-internal-resistance-noise.cir',
      sha256: createHash('sha256').update(fixture).digest('hex'),
      source: {
        url: 'https://github.com/mfiumara/spice-ts/issues/243',
        revision: 'issue-243 project-authored reference fixture',
        licence: 'MIT',
      },
      identicalNetlistForBothEngines: true,
      commands: {
        ngspice: 'ngspice -b -r <temporary-raw-path> benchmarks/bjt-internal-resistance-noise/bjt-internal-resistance-noise.cir',
        spiceTs: 'pnpm exec tsx benchmarks/bjt-internal-resistance-noise/compare.ts',
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
      unsupported: {
        flickerNoise: ['KF', 'AF'],
        junctionCapacitance: ['CJE', 'CJC'],
        temperature: ['.temp', 'temperature sweeps'],
        steppedNoise: ['.step with .noise'],
        outputForms: ['differential voltage', 'current output'],
        modelLevels: ['non-level-1 BJT'],
        broaderGummelPoon: ['RBM', 'IRB', 'junction capacitances', 'transit-time forms'],
      },
      losses: [
        'Matched-point residuals are retained in errors; no non-zero residual is omitted.',
        'KF/AF, junction-capacitance, temperature, stepped, differential/current-output, non-level-1, and broader Gummel-Poon forms remain unsupported.',
        'Runtime values are not directly comparable because ngspice includes process startup.',
      ],
      tdd: {
        redCommit: 'a4cd77f',
        redCommand: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts',
        redResult: '3 failed, 35 passed; RB, RC, and RE were explicitly rejected',
        greenCommand: 'pnpm -C packages/core exec vitest run src/analysis/noise.test.ts src/devices/bjt.test.ts',
        greenResult: '44 passed',
      },
      potetoReceipt: 'benchmarks/bjt-internal-resistance-noise/POTETO.md',
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
