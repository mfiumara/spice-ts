#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { alignAndMeasure, type ComparisonMetrics } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const TARGET_ID = 'inductor-transient';
const SPICE_TS_TIMEOUT_MS = 30_000;

interface XyceManifest {
  circuits: ClassicCircuit[];
}

interface AuditReport {
  fixtures: Array<{
    key: string;
    spiceTs: {
      status: EngineExecution['status'];
      runtimeMs: number;
      firstFailure: { evidence: string } | null;
    };
  }>;
}

interface TimedExecution {
  execution: EngineExecution;
  runtimeMs: number;
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
  const started = performance.now();
  const execution = await run();
  return { execution, runtimeMs: Number((performance.now() - started).toFixed(3)) };
}

function runBoundedSpiceTs(): TimedExecution {
  const started = performance.now();
  const completed = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'benchmarks/results/issue-322/spice-ts-runner.ts', TARGET_ID],
    { encoding: 'utf8', timeout: SPICE_TS_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
  );
  const runtimeMs = Number((performance.now() - started).toFixed(3));
  if (completed.error || completed.status !== 0) {
    const timedOut = completed.error && 'code' in completed.error && completed.error.code === 'ETIMEDOUT';
    return {
      runtimeMs,
      execution: {
        status: 'failed',
        convergence: 'failed',
        analyses: [],
        error: timedOut
          ? `spice-ts exceeded the ${SPICE_TS_TIMEOUT_MS} ms benchmark limit`
          : (completed.error?.message ?? (completed.stderr.trim() || `spice-ts runner exited ${completed.status}`)),
      },
    };
  }
  return { runtimeMs, execution: JSON.parse(completed.stdout) as EngineExecution };
}

function outcome({ execution, runtimeMs }: TimedExecution) {
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

function comparisons(spiceTs: EngineExecution, ngspice: EngineExecution): Array<{
  analysis: string;
  signals: string[];
  metrics: ComparisonMetrics;
}> {
  return spiceTs.analyses.flatMap((spiceAnalysis) => {
    const reference = ngspice.analyses.find(analysis => analysis.type === spiceAnalysis.type);
    if (!reference) return [];
    const signals = Object.keys(spiceAnalysis.series.signals)
      .filter(signal => reference.series.signals[signal] !== undefined)
      .sort();
    if (signals.length === 0) return [];
    return [{
      analysis: spiceAnalysis.type,
      signals,
      metrics: alignAndMeasure(spiceAnalysis.series, reference.series, signals),
    }];
  });
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'),
  ) as XyceManifest;
  const circuit = manifest.circuits.find(candidate => candidate.id === TARGET_ID);
  if (!circuit) throw new Error(`missing Xyce fixture: ${TARGET_ID}`);

  const input = await readFile(resolve(circuit.localPath));
  const digest = sha256(input);
  if (digest !== circuit.sha256) throw new Error(`${TARGET_ID}: fixture SHA-256 mismatch`);

  const audit = JSON.parse(
    await readFile(resolve('benchmarks/device-card-audit/report.json'), 'utf8'),
  ) as AuditReport;
  const baseline = audit.fixtures.find(fixture => fixture.key === `xyce/${TARGET_ID}`);
  if (!baseline) throw new Error(`${TARGET_ID}: missing committed audit baseline`);

  const spiceTs = runBoundedSpiceTs();
  const ngspice = await timed(() => runNativeNgspice(input, circuit));
  const comparison = comparisons(spiceTs.execution, ngspice.execution);
  const laterFailures = spiceTs.execution.status === 'success'
    ? []
    : [{ status: spiceTs.execution.status, error: spiceTs.execution.error ?? 'no diagnostic emitted' }];

  const report = {
    schemaVersion: 'spice-ts-issue-322/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/322',
    tools: {
      ngspice: ngspiceVersion(),
      spiceTs: JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')).version,
      node: process.version,
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      engineInput: 'the same immutable fixture Buffer',
      timing: 'single wall-clock execution per engine; descriptive only; no speed claim',
      spiceTsTimeoutMs: SPICE_TS_TIMEOUT_MS,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
    },
    command: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-322/verify.ts --output benchmarks/results/issue-322/report.json',
    fixture: {
      id: circuit.id,
      input: {
        bytes: input.byteLength,
        sha256: digest,
        identicalForBothEngines: true,
      },
      before: {
        spiceTs: {
          status: baseline.spiceTs.status,
          runtimeMs: baseline.spiceTs.runtimeMs,
          error: baseline.spiceTs.firstFailure?.evidence ?? 'no diagnostic emitted',
        },
      },
      after: {
        ngspice: outcome(ngspice),
        spiceTs: outcome(spiceTs),
      },
      comparisons: comparison,
      laterFailures,
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

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
