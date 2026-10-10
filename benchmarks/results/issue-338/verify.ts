#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const TARGETS = [
  {
    id: 'hfet-inverter',
    residualIssue: 'https://github.com/mfiumara/spice-ts/issues/339',
    requiredText: [/^z1\s/im, /^\.model\s+adrv\s+nhfet\s+level=5/im],
    residuals: [
      'Z-card HFET/MESFET device semantics are not implemented.',
      'NHFET level=5 model semantics are not implemented.',
    ],
    before: {
      status: 'failed',
      convergence: 'failed',
      runtimeMs: 2.9253330000000233,
      error: 'Singular matrix: zero pivot at matrix column 2 (nodes: 3)',
    },
  },
  {
    id: 'mesa-oscillator',
    residualIssue: 'https://github.com/mfiumara/spice-ts/issues/340',
    requiredText: [/^bl1\s/im, /^zd\s/im, /^\.model\s+driver\s+nmf\s+level=2/im],
    residuals: [
      'B-card behavioral current-source semantics are not implemented.',
      'Z-card HFET/MESFET device semantics are not implemented.',
      'NMF level=2 model semantics are not implemented.',
    ],
    before: {
      status: 'failed',
      convergence: 'failed',
      runtimeMs: 1.9506660000000124,
      error: 'Singular matrix: zero pivot at matrix column 14 (nodes: xinv01.2)',
    },
  },
] as const;

interface NgspiceManifest {
  circuits: Array<Omit<ClassicCircuit, 'ngspice' | 'spiceTs'> & {
    ngspice?: unknown;
    spiceTs: unknown;
  }>;
}

interface TimedExecution {
  runtimeMs: number;
  execution: EngineExecution;
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return `${result.stdout}\n${result.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown';
}

async function timed(run: () => Promise<EngineExecution>): Promise<TimedExecution> {
  const start = performance.now();
  const execution = await run();
  return { runtimeMs: performance.now() - start, execution };
}

function outcome(timedExecution: TimedExecution) {
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

function withoutRuntime(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRuntime);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'runtimeMs')
        .map(([key, child]) => [key, withoutRuntime(child)]),
    );
  }
  return value;
}

async function buildReport() {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/ngspice/manifest.json'), 'utf8'),
  ) as NgspiceManifest;
  const fixtures = [];

  for (const target of TARGETS) {
    const source = manifest.circuits.find(circuit => circuit.id === target.id);
    if (!source) throw new Error(`missing target fixture: ${target.id}`);
    const circuit: ClassicCircuit = {
      ...source,
      ngspice: { expectedStatus: 'pass' },
      spiceTs: { expectedStatus: 'fail' },
    };
    const input = await readFile(resolve(circuit.localPath));
    const digest = sha256(input);
    if (digest !== circuit.sha256) throw new Error(`${circuit.id}: fixture SHA-256 mismatch`);
    const text = input.toString('utf8');
    if (!target.requiredText.every(pattern => pattern.test(text))) {
      throw new Error(`${circuit.id}: expected unsupported-card evidence changed`);
    }

    const [ngspice, spiceTs] = await Promise.all([
      timed(() => runNativeNgspice(input, circuit)),
      timed(() => runNativeSpiceTs(input, circuit)),
    ]);
    const ngspiceOutcome = outcome(ngspice);
    const spiceTsOutcome = outcome(spiceTs);
    if (![ngspiceOutcome.runtimeMs, spiceTsOutcome.runtimeMs]
      .every(runtimeMs => Number.isFinite(runtimeMs) && runtimeMs > 0)) {
      throw new Error(`${circuit.id}: invalid runtime observation`);
    }
    if (ngspiceOutcome.status !== 'success') {
      throw new Error(`${circuit.id}: ngspice did not succeed: ${ngspiceOutcome.error ?? 'unknown error'}`);
    }
    if (spiceTsOutcome.status !== 'unsupported') {
      throw new Error(`${circuit.id}: spice-ts must remain an honest unsupported loss`);
    }

    fixtures.push({
      id: circuit.id,
      input: {
        bytes: input.byteLength,
        sha256: digest,
        identicalForBothEngines: true,
      },
      beforeSpiceTs: {
        ...target.before,
        observation: 'Single RED wall-clock execution through packages/core/src on this machine.',
      },
      ngspice: ngspiceOutcome,
      spiceTs: spiceTsOutcome,
      comparisons: [],
      errorMetrics: {
        maximumAbsoluteError: null,
        rmsAbsoluteError: null,
        maximumRelativeError: null,
        rmsRelativeError: null,
        reason: 'spice-ts produced no analysis points because required device semantics remain unsupported',
      },
      residualIssue: target.residualIssue,
      losses: target.residuals,
    });
  }

  return {
    schemaVersion: 'spice-ts-issue-338/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/338',
    tools: {
      ngspice: ngspiceVersion(),
      spiceTs: JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')).version,
      node: process.version,
    },
    commands: {
      generate: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-338/verify.ts --output benchmarks/results/issue-338/report.json',
      verify: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-338/verify.ts --check',
      ngspice: 'ngspice -b -r <temporary-rawfile> <byte-identical-fixture>',
      spiceTs: '@spice-ts/core simulate(<byte-identical-fixture>)',
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      engineInput: 'the same immutable fixture Buffer',
      timing: 'single wall-clock execution per engine and fixture; descriptive, not a speed claim',
    },
    rootCause: 'Subcircuit expansion silently discarded unknown device cards, leaving unstamped nodes that reached sparse LU as zero pivots.',
    outcome: 'The shared singular-matrix symptom is removed by rejecting unsupported subcircuit cards before solve. No device model is approximated and both fixtures remain explicit losses.',
    fixtures,
    remainingLosses: fixtures.map(fixture => ({
      id: fixture.id,
      residualIssue: fixture.residualIssue,
      losses: fixture.losses,
    })),
  };
}

async function main(): Promise<void> {
  const report = await buildReport();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--output requires a path');
    await writeFile(resolve(outputPath), serialized);
  } else if (process.argv.includes('--check')) {
    const expected = JSON.parse(
      await readFile(resolve('benchmarks/results/issue-338/report.json'), 'utf8'),
    );
    if (JSON.stringify(withoutRuntime(expected)) !== JSON.stringify(withoutRuntime(report))) {
      throw new Error('issue-338 deterministic receipt fields changed');
    }
    process.stderr.write('issue-338 receipt: deterministic fields match; runtime observations are finite and descriptive\n');
  } else {
    process.stdout.write(serialized);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
