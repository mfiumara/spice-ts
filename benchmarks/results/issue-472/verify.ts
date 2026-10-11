#!/usr/bin/env tsx
/**
 * Issue #472 receipt: bounded VBIC DC through the substrate latch-up fold vs ngspice-47.
 *
 * Usage (after `pnpm -C packages/core build`):
 *   npx tsx benchmarks/results/issue-472/verify.ts                 # print report
 *   npx tsx benchmarks/results/issue-472/verify.ts --output benchmarks/results/issue-472/report.json
 *   npx tsx benchmarks/results/issue-472/verify.ts --check         # compare deterministic fields
 *
 * Both engines receive byte-identical netlists, and the metrics come from the
 * aggregate's own `compareExecutions` (spice-ts grid, linear interpolation, no
 * per-circuit tolerance). Recorded:
 *  1. benchmarks/vbic-substrate/dc-latchup.cir as committed (0.1 V steps),
 *     with the per-point absolute error of every printed signal.
 *  2. Two in-memory variants of the same bytes with only the `.dc` card
 *     changed: 10 mV steps upward (resolves the fold at 2.36 -> 2.37 V) and
 *     10 mV steps downward from 3 V (the latched branch, hysteresis). Their
 *     exact bytes are hashed into the report.
 *  3. The issue-453 rows (vbic-substrate dc/ac, vbic-fo, vbic-common-emitter-ac),
 *     to show they are unchanged or improved.
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

const REPORT_PATH = 'benchmarks/results/issue-472/report.json';
const LATCHUP = 'benchmarks/vbic-substrate/dc-latchup.cir';

interface Fixture {
  key: string;
  localPath: string;
  analyses: ClassicAnalysisType[];
  source: string;
  /** Replace the `.dc` card of the committed bytes (in-memory variant). */
  dcCard?: string;
  /** Record the per-point absolute error of every signal. */
  perPoint?: boolean;
}

const FIXTURES: Fixture[] = [
  { key: 'vbic-substrate/dc-latchup', localPath: LATCHUP, analyses: ['dc'], source: 'project-authored (MIT), issue #453', perPoint: true },
  { key: 'vbic-substrate/dc-latchup@10mV-up', localPath: LATCHUP, analyses: ['dc'], source: 'in-memory variant of dc-latchup.cir', dcCard: '.dc Vsub 2 3 0.01' },
  { key: 'vbic-substrate/dc-latchup@10mV-down', localPath: LATCHUP, analyses: ['dc'], source: 'in-memory variant of dc-latchup.cir', dcCard: '.dc Vsub 3 -1 -0.01' },
  { key: 'vbic-substrate/dc', localPath: 'benchmarks/vbic-substrate/dc.cir', analyses: ['dc'], source: 'project-authored (MIT), issue #453' },
  { key: 'vbic-substrate/ac', localPath: 'benchmarks/vbic-substrate/ac.cir', analyses: ['ac'], source: 'project-authored (MIT), issue #453' },
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

/** Per sweep point: both engines' values and |spice-ts - ngspice| for every shared signal. */
function perPointTable(spiceTs: EngineExecution, ngspice: EngineExecution) {
  const ours = spiceTs.analyses.find(analysis => analysis.type === 'dc')?.series;
  const theirs = ngspice.analyses.find(analysis => analysis.type === 'dc')?.series;
  if (!ours || !theirs) return [];
  const names = Object.keys(ours.signals).filter(name => name in theirs.signals).sort();
  return ours.grid.map((sweep, index) => {
    const reference = theirs.grid.findIndex(value => Math.abs(value - sweep) < 1e-9);
    return {
      sweep: Number(sweep.toPrecision(12)),
      signals: Object.fromEntries(names.map(name => {
        const spiceTsValue = ours.signals[name][index].re;
        const ngspiceValue = reference >= 0 ? theirs.signals[name][reference].re : Number.NaN;
        return [name, { spiceTs: spiceTsValue, ngspice: ngspiceValue, absoluteError: Math.abs(spiceTsValue - ngspiceValue) }];
      })),
    };
  });
}

async function fixtureInput(fixture: Fixture): Promise<Buffer> {
  const committed = await readFile(resolve(fixture.localPath));
  if (fixture.dcCard === undefined) return committed;
  const text = committed.toString('utf8');
  const variant = text.replace(/^\.dc .*$/m, fixture.dcCard);
  if (variant === text) throw new Error(`${fixture.key}: no .dc card to replace`);
  return Buffer.from(variant, 'utf8');
}

async function buildReport() {
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  const fixtures = [];
  for (const fixture of FIXTURES) {
    const input = await fixtureInput(fixture);
    const circuit: ClassicCircuit = {
      id: fixture.key,
      category: fixture.analyses[0],
      analyses: fixture.analyses,
      sourcePath: fixture.localPath,
      sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/472',
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
    const succeeded = spiceTs.status === 'success' && ngspice.status === 'success';
    const comparisons = succeeded ? compareExecutions(spiceTs, ngspice) : [];
    fixtures.push({
      key: fixture.key,
      source: fixture.source,
      input: {
        localPath: fixture.localPath,
        ...(fixture.dcCard ? { dcCard: fixture.dcCard } : {}),
        bytes: input.byteLength,
        sha256: circuit.sha256,
        identicalForBothEngines: true,
      },
      ngspice: { ...engineSummary(ngspice), runtimeMs: Number(ngspiceMs.toFixed(3)) },
      spiceTs: { ...engineSummary(spiceTs), runtimeMs: Number(spiceMs.toFixed(3)) },
      comparisons: signalSummary(comparisons),
      ...(fixture.perPoint && succeeded ? { perPoint: perPointTable(spiceTs, ngspice) } : {}),
    });
  }
  return {
    schemaVersion: 'spice-ts-issue-472/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/472',
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
      throw new Error('issue-472 deterministic receipt fields changed');
    }
    process.stderr.write('issue-472 receipt: deterministic fields match\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
