#!/usr/bin/env tsx
/**
 * Issue #468 receipt: MOS6 (level 6) Meyer gate and bulk-junction charges
 * integrated with ngspice NIintegrate state (TransientChargeState) instead of
 * the generic C(v) trapezoidal history. Also measures the i(vin) ringing of
 * issue #461 (sign flips of the i(vin) error between consecutive points).
 *
 * Usage (after `pnpm -C packages/core build`; run once on the base commit and
 * once on the change, each from its own checkout):
 *   npx tsx benchmarks/results/issue-468/verify.ts --output <file.json>
 *
 * Every comparison runs the same bytes through both engines; metrics come
 * from the aggregate harness (`alignAndMeasure`, spice-ts grid, linear
 * interpolation).
 */
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

/** [manifest, fixture id], unchanged bytes. */
const FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['benchmarks/corpus/ngspice/manifest.json', 'mos6-simple-inverter-transient'],
  ['benchmarks/corpus/ngspice/manifest.json', 'mos6-inverter-transient'],
  ['benchmarks/corpus/classic/manifest.json', 'mos6-inverter-chain'],
];

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function success(execution: EngineExecution, label: string): EngineExecution['analyses'][number] {
  if (execution.status !== 'success' || !execution.analyses[0]) {
    throw new Error(`${label} did not succeed: ${execution.status} ${execution.error ?? ''}`);
  }
  return execution.analyses[0];
}

function interpolate(grid: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < grid.length - 1 && grid[index] < at) index++;
  const start = grid[index - 1];
  const end = grid[index];
  if (end === start) return values[index];
  return values[index - 1] + (values[index] - values[index - 1]) * (at - start) / (end - start);
}

/** Error sign flips between consecutive spice-ts points (issue #461 ringing metric). */
function ringing(
  spice: EngineExecution['analyses'][number],
  ngspice: EngineExecution['analyses'][number],
  signal: string,
) {
  const grid = spice.series.grid;
  // Transient series are real-valued.
  const values = spice.series.signals[signal]?.map(value => value.re);
  const reference = ngspice.series.signals[signal]?.map(value => value.re);
  if (!values || !reference) return undefined;
  const ngGrid = ngspice.series.grid;
  let errorFlips = 0;
  let slopeFlips = 0;
  let previousError = 0;
  let previousSlope = 0;
  for (let index = 0; index < grid.length; index++) {
    if (grid[index] < ngGrid[0] || grid[index] > ngGrid[ngGrid.length - 1]) continue;
    const error = values[index] - interpolate(ngGrid, reference, grid[index]);
    if (previousError * error < 0) errorFlips++;
    previousError = error;
    if (index > 0) {
      const slope = values[index] - values[index - 1];
      if (previousSlope * slope < 0) slopeFlips++;
      if (slope !== 0) previousSlope = slope;
    }
  }
  let ngSlopeFlips = 0;
  let ngPreviousSlope = 0;
  for (let index = 1; index < ngGrid.length; index++) {
    const slope = reference[index] - reference[index - 1];
    if (ngPreviousSlope * slope < 0) ngSlopeFlips++;
    if (slope !== 0) ngPreviousSlope = slope;
  }
  return { errorSignFlips: errorFlips, spiceTsSlopeFlips: slopeFlips, ngspiceSlopeFlips: ngSlopeFlips };
}

function compare(spice: EngineExecution, ngspice: EngineExecution, label: string) {
  const spiceAnalysis = success(spice, `spice-ts ${label}`);
  const ngAnalysis = success(ngspice, `ngspice ${label}`);
  const signals = Object.keys(spiceAnalysis.series.signals)
    .filter(signal => ngAnalysis.series.signals[signal] !== undefined)
    .sort();
  const metrics = alignAndMeasure(spiceAnalysis.series, ngAnalysis.series, signals);
  const perSignal = Object.fromEntries(Object.entries(metrics.signals).map(([signal, metric]) => [
    signal,
    metric.status === 'compared'
      ? { absMax: metric.absoluteError.max, absRms: metric.absoluteError.rms }
      : { status: metric.status },
  ]));
  const currentSignals = signals.filter(signal => /^i\(/i.test(signal));
  return {
    spiceTsPoints: spiceAnalysis.series.grid.length,
    ngspicePoints: ngAnalysis.series.grid.length,
    signals: perSignal,
    ringing: Object.fromEntries(currentSignals.map(signal => [signal, ringing(spiceAnalysis, ngAnalysis, signal)])),
  };
}

async function buildReport() {
  const results: Record<string, unknown> = {};
  for (const [manifestPath, id] of FIXTURES) {
    const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8')) as { circuits: ClassicCircuit[] };
    const source = manifest.circuits.find(circuit => circuit.id === id);
    if (!source) throw new Error(`missing ${id} fixture`);
    const circuit = { ...source, ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as ClassicCircuit;
    const input = await readFile(resolve(circuit.localPath));
    if (sha256(input) !== circuit.sha256) throw new Error(`${circuit.id} SHA-256 mismatch`);
    const [spice, ngspice] = await Promise.all([
      runNativeSpiceTs(input, circuit),
      runNativeNgspice(input, circuit),
    ]);
    results[circuit.id] = { sha256: circuit.sha256, ...compare(spice, ngspice, circuit.id) };
  }
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  return {
    schemaVersion: 'spice-ts-issue-468/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/468',
    commit,
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
    },
    policy: {
      fixtureAdaptation: 'none: identical bytes on both engines',
      perCircuitToleranceTuning: false,
      comparisonGrid: 'spice-ts',
      interpolation: 'linear',
    },
    results,
  };
}

async function main(): Promise<void> {
  const report = await buildReport();
  const outputIndex = process.argv.indexOf('--output');
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (outputIndex >= 0) {
    const output = process.argv[outputIndex + 1];
    if (!output) throw new Error('--output requires a path');
    await writeFile(resolve(output), text);
    return;
  }
  process.stdout.write(text);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
