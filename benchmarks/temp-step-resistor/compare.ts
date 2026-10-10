#!/usr/bin/env tsx
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { simulate } from '../../packages/core/src/index.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../corpus/classic/report.js';

const fixturePath = 'benchmarks/temp-step-resistor/temp-divider.cir';
const reportPath = 'benchmarks/temp-step-resistor/report.json';
const temperatures = [-55, 25, 72] as const;
const nominalResistance = 1000;
const tc1 = 0.001;
const tnom = 27;

interface Sample {
  temperatureC: number;
  effectiveResistanceOhms: number;
  spiceTsDirectVoltage: number;
  spiceTsExpandedVoltage: number;
  ngspiceExpandedVoltage: number;
  inputSha256: string;
}

void main();

async function main(): Promise<void> {
  const fixture = readFileSync(resolve(fixturePath), 'utf8');
  const fixtureSha256 = sha256(fixture);
  const nativeStep = spawnSync('ngspice', ['-b', resolve(fixturePath)], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  const nativeStepMessage = `${nativeStep.stdout}${nativeStep.stderr}`.replaceAll(/\s+/g, ' ').trim();
  if (nativeStep.status === 0 || !nativeStepMessage.includes("unimplemented dot command '.step'")) {
    throw new Error('ngspice direct .step boundary changed; update this honest comparison workflow');
  }

  const directStarted = performance.now();
  const direct = await simulate(fixture, { stepWorkers: false });
  const directRuntimeMs = performance.now() - directStarted;
  if (direct.steps?.length !== temperatures.length) {
    throw new Error(`expected ${temperatures.length} direct TEMP steps`);
  }

  let spiceTsExpandedRuntimeMs = 0;
  let ngspiceExpandedRuntimeMs = 0;
  const samples: Sample[] = [];
  for (let index = 0; index < temperatures.length; index++) {
    const temperatureC = temperatures[index];
    const effectiveResistanceOhms = nominalResistance * (1 + tc1 * (temperatureC - tnom));
    const expanded = expandPoint(fixture, temperatureC, effectiveResistanceOhms);
    const input = Buffer.from(expanded);
    const circuit = circuitMetadata(input, temperatureC);

    const spiceStarted = performance.now();
    const spiceTs = await runNativeSpiceTs(input, circuit);
    spiceTsExpandedRuntimeMs += performance.now() - spiceStarted;
    const ngStarted = performance.now();
    const ngspice = await runNativeNgspice(input, circuit);
    ngspiceExpandedRuntimeMs += performance.now() - ngStarted;

    const spiceTsExpandedVoltage = outputVoltage(spiceTs, temperatureC, 'spice-ts');
    const ngspiceExpandedVoltage = outputVoltage(ngspice, temperatureC, 'ngspice');
    const spiceTsDirectVoltage = direct.steps[index].dc!.voltage('out');
    samples.push({
      temperatureC,
      effectiveResistanceOhms,
      spiceTsDirectVoltage,
      spiceTsExpandedVoltage,
      ngspiceExpandedVoltage,
      inputSha256: sha256(expanded),
    });
  }

  const absoluteErrors = samples.map(sample =>
    Math.abs(sample.spiceTsDirectVoltage - sample.ngspiceExpandedVoltage));
  const relativeErrors = samples.map((sample, index) =>
    absoluteErrors[index] / Math.max(Math.abs(sample.ngspiceExpandedVoltage), 1e-30));
  const expansionAbsoluteErrors = samples.map(sample =>
    Math.abs(sample.spiceTsDirectVoltage - sample.spiceTsExpandedVoltage));
  const expansionRelativeErrors = samples.map((sample, index) =>
    expansionAbsoluteErrors[index] / Math.max(Math.abs(sample.spiceTsExpandedVoltage), 1e-30));
  const report = {
    schemaVersion: 'spice-ts-temp-step-resistor/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/318',
    fixture: {
      path: fixturePath,
      sha256: fixtureSha256,
      source: 'project-authored reference circuit for issue #318',
      licence: 'MIT',
    },
    tools: {
      ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' })
        .match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      spiceTs: 'workspace',
      node: process.version,
    },
    machine: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    policy: {
      directSpiceTsInput: 'the committed fixture bytes',
      directNgspiceInput: 'the committed fixture bytes; ngspice-47 rejects .step explicitly',
      matchedPointInput: 'one byte-identical deterministic expansion supplied to both engines per TEMP value',
      perCircuitToleranceTuning: false,
    },
    commands: {
      comparison: 'pnpm bench:temp-step',
      ngspiceDirect: `ngspice -b ${fixturePath}`,
      matchedPoints: 'ngspice -b -r <raw> <byte-identical-expanded-netlist>; @spice-ts/core simulate(<same bytes>)',
    },
    convergence: {
      spiceTsDirectStep: 'success',
      spiceTsExpandedPoints: temperatures.map(temperatureC => ({ temperatureC, status: 'success' })),
      ngspiceExpandedPoints: temperatures.map(temperatureC => ({ temperatureC, status: 'success' })),
      ngspiceDirectStep: "unsupported: unimplemented dot command '.step'",
    },
    stepOrderCelsius: [...temperatures],
    matchedPointCount: samples.length,
    errors: {
      voltageOut: {
        maximumAbsoluteError: Math.max(...absoluteErrors),
        rmsAbsoluteError: rms(absoluteErrors),
        maximumRelativeError: Math.max(...relativeErrors),
        rmsRelativeError: rms(relativeErrors),
      },
      directVersusExpandedSpiceTs: {
        maximumAbsoluteError: Math.max(...expansionAbsoluteErrors),
        rmsAbsoluteError: rms(expansionAbsoluteErrors),
        maximumRelativeError: Math.max(...expansionRelativeErrors),
        rmsRelativeError: rms(expansionRelativeErrors),
      },
    },
    runtimeMilliseconds: {
      spiceTsDirectStep: directRuntimeMs,
      spiceTsExpandedPoints: spiceTsExpandedRuntimeMs,
      ngspiceExpandedProcesses: ngspiceExpandedRuntimeMs,
      caveat: 'ngspice includes one process startup per matched point; this is not a speed claim.',
    },
    samples,
    losses: [
      "ngspice-47 cannot execute the committed .step directive directly; matched points use deterministic expansions.",
      'The harness evaluates the documented linear resistor coefficient into each expanded resistance; direct spice-ts output is checked against those same expanded bytes.',
      'Diode and broad all-device temperature semantics remain out of scope.',
      'Every non-zero max/RMS residual is retained.',
    ],
  };
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : reportPath;
  if (!output) throw new Error('--output requires a path');
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(resolve(output), serialized);
  process.stdout.write(serialized);
}

function expandPoint(fixture: string, temperatureC: number, resistance: number): string {
  return fixture
    .replace(/^R1\s+in\s+out\s+\S+\s+TC1=\S+$/m, `R1 in out ${resistance}`)
    .replace(/^\.step\b.*$/m, `* deterministic expansion: TEMP=${temperatureC} C`);
}

function circuitMetadata(input: Buffer, temperatureC: number): ClassicCircuit {
  return {
    id: `temp-${temperatureC}`,
    category: 'passive-temperature',
    analyses: ['op'],
    sourcePath: fixturePath,
    sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/318',
    localPath: fixturePath,
    sha256: sha256(input),
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  };
}

function outputVoltage(execution: EngineExecution, temperatureC: number, engine: string): number {
  if (execution.status !== 'success') {
    throw new Error(`${engine} failed at TEMP=${temperatureC}: ${execution.error}`);
  }
  const value = execution.analyses[0]?.series.signals['v(out)']?.[0]?.re;
  if (!Number.isFinite(value)) throw new Error(`${engine} returned no V(out) at TEMP=${temperatureC}`);
  return value!;
}

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}
