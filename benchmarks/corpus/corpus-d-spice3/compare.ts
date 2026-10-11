#!/usr/bin/env tsx
/**
 * Per-fixture results for the corpus-d-spice3 translations (issue #524, lane 1).
 *
 * Usage:
 *   pnpm -C packages/core build
 *   pnpm exec tsx benchmarks/corpus/corpus-d-spice3/compare.ts
 *
 * For every translated deck, ngspice and spice-ts receive the identical bytes (the input SHA-256
 * is checked against the manifest) and run exactly as in benchmarks/aggregate-report.ts. Where the
 * ahkab test suite ships a reference result for the circuit, both engines are also measured
 * against it as a third column. No tolerance is applied and nothing is tuned per circuit: the
 * report only records statuses and worst-case absolute errors. Fixtures marked
 * unsupported-translation are listed with their reasons and not run.
 *
 * Writes results.json and RESULTS.md next to this file. Registration in the aggregate report is
 * deliberately left to #524 lane 4.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareExecutions } from '../../aggregate-report.js';
import { alignAndMeasure, type ComparisonMetrics, type SampleSeries } from '../../comparison-harness.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit, type EngineExecution } from '../classic/report.js';
import type { TranslatedCircuit, TranslatedManifest } from '../../translate/ahkab-to-spice3.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

interface Worst {
  analysis: string;
  signals: number;
  points: number;
  worstSignal: string | null;
  worstAbsMax: number | null;
}

interface EngineResult {
  status: EngineExecution['status'];
  error?: string;
  analyses: string[];
}

interface FixtureResult {
  id: string;
  translation: TranslatedCircuit['translation']['status'];
  reasons?: string[];
  inputSha256?: string;
  ngspice?: EngineResult;
  spiceTs?: EngineResult;
  spiceTsVsNgspice?: Worst[];
  ngspiceVsAhkab?: Worst[];
  spiceTsVsAhkab?: Worst[];
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function worst(analysis: string, metrics: ComparisonMetrics): Worst {
  let worstSignal: string | null = null;
  let worstAbsMax: number | null = null;
  let signals = 0;
  for (const [signal, value] of Object.entries(metrics.signals)) {
    if (value.status !== 'compared') continue;
    signals += 1;
    if (worstAbsMax === null || value.absoluteError.max > worstAbsMax) {
      worstAbsMax = value.absoluteError.max;
      worstSignal = signal;
    }
  }
  return { analysis, signals, points: metrics.grid.alignedPoints, worstSignal, worstAbsMax };
}

/** ahkab result file: `#T\tV1\tI(V1)` header, tab-separated rows. V<node> -> v(node), I(X) -> i(x). */
export function parseAhkabReference(text: string): SampleSeries {
  const [header, ...rows] = text.trim().split('\n');
  const names = header.replace(/^#/, '').split('\t');
  const grid: number[] = [];
  const columns = names.map(() => [] as number[]);
  for (const row of rows) {
    const values = row.split('\t').map(Number);
    values.forEach((value, index) => columns[index].push(value));
  }
  const signals: SampleSeries['signals'] = {};
  const timeIndex = names[0].toUpperCase() === 'T' ? 0 : -1;
  names.forEach((name, index) => {
    if (index === timeIndex) return;
    const current = /^I\((.+)\)$/i.exec(name);
    const key = current ? `i(${current[1].toLowerCase()})` : `v(${name.replace(/^V/i, '').toLowerCase()})`;
    signals[key] = columns[index].map(re => ({ re, im: 0 }));
  });
  if (timeIndex === 0) grid.push(...columns[0]);
  else grid.push(0);
  return { grid, signals };
}

function compareToReference(execution: EngineExecution, analysis: 'op' | 'tran', reference: SampleSeries): Worst | null {
  const engine = execution.analyses.find(candidate => candidate.type === analysis);
  if (!engine) return null;
  const signals = Object.keys(engine.series.signals).filter(signal => reference.signals[signal] !== undefined).sort();
  if (signals.length === 0) return { analysis, signals: 0, points: 0, worstSignal: null, worstAbsMax: null };
  return worst(analysis, alignAndMeasure(engine.series, reference, signals));
}

function engineResult(execution: EngineExecution): EngineResult {
  const result: EngineResult = { status: execution.status, analyses: execution.analyses.map(analysis => analysis.type) };
  if (execution.error) result.error = execution.error.split('\n')[0].slice(0, 200);
  return result;
}

function format(value: number | null): string {
  return value === null ? '-' : value.toExponential(3);
}

function cell(rows: Worst[] | undefined): string {
  if (!rows || rows.length === 0) return '-';
  return rows.map(row => `${row.analysis}: ${format(row.worstAbsMax)}${row.worstSignal ? ` ${row.worstSignal}` : ''} (${row.signals} sig, ${row.points} pts)`).join('<br>');
}

function markdown(results: FixtureResult[], tools: Record<string, string>): string {
  const translated = results.filter(result => result.translation === 'translated');
  const count = (engine: 'ngspice' | 'spiceTs') => translated.filter(result => result[engine]?.status === 'success').length;
  const lines = [
    '# corpus-d-spice3 per-fixture results',
    '',
    `Generated by \`pnpm exec tsx benchmarks/corpus/corpus-d-spice3/compare.ts\` with ${tools.ngspice} and @spice-ts/core ${tools.spiceTs} on ${tools.platform}.`,
    'Both engines receive the identical translated bytes. Errors are worst absolute max over the common signals, on the first engine\'s grid, with no tolerance and no per-circuit tuning.',
    'The ahkab column compares against the result files shipped in the ahkab test suite (copied verbatim under references/).',
    '',
    `Translated: ${translated.length}/20; unsupported-translation: ${results.length - translated.length}/20. ngspice success: ${count('ngspice')}/${translated.length}; spice-ts success: ${count('spiceTs')}/${translated.length}.`,
    '',
    '| Fixture | Translation | ngspice | spice-ts | spice-ts vs ngspice | ngspice vs ahkab ref | spice-ts vs ahkab ref |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const result of results) {
    if (result.translation !== 'translated') {
      lines.push(`| ${result.id} | unsupported-translation: ${(result.reasons ?? []).join('; ')} | not run | not run | - | - | - |`);
      continue;
    }
    const engine = (value?: EngineResult) => value ? `${value.status}${value.error ? `: ${value.error.replace(/\|/g, '\\|')}` : ''}` : '-';
    lines.push(`| ${result.id} | translated | ${engine(result.ngspice)} | ${engine(result.spiceTs)} | ${cell(result.spiceTsVsNgspice)} | ${cell(result.ngspiceVsAhkab)} | ${cell(result.spiceTsVsAhkab)} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(HERE, 'manifest.json'), 'utf8')) as TranslatedManifest;
  const results: FixtureResult[] = [];
  for (const circuit of manifest.circuits) {
    if (circuit.translation.status !== 'translated') {
      results.push({ id: circuit.id, translation: circuit.translation.status, reasons: circuit.translation.reasons });
      continue;
    }
    const input = await readFile(resolve(ROOT, circuit.localPath ?? ''));
    const inputSha256 = sha256(input);
    if (inputSha256 !== circuit.sha256) throw new Error(`${circuit.id}: translated fixture SHA-256 mismatch`);
    const classic = { ...circuit, analyses: circuit.analyses ?? [] } as unknown as ClassicCircuit;
    const ngspice = await runNativeNgspice(input, classic);
    const spiceTs = await runNativeSpiceTs(input, classic);
    const result: FixtureResult = {
      id: circuit.id,
      translation: 'translated',
      inputSha256,
      ngspice: engineResult(ngspice),
      spiceTs: engineResult(spiceTs),
      spiceTsVsNgspice: compareExecutions(spiceTs, ngspice).map(comparison => worst(comparison.analysis, comparison.metrics)),
      ngspiceVsAhkab: [],
      spiceTsVsAhkab: [],
    };
    for (const reference of circuit.ahkabReferences ?? []) {
      const series = parseAhkabReference(await readFile(resolve(ROOT, reference.localPath), 'utf8'));
      const ng = compareToReference(ngspice, reference.analysis, series);
      const ts = compareToReference(spiceTs, reference.analysis, series);
      if (ng) result.ngspiceVsAhkab?.push(ng);
      if (ts) result.spiceTsVsAhkab?.push(ts);
    }
    results.push(result);
    console.error(`${circuit.id}: ngspice=${ngspice.status} spice-ts=${spiceTs.status}`);
  }
  const ngspiceVersion = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout?.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'ngspice (unknown)';
  const spiceTsVersion = (JSON.parse(await readFile(resolve(ROOT, 'packages/core/package.json'), 'utf8')) as { version: string }).version;
  const tools = { ngspice: ngspiceVersion, spiceTs: spiceTsVersion, platform: `${process.platform}-${process.arch}` };
  await writeFile(resolve(HERE, 'results.json'), `${JSON.stringify({ tools, results }, null, 2)}\n`);
  await writeFile(resolve(HERE, 'RESULTS.md'), markdown(results, tools));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
