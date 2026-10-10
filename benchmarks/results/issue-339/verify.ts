#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const FIXTURE_SHA256 = '3fa93266e9036443173bf9416eb67e8ff4c2c24aeefc6ef687f355d8548239e1';

interface TimedExecution {
  runtimeMs: number;
  execution: EngineExecution;
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

async function timed(run: () => Promise<EngineExecution>): Promise<TimedExecution> {
  const start = performance.now();
  const execution = await run();
  return { runtimeMs: performance.now() - start, execution };
}

function engine(timedExecution: TimedExecution) {
  const { execution, runtimeMs } = timedExecution;
  return {
    status: execution.status,
    convergence: execution.convergence,
    runtimeMs,
    analyses: execution.analyses.map(analysis => ({
      type: analysis.type,
      points: analysis.series.grid.length,
      signals: Object.keys(analysis.series.signals).sort(),
    })),
    ...(execution.error ? { error: execution.error } : {}),
  };
}

function deterministic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deterministic);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'runtimeMs')
      .map(([key, child]) => [key, deterministic(child)]));
  }
  return value;
}

async function buildReport() {
  const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/ngspice/manifest.json'), 'utf8')) as {
    circuits: ClassicCircuit[];
  };
  const source = manifest.circuits.find(circuit => circuit.id === 'hfet-inverter');
  if (!source) throw new Error('missing hfet-inverter fixture');
  const circuit: ClassicCircuit = {
    ...source,
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  };
  const input = await readFile(resolve(circuit.localPath));
  const digest = sha256(input);
  if (digest !== FIXTURE_SHA256 || digest !== circuit.sha256) {
    throw new Error('hfet-inverter fixture SHA-256 mismatch');
  }

  const [ngspice, spiceTs] = await Promise.all([
    timed(() => runNativeNgspice(input, circuit)),
    timed(() => runNativeSpiceTs(input, circuit)),
  ]);
  if (ngspice.execution.status !== 'success' || spiceTs.execution.status !== 'success') {
    throw new Error(`expected both engines to succeed: ngspice=${ngspice.execution.status}, spice-ts=${spiceTs.execution.status}`);
  }
  const ngAnalysis = ngspice.execution.analyses[0];
  const spiceAnalysis = spiceTs.execution.analyses[0];
  if (!ngAnalysis || !spiceAnalysis) throw new Error('missing transient analysis');
  const comparedSignals = Object.keys(spiceAnalysis.series.signals)
    .filter(signal => ngAnalysis.series.signals[signal] !== undefined)
    .sort();
  const metrics = alignAndMeasure(spiceAnalysis.series, ngAnalysis.series, comparedSignals);
  const extraSpiceTsSignals = Object.keys(spiceAnalysis.series.signals)
    .filter(signal => ngAnalysis.series.signals[signal] === undefined)
    .sort();
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });

  return {
    schemaVersion: 'spice-ts-issue-339/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/339',
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
    },
    input: {
      localPath: circuit.localPath,
      bytes: input.byteLength,
      sha256: digest,
      identicalForBothEngines: true,
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
      timing: 'single wall-clock execution per engine; descriptive, not a speed claim',
    },
    contract: {
      supported: [
        'Z-card with D/G/S terminals inside a subcircuit',
        'NHFET LEVEL=5',
        'model parameters LEVEL RD RS M LAMBDA VS MU VT0/VTO ETA SIGMA0 VSIGMA VSIGMAT JS1S JS1D NMAX',
        'instance parameters L W',
        'DC channel/gate leakage and transient Cgs/Cgd',
      ],
      unsupported: [
        'top-level Z-card parsing',
        'PHFET and NMF models',
        'HFET levels other than 5',
        'model or instance parameters outside the supported lists',
        'HFET noise, distortion, temperature parameters, and alternate gate model',
      ],
    },
    ngspice: engine(ngspice),
    spiceTs: engine(spiceTs),
    comparison: { signals: comparedSignals, metrics },
    losses: [
      `spice-ts emits ${spiceAnalysis.series.grid.length} adaptive points versus ngspice-47 ${ngAnalysis.series.grid.length}; comparison interpolates ngspice onto the spice-ts grid`,
      `spice-ts exposes internal RD/RS node signals not present in ngspice .print all: ${extraSpiceTsSignals.join(', ')}`,
      'The bounded model reproduces ngspice-47 HFET1 operating-point equations, but the host Newton initialization follows a different DC branch for this multistable inverter; waveform errors are published above and remain a parity loss.',
      'Top-level Z cards remain explicitly unsupported to avoid the parser registry collision with issue #340.',
      'B-card and Z-card NMF/MESA support remain deferred to issue #340.',
    ],
  };
}

async function main(): Promise<void> {
  const report = await buildReport();
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output requires a path');
    await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--check')) {
    const expected = JSON.parse(await readFile(resolve('benchmarks/results/issue-339/report.json'), 'utf8'));
    if (JSON.stringify(deterministic(expected)) !== JSON.stringify(deterministic(report))) {
      throw new Error('issue-339 deterministic receipt fields changed');
    }
    process.stderr.write('issue-339 receipt: deterministic fields match; runtimes are finite and descriptive\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
