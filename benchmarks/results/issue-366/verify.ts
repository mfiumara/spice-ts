#!/usr/bin/env tsx
/**
 * Issue #366 receipt: the unchanged Xyce inductor fixture through spice-ts and
 * ngspice with identical input bytes. spice-ts runs in a bounded child process
 * so a regression to the pre-fix hang is recorded as a timeout, not a stall.
 */
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
const EXPECTED_SHA256 = 'a0a869d9fe3b04d3bbdc8abf9e8a89a9302a54ac5be9c97f446f06834a248b35';
const SPICE_TS_TIMEOUT_MS = 30_000;

interface XyceManifest {
  circuits: ClassicCircuit[];
}

interface Issue322Report {
  fixture: { after: { spiceTs: { status: string; runtimeMs: number; error?: string } } };
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
  grid: 'spice-ts' | 'ngspice';
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
    // Both directions: losses on either engine's timepoints are published.
    return [
      {
        analysis: spiceAnalysis.type,
        grid: 'spice-ts' as const,
        signals,
        metrics: alignAndMeasure(spiceAnalysis.series, reference.series, signals),
      },
      {
        analysis: spiceAnalysis.type,
        grid: 'ngspice' as const,
        signals,
        metrics: alignAndMeasure(reference.series, spiceAnalysis.series, signals),
      },
    ];
  });
}

/**
 * Interpolation-free supplement: V(1)/V(2) jump at every PULSE corner, so
 * linear interpolation between two engines' different post-corner grids
 * reports a large error that neither engine produced. This compares only
 * samples whose timepoints coincide (within `tolerance`) in both outputs.
 */
function coincidentSamples(spiceTs: EngineExecution, ngspice: EngineExecution, tolerance: number) {
  const spice = spiceTs.analyses.find(analysis => analysis.type === 'tran');
  const reference = ngspice.analyses.find(analysis => analysis.type === 'tran');
  if (!spice || !reference) return null;
  const pairs: Array<[number, number]> = [];
  let j = 0;
  for (let i = 0; i < spice.series.grid.length; i++) {
    const time = spice.series.grid[i]!;
    while (j < reference.series.grid.length && reference.series.grid[j]! < time - tolerance) j++;
    if (j < reference.series.grid.length && Math.abs(reference.series.grid[j]! - time) <= tolerance) {
      pairs.push([i, j]);
    }
  }
  const signals: Record<string, { sampleCount: number; maxAbsoluteError: number; rmsAbsoluteError: number }> = {};
  for (const signal of Object.keys(spice.series.signals).sort()) {
    const ours = spice.series.signals[signal];
    const theirs = reference.series.signals[signal];
    if (!ours || !theirs) continue;
    let max = 0;
    let sumSquares = 0;
    for (const [i, j] of pairs) {
      const error = Math.hypot(ours[i]!.re - theirs[j]!.re, ours[i]!.im - theirs[j]!.im);
      max = Math.max(max, error);
      sumSquares += error * error;
    }
    signals[signal] = {
      sampleCount: pairs.length,
      maxAbsoluteError: max,
      rmsAbsoluteError: pairs.length > 0 ? Math.sqrt(sumSquares / pairs.length) : 0,
    };
  }
  return {
    timeToleranceSeconds: tolerance,
    times: pairs.map(([i]) => spice.series.grid[i]!),
    signals,
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'),
  ) as XyceManifest;
  const circuit = manifest.circuits.find(candidate => candidate.id === TARGET_ID);
  if (!circuit) throw new Error(`missing Xyce fixture: ${TARGET_ID}`);

  const input = await readFile(resolve(circuit.localPath));
  const digest = sha256(input);
  if (digest !== circuit.sha256 || digest !== EXPECTED_SHA256) {
    throw new Error(`${TARGET_ID}: fixture SHA-256 mismatch`);
  }

  const before = JSON.parse(
    await readFile(resolve('benchmarks/results/issue-322/report.json'), 'utf8'),
  ) as Issue322Report;

  const spiceTs = runBoundedSpiceTs();
  const ngspice = await timed(() => runNativeNgspice(input, circuit));
  const comparison = comparisons(spiceTs.execution, ngspice.execution);
  const failures = [spiceTs, ngspice]
    .map((run, index) => ({ engine: index === 0 ? 'spice-ts' : 'ngspice', run }))
    .filter(({ run }) => run.execution.status !== 'success')
    .map(({ engine, run }) => ({
      engine,
      status: run.execution.status,
      error: run.execution.error ?? 'no diagnostic emitted',
    }));

  const report = {
    schemaVersion: 'spice-ts-issue-366/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/366',
    tools: {
      ngspice: ngspiceVersion(),
      spiceTs: JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')).version,
      node: process.version,
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      engineInput: 'the same immutable fixture Buffer',
      timing: 'single wall-clock execution per engine; spice-ts includes child-process tsx startup; descriptive only; no speed claim',
      spiceTsTimeoutMs: SPICE_TS_TIMEOUT_MS,
      comparisonGrids: ['spice-ts', 'ngspice'],
      interpolation: 'linear',
    },
    command: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-366/verify.ts --output benchmarks/results/issue-366/report.json',
    fixture: {
      id: circuit.id,
      input: {
        bytes: input.byteLength,
        sha256: digest,
        identicalForBothEngines: true,
      },
      before: {
        source: 'benchmarks/results/issue-322/report.json (fixture.after.spiceTs, same bounded runner on main before this fix)',
        spiceTs: before.fixture.after.spiceTs,
      },
      after: {
        ngspice: outcome(ngspice),
        spiceTs: outcome(spiceTs),
      },
      comparisons: comparison,
      coincidentTimepoints: coincidentSamples(spiceTs.execution, ngspice.execution, 1e-12),
      failures,
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
