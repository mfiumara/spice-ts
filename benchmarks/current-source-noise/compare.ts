#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate } from '../../packages/core/src/index.js';

interface NoiseData {
  frequencies: number[];
  output: number[];
  input: number[];
  integratedOutput: number;
  integratedInput: number;
}

const fixtures = [
  'benchmarks/corpus/classic/fixtures/spice3f5/resnoise.cir',
  'benchmarks/corpus/classic/fixtures/spice3f5/bjtnoise.cir',
];

void main();

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-current-source-noise-'));
  try {
    const ngspiceVersionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const ngspiceVersion = ngspiceVersionOutput.match(/ngspice-(\d+)/)?.[0]
      ?? 'ngspice (version not parsed)';
    const fixtureReports = [];

    for (const fixtureName of fixtures) {
      const fixturePath = resolve(fixtureName);
      const original = readFileSync(fixturePath);
      const adapted = adaptClassicFixture(original.toString('utf8'));
      const stem = basename(fixturePath, '.cir');
      const adaptedPath = join(workspace, `${stem}.cir`);
      const rawPath = join(workspace, `${stem}.raw`);
      writeFileSync(adaptedPath, adapted);

      const ngspiceStart = performance.now();
      execFileSync('ngspice', ['-b', '-r', rawPath, adaptedPath], {
        encoding: 'utf8', timeout: 30_000,
      });
      const ngspiceRuntimeMilliseconds = performance.now() - ngspiceStart;
      const reference = readNoiseRaw(rawPath);

      const spiceStart = performance.now();
      const result = await simulate(adapted);
      const spiceTsRuntimeMilliseconds = performance.now() - spiceStart;
      if (!result.noise) throw new Error(`spice-ts returned no noise result for ${fixtureName}`);
      const actual: NoiseData = {
        frequencies: result.noise.frequencies,
        output: result.noise.outputNoiseDensity,
        input: result.noise.inputNoiseDensity,
        integratedOutput: required(result.noise.integratedOutputNoise, 'integrated output noise'),
        integratedInput: required(result.noise.integratedInputNoise, 'integrated input noise'),
      };
      assertMatchedFrequencies(actual.frequencies, reference.frequencies);

      fixtureReports.push({
        fixture: fixtureName,
        originalSha256: sha256(original),
        adaptedSha256: sha256(Buffer.from(adapted)),
        identicalAdaptedNetlistForBothEngines: true,
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
      });
    }

    const report = JSON.stringify({
      source: {
        name: 'Berkeley SPICE3f5 classic noise fixtures',
        url: 'https://github.com/obernin/spice/tree/3d9360bef370b432e473edb0c4333707d545a55f/examples',
        revision: '3d9360bef370b432e473edb0c4333707d545a55f',
        licence: 'Berkeley SPICE grant',
        notice: 'benchmarks/corpus/classic/COPYRIGHT.txt',
      },
      adaptation: [
        'The checked-in classic fixtures remain byte-for-byte unchanged.',
        'For both engines, the runner removes only the legacy trailing noise-summary interval and output-only .print noise card because spice-ts does not yet parse those directives.',
        'The circuit topology, device cards, values, noise sweep, and input source are unchanged; each engine receives the same adapted bytes.',
      ],
      commands: {
        ngspice: 'ngspice -b -r <temporary-raw-path> <identical-temporary-adapted-deck>',
        spiceTs: 'pnpm exec tsx benchmarks/current-source-noise/compare.ts',
      },
      versions: {
        reference: ngspiceVersion,
        spiceTsRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        spiceTsWorkingTreeDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
        node: process.version,
      },
      machine: {
        platform: platform(), release: release(), architecture: process.arch,
        cpu: cpus()[0]?.model ?? 'unknown',
      },
      fixtures: fixtureReports,
      unsupported: await verifyUnsupportedForms(),
      losses: [
        'Every non-zero residual is retained in the per-fixture errors; no tolerance or circuit value is tuned per engine.',
        'Legacy .noise summary intervals and .print noise output cards require the documented common adaptation.',
        'Current-valued noise outputs, dependent-source input referral, differential semiconductor noise, stepped noise, and temperature cards remain explicitly unsupported.',
        'Runtime values are not directly comparable because ngspice includes process startup.',
      ],
      redReceipt: "Focused test failed before implementation: InvalidCircuitError: .noise input source 'I1' is not an independent voltage source (1 failed, 48 skipped).",
      potetoModeReceipt: 'benchmarks/current-source-noise/POTETO.md',
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

function adaptClassicFixture(source: string): string {
  return source
    .split('\n')
    .filter(line => !line.toLowerCase().startsWith('.print noise'))
    .map(line => line.toLowerCase().startsWith('.noise ')
      ? line.replace(/\s+1\s*$/, '')
      : line)
    .join('\n');
}

async function verifyUnsupportedForms(): Promise<Array<{ form: string; status: string; error: string }>> {
  const cases = [
    {
      form: 'current-valued output',
      deck: 'unsupported current output\nV1 in 0 AC 1\nR1 in 0 1k\n.noise i(V1) V1 dec 3 100 10k',
      expected: /Unsupported \.noise form/,
    },
    {
      form: 'dependent-source input referral',
      deck: 'unsupported dependent input\nV1 in 0 AC 1\nE1 out 0 in 0 2\nR1 out 0 1k\n.noise v(out) E1 dec 3 100 10k',
      expected: /not an independent voltage or current source/,
    },
    {
      form: 'differential BJT noise',
      deck: 'unsupported differential BJT\nV1 in 0 DC 1 AC 1\nR1 in outp 1k\nR2 outn 0 1k\nQ1 outp in outn QMOD\n.model QMOD NPN (LEVEL=1 IS=1e-14 BF=100)\n.noise v(outp,outn) V1 dec 3 100 10k',
      expected: /differential voltage output only supports resistor noise/,
    },
    {
      form: 'stepped noise',
      deck: 'unsupported stepped noise\nI1 in 0 AC 1\nR1 in 0 1k\n.noise v(in) I1 dec 3 100 10k\n.step param R1 list 1k 2k',
      expected: /\.step cannot be combined with \.noise/,
    },
    {
      form: 'temperature card',
      deck: 'unsupported noise temperature\nI1 in 0 AC 1\nR1 in 0 1k\n.noise v(in) I1 dec 3 100 10k\n.temp 50',
      expected: /Unsupported dot command: '\.temp'/,
    },
  ];
  const results = [];
  for (const testCase of cases) {
    try {
      await simulate(testCase.deck);
      throw new Error(`${testCase.form} unexpectedly succeeded`);
    } catch (error) {
      const message = (error as Error).message;
      if (!testCase.expected.test(message)) throw error;
      results.push({ form: testCase.form, status: 'explicitly rejected', error: message });
    }
  }
  return results;
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

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
