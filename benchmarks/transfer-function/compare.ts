#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate, TransferFunctionResult } from '../../packages/core/src/index.js';

const fixturePath = 'benchmarks/transfer-function/current-output.cir';
const reportPath = 'benchmarks/transfer-function/report.json';

void main();

async function main(): Promise<void> {
  const fixtureBytes = readFileSync(resolve(fixturePath));
  const fixture = fixtureBytes.toString('utf8');
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-tf-current-'));
  try {
    const inputPath = join(workspace, 'current-output.cir');
    const rawPath = join(workspace, 'current-output.raw');
    writeFileSync(inputPath, fixtureBytes);
    writeFileSync(join(workspace, '.spiceinit'), 'set filetype=ascii\n');

    const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const reference = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';

    const spiceTsStart = performance.now();
    const result = await simulate(fixture);
    const spiceTsMilliseconds = performance.now() - spiceTsStart;
    if (!result.transferFunction) throw new Error('spice-ts returned no .tf result');

    const ngspiceStart = performance.now();
    execFileSync('ngspice', ['-b', '-r', rawPath, inputPath], {
      cwd: workspace,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ngspiceMilliseconds = performance.now() - ngspiceStart;
    const ngspice = readTransferFunction(rawPath);
    const spiceTs = result.transferFunction;

    const report = {
      fixture: fixturePath,
      sha256: createHash('sha256').update(fixtureBytes).digest('hex'),
      source: {
        url: 'https://github.com/mfiumara/spice-ts/issues/263',
        revision: 'issue-263 project-authored bounded current-output reference fixture',
        licence: 'MIT',
      },
      referenceSimulator: reference,
      machine: {
        platform: platform(),
        release: release(),
        architecture: arch(),
        cpu: cpus()[0]?.model ?? 'unknown',
        node: process.version,
      },
      commands: {
        comparison: 'pnpm tsx benchmarks/transfer-function/compare.ts',
        ngspice: `ngspice -b -r <temporary-raw-path> <byte-identical-${fixturePath}>`,
      },
      identicalNetlistBytesForBothEngines: true,
      netlistByteCount: fixtureBytes.byteLength,
      resultCounts: { spiceTs: 1, ngspice: 1, matched: 1 },
      convergence: { spiceTs: 'success', ngspice: 'success' },
      runtimeMilliseconds: {
        spiceTs: spiceTsMilliseconds,
        ngspiceProcess: ngspiceMilliseconds,
        caveat: 'ngspice includes process startup; runtimes are reported honestly and are not a speed claim.',
      },
      errors: {
        transfer: metrics(spiceTs.transfer, ngspice.transfer),
        inputResistance: metrics(spiceTs.inputResistance, ngspice.inputResistance),
        outputResistance: metrics(spiceTs.outputResistance, ngspice.outputResistance),
      },
      samples: [{
        output: 'I(Vsense)',
        input: 'V1',
        spiceTs: scalarResult(spiceTs),
        ngspice: scalarResult(ngspice),
      }],
      exclusions: [
        '.tf current outputs other than an independent voltage-source branch',
        '.tf differential or nested outputs',
        'multiple output dimensions and unsupported stepped combinations',
      ],
      losses: [
        'The bounded current-output corpus contains one matched scalar result.',
        'Current output is limited to independent voltage-source branches; resistor, inductor, and dependent-source branch currents remain unsupported.',
        'Any non-zero max/RMS residual in errors is retained.',
        'Runtime process boundaries differ and do not support a speed or superiority claim.',
      ],
      redReceipt: 'pnpm -C packages/core exec vitest run src/analysis/transfer-function.test.ts => 4 failed, 14 passed before implementation',
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(resolve(reportPath), json);
    process.stdout.write(json);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function readTransferFunction(path: string): TransferFunctionResult {
  const raw = readFileSync(path, 'utf8');
  const marker = 'Values:\n';
  const valuesStart = raw.indexOf(marker);
  if (valuesStart < 0) throw new Error(`ngspice raw output has no Values section: ${path}`);
  const values = raw.slice(valuesStart + marker.length)
    .trim().split(/\s+/).filter((_, index) => index !== 0).map(Number);
  if (values.length !== 3 || values.some(value => !Number.isFinite(value))) {
    throw new Error(`invalid ngspice transfer-function raw data: ${path}`);
  }
  return new TransferFunctionResult(undefined, 'V1', values[0], values[1], values[2], 'Vsense');
}

function scalarResult(result: TransferFunctionResult): object {
  return {
    transfer: result.transfer,
    inputResistance: result.inputResistance,
    outputResistance: result.outputResistance,
  };
}

function metrics(actual: number, expected: number): object {
  const absolute = Math.abs(actual - expected);
  const relative = absolute / Math.max(Math.abs(expected), 1e-30);
  return {
    maximumAbsoluteError: absolute,
    rmsAbsoluteError: absolute,
    maximumRelativeError: relative,
    rmsRelativeError: relative,
  };
}
