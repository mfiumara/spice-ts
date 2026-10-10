#!/usr/bin/env tsx
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate, type TransferFunctionResult } from '../../packages/core/src/index.js';

interface Sample {
  stepValue: number;
  spiceTs: TransferFunctionResult;
  ngspice: TransferFunctionResult;
}

const fixturePath = 'benchmarks/stepped-transfer-function/stepped-divider.cir';
const reportPath = 'benchmarks/stepped-transfer-function/report.json';

void main();

async function main(): Promise<void> {
  const fixture = readFileSync(resolve(fixturePath), 'utf8');
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-stepped-tf-'));
  try {
    writeFileSync(join(workspace, '.spiceinit'), 'set filetype=ascii\n');
    const versionOutput = execFileSync('ngspice', ['--version'], { encoding: 'utf8' });
    const reference = versionOutput.match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';
    const nativeStepAttempt = spawnSync('ngspice', ['-b', resolve(fixturePath)], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    const nativeStepMessage = `${nativeStepAttempt.stdout}${nativeStepAttempt.stderr}`;
    if (nativeStepAttempt.status === 0 || !nativeStepMessage.includes("unimplemented dot command '.step'")) {
      throw new Error('ngspice stepped-TF boundary changed; update the honest comparison workflow');
    }

    const spiceTsStart = performance.now();
    const stepped = await simulate(fixture, { stepWorkers: false });
    const spiceTsSteppedMilliseconds = performance.now() - spiceTsStart;
    if (!stepped.steps?.length) throw new Error('spice-ts returned no stepped results');

    let ngspiceProcessMilliseconds = 0;
    let spiceTsExpandedMilliseconds = 0;
    const samples: Sample[] = [];
    for (const step of stepped.steps) {
      if (!step.transferFunction) throw new Error(`spice-ts returned no .tf result at ${step.paramValue}`);
      const pointNetlist = expandPoint(fixture, step.paramValue);
      const inputPath = join(workspace, `r2-${step.paramValue}.cir`);
      const rawPath = join(workspace, `r2-${step.paramValue}.raw`);
      writeFileSync(inputPath, pointNetlist);

      const ngStart = performance.now();
      execFileSync('ngspice', ['-b', '-r', rawPath, inputPath], {
        cwd: workspace,
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      ngspiceProcessMilliseconds += performance.now() - ngStart;

      const nativeStart = performance.now();
      const native = await simulate(pointNetlist);
      spiceTsExpandedMilliseconds += performance.now() - nativeStart;
      if (!native.transferFunction) throw new Error(`spice-ts expanded deck returned no .tf result at ${step.paramValue}`);
      assertSame(step.transferFunction, native.transferFunction, step.paramValue);
      samples.push({
        stepValue: step.paramValue,
        spiceTs: step.transferFunction,
        ngspice: readTransferFunction(rawPath),
      });
    }

    const report = {
      fixture: fixturePath,
      sha256: createHash('sha256').update(fixture).digest('hex'),
      source: {
        url: 'https://github.com/mfiumara/spice-ts/issues/208',
        revision: 'issue-208 project-authored reference fixture',
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
      identicalPerPointNetlistForBothEngines: true,
      directStepSupport: {
        spiceTs: 'success',
        ngspice: "unsupported: unimplemented dot command '.step'",
        method: 'The committed grid is expanded deterministically once per value; each expanded deck is supplied byte-identically to both engines. The direct spice-ts grid is checked against those expanded runs.',
      },
      commands: {
        comparison: 'pnpm bench:stepped-tf',
        ngspice: `ngspice -b -r <temporary-raw-path> <byte-identical-expanded-${fixturePath}>`,
      },
      convergence: {
        spiceTsDirectStep: 'success',
        spiceTsExpandedPoints: samples.map(sample => ({ stepValue: sample.stepValue, status: 'success' })),
        ngspiceExpandedPoints: samples.map(sample => ({ stepValue: sample.stepValue, status: 'success' })),
      },
      stepOrder: samples.map(sample => sample.stepValue),
      matchedStepCount: samples.length,
      runtimeMilliseconds: {
        spiceTsDirectStep: spiceTsSteppedMilliseconds,
        spiceTsExpandedPoints: spiceTsExpandedMilliseconds,
        ngspiceExpandedProcesses: ngspiceProcessMilliseconds,
        caveat: 'ngspice includes one process startup per point; runtimes are reported honestly and are not a speed claim.',
      },
      errors: {
        transfer: metrics(samples, result => result.transfer),
        inputResistance: metrics(samples, result => result.inputResistance),
        outputResistance: metrics(samples, result => result.outputResistance),
      },
      samples: samples.map(sample => ({
        stepValue: sample.stepValue,
        spiceTs: scalarResult(sample.spiceTs),
        ngspice: scalarResult(sample.ngspice),
      })),
      unsupported: [
        { form: 'multiple .step directives', reason: 'nested or multi-dimensional stepping' },
        { form: '.tf V(out,ref) source', reason: 'differential voltage output' },
        { form: '.tf I(branch) source', reason: 'current output' },
        { form: '.tf V(out)', reason: 'missing independent input source' },
        { form: '.step combined with .noise, .pz, or .sens', reason: 'analysis outside the bounded stepped slice' },
        { form: 'ngspice-47 direct .step', reason: "ngspice-47 reports unimplemented dot command '.step'" },
      ],
      losses: [
        'ngspice-47 cannot execute the committed .step directive directly; the harness reports this and compares byte-identical deterministic single-point expansions instead.',
        'Any non-zero max/RMS residual in errors is retained.',
        'Runtime process boundaries differ and do not support a speed or superiority claim.',
      ],
      redReceipt: 'pnpm -C packages/core exec vitest run src/analysis/transfer-function.test.ts => 4 failed, 11 passed before implementation',
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(resolve(reportPath), json);
    process.stdout.write(json);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function expandPoint(fixture: string, value: number): string {
  const withValue = fixture.replace(/^R2\s+out\s+0\s+\S+$/m, `R2 out 0 ${value}`);
  return withValue.replace(/^\.step\b.*$/m, `* deterministic expansion: R2=${value}`);
}

function readTransferFunction(path: string): TransferFunctionResult {
  const raw = readFileSync(path, 'utf8');
  const values = raw.slice(raw.indexOf('Values:\n') + 'Values:\n'.length)
    .trim().split(/\s+/).filter((_, index) => index !== 0).map(Number);
  if (values.length !== 3 || values.some(value => !Number.isFinite(value))) {
    throw new Error(`invalid ngspice transfer-function raw data: ${path}`);
  }
  return { transfer: values[0], inputResistance: values[1], outputResistance: values[2] } as TransferFunctionResult;
}

function assertSame(left: TransferFunctionResult, right: TransferFunctionResult, stepValue: number): void {
  for (const field of ['transfer', 'inputResistance', 'outputResistance'] as const) {
    if (left[field] !== right[field]) {
      throw new Error(`direct/expanded spice-ts mismatch at R2=${stepValue} for ${field}`);
    }
  }
}

function scalarResult(result: TransferFunctionResult): object {
  return {
    transfer: result.transfer,
    inputResistance: result.inputResistance,
    outputResistance: result.outputResistance,
  };
}

function metrics(samples: Sample[], select: (result: TransferFunctionResult) => number): object {
  const absolute = samples.map(sample => Math.abs(select(sample.spiceTs) - select(sample.ngspice)));
  const relative = absolute.map((error, index) => error / Math.max(Math.abs(select(samples[index].ngspice)), 1e-30));
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
