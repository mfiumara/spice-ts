#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { simulate } from '../../../packages/core/dist/index.js';
import { compareFixture } from '../../comparison-harness.js';
import {
  compareWaveform,
  XYCE_WAVEFORM_RELTOL,
} from './acceptance.js';

const FIXTURE_PATH = 'benchmarks/corpus/xyce/fixtures/DIODE/Level2_Temp_Dep_Breakdown.cir';
const FIXTURE_SHA256 = '9c52a577a2f0b0a7419160b6cd340894ed41ebc403023a3b3f1d809d171bee0e';
const XYCE_REVISION = '7bb7e98f0ed3a81a7d1cf1d10b68592107ed40b2';
const XYCE_GOLD_URL = `https://raw.githubusercontent.com/Xyce/Xyce_Regression/${XYCE_REVISION}/OutputData/DIODE/Level2_Temp_Dep_Breakdown.cir.prn`;
const XYCE_GOLD_SHA256 = '89a12adee6f8d43c56726b37f93b8286736042fa06492c8ccc1f7e70a09675f5';
const PARITY_FIXTURE_PATH = 'benchmarks/diode-breakdown-temperature/dc-equivalent.cir';
const PARITY_FIXTURE_SHA256 = '02551eb619592aa1065cd549dbabd65e0916c3d223c2cbef7ecd6de72d4c8b65';
const PARITY_SIGNALS = ['v(cold)', 'v(nominal)', 'v(hot)', 'i(VSWEEP)'];

interface GoldPoint {
  time: number;
  voltage: number;
  temperature: number;
}

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function parseGold(text: string): GoldPoint[] {
  return text.trim().split('\n').slice(1).map((line) => {
    const columns = line.trim().split(/\s+/).map(Number);
    return { time: columns[1], voltage: columns[2], temperature: columns[3] };
  });
}

function interpolate(points: GoldPoint[], time: number): number {
  if (time <= points[0].time) return points[0].voltage;
  if (time >= points.at(-1)!.time) return points.at(-1)!.voltage;
  let upper = 1;
  while (points[upper].time < time) upper++;
  const before = points[upper - 1];
  const after = points[upper];
  const ratio = (time - before.time) / (after.time - before.time);
  return before.voltage + ratio * (after.voltage - before.voltage);
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return `${result.stdout}\n${result.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown';
}

function originalNgspiceOutcome(path: string) {
  const started = performance.now();
  const result = spawnSync('ngspice', ['-b', path], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stderr}\n${result.stdout}`.replace(/\s+/g, ' ').trim();
  return {
    status: result.status === 0 ? 'success' : 'failed',
    runtimeMs: Number((performance.now() - started).toFixed(3)),
    exitCode: result.status,
    error: result.status === 0 ? null : output,
  };
}

async function main(): Promise<void> {
  const fixturePath = resolve(FIXTURE_PATH);
  const fixture = await readFile(fixturePath);
  const fixtureDigest = sha256(fixture);
  if (fixtureDigest !== FIXTURE_SHA256) throw new Error(`fixture hash mismatch: ${fixtureDigest}`);

  const goldResponse = await fetch(XYCE_GOLD_URL);
  if (!goldResponse.ok) throw new Error(`Xyce gold fetch failed: ${goldResponse.status}`);
  const goldBytes = new Uint8Array(await goldResponse.arrayBuffer());
  const goldDigest = sha256(goldBytes);
  if (goldDigest !== XYCE_GOLD_SHA256) throw new Error(`Xyce gold hash mismatch: ${goldDigest}`);
  const gold = parseGold(new TextDecoder().decode(goldBytes));

  const spiceStarted = performance.now();
  const result = await simulate(fixture.toString('utf8'), { stepWorkers: false });
  const spiceRuntimeMs = Number((performance.now() - spiceStarted).toFixed(3));
  if (!result.steps || result.steps.length !== 3) throw new Error('expected three TEMP steps');

  const comparisons = result.steps.map((step) => {
    if (!step.transient) throw new Error(`TEMP ${step.paramValue}: missing transient result`);
    const goldStep = gold.filter(point => point.temperature === step.paramValue);
    if (goldStep.length === 0) throw new Error(`TEMP ${step.paramValue}: missing Xyce gold data`);
    const actual = [...step.transient.voltage('2')];
    const reference = [...step.transient.time].map(time => interpolate(goldStep, time));
    return {
      temperatureC: step.paramValue,
      spiceTsPoints: actual.length,
      xyceGoldPoints: goldStep.length,
      endpoints: {
        spiceTs: [actual[0], actual.at(-1)],
        xyceGold: [goldStep[0].voltage, goldStep.at(-1)!.voltage],
      },
      metrics: compareWaveform(actual, reference, step.paramValue),
    };
  });

  const parityFixture = await readFile(resolve(PARITY_FIXTURE_PATH));
  const parityDigest = sha256(parityFixture);
  if (parityDigest !== PARITY_FIXTURE_SHA256) {
    throw new Error(`parity fixture hash mismatch: ${parityDigest}`);
  }
  const parityComparison = await compareFixture({
    name: 'issue-319-diode-breakdown-temperature-dc-equivalent',
    analysis: 'dc',
    netlist: parityFixture.toString('utf8'),
    signals: PARITY_SIGNALS,
  });
  if (parityComparison.status !== 'compared') {
    throw new Error('byte-identical ngspice parity fixture did not produce matched comparisons');
  }
  const paritySummary = {
    name: parityComparison.name,
    analysis: parityComparison.analysis,
    netlistSha256: parityComparison.netlistSha256,
    status: parityComparison.status,
    signals: parityComparison.signals,
    engines: {
      spiceTs: {
        status: parityComparison.spiceTs.status,
        convergence: parityComparison.spiceTs.convergence,
        runtimeMs: parityComparison.spiceTs.runtimeMs,
        command: parityComparison.spiceTs.command,
      },
      ngspice: {
        status: parityComparison.ngspice.status,
        convergence: parityComparison.ngspice.convergence,
        runtimeMs: parityComparison.ngspice.runtimeMs,
        command: parityComparison.ngspice.command,
      },
    },
    metrics: parityComparison.metrics,
  };

  const packageJson = JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8'));
  const report = {
    schemaVersion: 'spice-ts-issue-319/v2',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/319',
    generatedAt: new Date().toISOString(),
    tools: {
      spiceTs: packageJson.version,
      node: process.version,
      ngspice: ngspiceVersion(),
      xyceReference: `Xyce_Regression@${XYCE_REVISION} committed gold output`,
    },
    machine: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model ?? 'unknown',
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts transient timestamps',
      interpolation: 'linear interpolation of pinned Xyce gold output',
      waveformAcceptance: `max relative error <= ${XYCE_WAVEFORM_RELTOL} (fixture *COMP V(2) reltol)`,
      speedClaim: false,
      unchangedXyceNgspiceParityClaim: false,
      dcEquivalentIdenticalNetlistParityClaim: true,
      dcEquivalentPerCircuitToleranceTuning: false,
    },
    commands: {
      verifier: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-319/verify.ts --output benchmarks/results/issue-319/report.json',
      ngspiceParity: `ngspice -b -r <temporary-rawfile> <byte-identical copy of ${PARITY_FIXTURE_PATH}>`,
      spiceTsParity: `@spice-ts/core simulate(<the same bytes from ${PARITY_FIXTURE_PATH}>)`,
    },
    input: {
      path: FIXTURE_PATH,
      bytes: fixture.byteLength,
      sha256: fixtureDigest,
      unchanged: true,
    },
    xyceGold: {
      url: XYCE_GOLD_URL,
      bytes: goldBytes.byteLength,
      sha256: goldDigest,
    },
    before: {
      spiceTs: {
        status: 'unsupported',
        evidence: 'issue-307 report: no spice-ts transient result before TEMP stepping and diode breakdown support',
      },
    },
    after: {
      spiceTs: {
        status: 'success',
        runtimeMs: spiceRuntimeMs,
        temperatureStepsC: result.steps.map(step => step.paramValue),
      },
      xyceComparison: comparisons,
      ngspice47IdenticalNetlistParity: {
        fixture: {
          path: PARITY_FIXTURE_PATH,
          bytes: parityFixture.byteLength,
          sha256: parityDigest,
          source: 'project-authored DC-equivalent reference circuit for spice-ts issue #319',
          sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/319',
          revision: 'fixture bytes pinned by sha256 in this verifier',
          licence: 'MIT',
          redistribution: 'allowed under the repository MIT licence',
          byteIdenticalBetweenEngines: true,
        },
        temperaturePointsC: [-55, 25, 72],
        grid: '.dc VSWEEP 8 12 0.25 (17 matched points)',
        signals: PARITY_SIGNALS,
        comparison: paritySummary,
      },
    },
    retainedLosses: {
      originalDeckNgspice47: originalNgspiceOutcome(fixturePath),
      reason: 'ngspice-47 rejects the unchanged Xyce zero-print-step .tran form before simulation',
      identicalNetlistComparison: false,
    },
    supportedContract: {
      modelParameters: ['BV', 'IBV', 'TBV1', 'TBV2', 'TNOM'],
      behavior: 'BV(T)=BV*(1+TBV1*(TEMP-TNOM)+TBV2*(TEMP-TNOM)^2); IBV calibrates the reverse current at BV(T)',
      temperatureStepping: '.step TEMP LIST; device temperature is restored by the shared step target finally block',
    },
    unsupportedContract: {
      fullLevel2Model: false,
      parameters: ['NBV', 'IBVL', 'NBVL', 'TLEV', 'TRS1', 'TRS2'],
      disposition: 'each listed model parameter is rejected explicitly during circuit compilation',
      exclusions: ['temperature-adjusted IS via EG/XTI', 'avalanche noise', 'temperature-adjusted capacitance', 'diode instance TEMP/DTEMP'],
    },
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
