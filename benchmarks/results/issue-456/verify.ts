#!/usr/bin/env tsx
/**
 * Issue #456 receipt: nonlinear device charges integrated with ngspice
 * NIintegrate state (charge + charge current per capacitor).
 *
 * Usage (after `pnpm -C packages/core build`; run once on the base commit and
 * once on the change, each from its own checkout):
 *   npx tsx benchmarks/results/issue-456/verify.ts --output <file.json>
 *   npx tsx benchmarks/results/issue-456/verify.ts --diagnostic-ngspice <binary> --output <file.json>
 *
 * Every comparison runs the same bytes through both engines; metrics come
 * from the aggregate harness (`alignAndMeasure`, spice-ts grid, linear
 * interpolation). `--diagnostic-ngspice` substitutes the ngspice binary, which
 * is how the flag-reset hfet-inverter diagnostic of benchmarks/results/issue-448
 * is reproduced (ngspice-47 with `inverse = FALSE;` reset per HFET instance in
 * hfetload.c). That build is a diagnostic only and is never a published result.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const DECK_DIRECTORY = 'benchmarks/results/issue-456/ngspice';

/** Fixtures from the ngspice corpus manifest, unchanged bytes. */
const CORPUS_FIXTURES = ['hfet-inverter', 'mesa-oscillator'];

/** Project-authored decks (benchmarks/SOURCES.md), identical on both engines. */
const PROJECT_DECKS = ['jfet-gate-charge.cir', 'hfet-inverter-converged.cir'];

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function success(execution: EngineExecution, label: string): EngineExecution['analyses'][number] {
  if (execution.status !== 'success' || !execution.analyses[0]) {
    throw new Error(`${label} did not succeed: ${execution.status} ${execution.error ?? ''}`);
  }
  return execution.analyses[0];
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
  return {
    spiceTsPoints: spiceAnalysis.series.grid.length,
    ngspicePoints: ngAnalysis.series.grid.length,
    signals: perSignal,
  };
}

async function useNgspice(binary: string | undefined): Promise<string> {
  if (!binary) return 'ngspice';
  const directory = await mkdtemp(resolve(tmpdir(), 'spice-ts-issue-456-ngspice-'));
  await symlink(resolve(binary), resolve(directory, 'ngspice'));
  process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ''}`;
  return resolve(binary);
}

async function buildReport(diagnosticBinary: string | undefined) {
  const ngspiceBinary = await useNgspice(diagnosticBinary);
  const manifest = JSON.parse(await readFile(resolve('benchmarks/corpus/ngspice/manifest.json'), 'utf8')) as {
    circuits: ClassicCircuit[];
  };
  const results: Record<string, unknown> = {};
  const circuits: ClassicCircuit[] = [];
  for (const id of CORPUS_FIXTURES) {
    const source = manifest.circuits.find(circuit => circuit.id === id);
    if (!source) throw new Error(`missing ${id} fixture`);
    circuits.push({ ...source, ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } });
  }
  for (const deck of PROJECT_DECKS) {
    const localPath = `${DECK_DIRECTORY}/${deck}`;
    circuits.push({
      id: deck.replace(/\.cir$/, ''),
      category: 'nonlinear',
      analyses: ['tran'],
      localPath,
      sha256: sha256(await readFile(resolve(localPath))),
      ngspice: { expectedStatus: 'pass' },
      spiceTs: { expectedStatus: 'pass' },
    } as ClassicCircuit);
  }
  for (const circuit of circuits) {
    const input = await readFile(resolve(circuit.localPath));
    if (sha256(input) !== circuit.sha256) throw new Error(`${circuit.id} SHA-256 mismatch`);
    const [spice, ngspice] = await Promise.all([
      runNativeSpiceTs(input, circuit),
      runNativeNgspice(input, circuit),
    ]);
    results[circuit.id] = { sha256: circuit.sha256, ...compare(spice, ngspice, circuit.id) };
  }
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  return {
    schemaVersion: 'spice-ts-issue-456/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/456',
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      ngspiceBinary,
      diagnosticNgspice: diagnosticBinary !== undefined,
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
  const diagnosticIndex = process.argv.indexOf('--diagnostic-ngspice');
  const diagnostic = diagnosticIndex >= 0 ? process.argv[diagnosticIndex + 1] : undefined;
  if (diagnosticIndex >= 0 && !diagnostic) throw new Error('--diagnostic-ngspice requires a binary path');
  const report = await buildReport(diagnostic);
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
