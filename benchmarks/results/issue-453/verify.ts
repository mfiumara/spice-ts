#!/usr/bin/env tsx
/**
 * Issue #453 receipt: bounded VBIC non-ground substrate terminal vs ngspice-47.
 *
 * Usage (after `pnpm -C packages/core build`):
 *   npx tsx benchmarks/results/issue-453/verify.ts                 # print report
 *   npx tsx benchmarks/results/issue-453/verify.ts --output benchmarks/results/issue-453/report.json
 *   npx tsx benchmarks/results/issue-453/verify.ts --check         # compare deterministic fields
 *
 * Every comparison feeds byte-identical netlists to both engines and measures
 * them with the aggregate's own `compareExecutions` (spice-ts grid, linear
 * interpolation, no per-circuit tolerance). Recorded:
 *  1. benchmarks/vbic-substrate/{dc,ac}.cir: VBIC with a non-ground substrate.
 *  2. benchmarks/vbic-substrate/dc-latchup.cir: the same DC sweep driven into
 *     NPN + parasitic-PNP latch-up; kept as a retained spice-ts loss.
 *  3. The vbic-fo and vbic-common-emitter-ac aggregate rows (unchanged
 *     ngspice corpus fixtures), to show the rows are unchanged or improved.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareExecutions, type ComparisonReceipt } from '../../aggregate-report.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicAnalysisType,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const REPORT_PATH = 'benchmarks/results/issue-453/report.json';

interface Fixture {
  key: string;
  localPath: string;
  analyses: ClassicAnalysisType[];
  source: string;
}

const FIXTURES: Fixture[] = [
  { key: 'vbic-substrate/dc', localPath: 'benchmarks/vbic-substrate/dc.cir', analyses: ['dc'], source: 'project-authored (MIT), issue #453' },
  { key: 'vbic-substrate/ac', localPath: 'benchmarks/vbic-substrate/ac.cir', analyses: ['ac'], source: 'project-authored (MIT), issue #453' },
  { key: 'vbic-substrate/dc-latchup', localPath: 'benchmarks/vbic-substrate/dc-latchup.cir', analyses: ['dc'], source: 'project-authored (MIT), issue #453' },
  { key: 'ngspice/vbic-fo', localPath: 'benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir', analyses: ['dc'], source: 'ngspice corpus (BSD-3-Clause), aggregate row' },
  { key: 'ngspice/vbic-common-emitter-ac', localPath: 'benchmarks/corpus/ngspice/fixtures/tests/vbic/CEamp.cir', analyses: ['ac', 'pz'], source: 'ngspice corpus (BSD-3-Clause), aggregate row' },
];

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
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

function engineSummary(execution: EngineExecution) {
  return {
    status: execution.status,
    convergence: execution.convergence,
    analyses: execution.analyses.map(analysis => ({ type: analysis.type, points: analysis.series.grid.length })),
    ...(execution.error ? { error: execution.error.slice(0, 400) } : {}),
  };
}

function signalSummary(comparisons: ComparisonReceipt[]) {
  return comparisons.map(comparison => ({
    analysis: comparison.analysis,
    alignedPoints: comparison.metrics.grid.alignedPoints,
    signals: Object.fromEntries(Object.entries(comparison.metrics.signals).map(([name, signal]) => [
      name,
      signal.status === 'compared'
        ? {
          samples: signal.sampleCount,
          maxAbsoluteError: signal.absoluteError.max,
          rmsAbsoluteError: signal.absoluteError.rms,
          maxRelativeError: signal.relativeError.max,
        }
        : { status: signal.status },
    ])),
  }));
}

async function buildReport() {
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  const fixtures = [];
  for (const fixture of FIXTURES) {
    const input = await readFile(resolve(fixture.localPath));
    const circuit: ClassicCircuit = {
      id: fixture.key,
      category: fixture.analyses[0],
      analyses: fixture.analyses,
      sourcePath: fixture.localPath,
      sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/453',
      localPath: fixture.localPath,
      sha256: sha256(input),
      ngspice: { expectedStatus: 'pass' },
      spiceTs: { expectedStatus: 'pass' },
    };
    const started = performance.now();
    const ngspice = await runNativeNgspice(input, circuit);
    const ngspiceMs = performance.now() - started;
    const spiceStarted = performance.now();
    const spiceTs = await runNativeSpiceTs(input, circuit);
    const spiceMs = performance.now() - spiceStarted;
    const comparisons = spiceTs.status === 'success' && ngspice.status === 'success'
      ? compareExecutions(spiceTs, ngspice)
      : [];
    fixtures.push({
      key: fixture.key,
      source: fixture.source,
      input: { localPath: fixture.localPath, bytes: input.byteLength, sha256: circuit.sha256, identicalForBothEngines: true },
      ngspice: { ...engineSummary(ngspice), runtimeMs: Number(ngspiceMs.toFixed(3)) },
      spiceTs: { ...engineSummary(spiceTs), runtimeMs: Number(spiceMs.toFixed(3)) },
      comparisons: signalSummary(comparisons),
    });
  }
  return {
    schemaVersion: 'spice-ts-issue-453/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/453',
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
    },
    policy: {
      input: 'byte-identical netlist for both engines',
      comparison: 'benchmarks/aggregate-report.ts compareExecutions (spice-ts grid, linear interpolation)',
      perCircuitToleranceTuning: false,
      speedClaim: false,
    },
    fixtures,
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
    const expected = JSON.parse(await readFile(resolve(REPORT_PATH), 'utf8'));
    if (JSON.stringify(deterministic(expected)) !== JSON.stringify(deterministic(report))) {
      throw new Error('issue-453 deterministic receipt fields changed');
    }
    process.stderr.write('issue-453 receipt: deterministic fields match\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
