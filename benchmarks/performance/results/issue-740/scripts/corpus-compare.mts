#!/usr/bin/env tsx
/**
 * Issue #740: compare two @spice-ts/core builds on the 100 aggregate corpus
 * fixtures. A fill-reducing column order changes the floating-point
 * operations of the complex AC LU, so AC results can differ in the last bits;
 * this reports which fixtures are bit-identical (the #486 corpus-hash digest:
 * SHA-256 of v8.serialize(EngineExecution)) and, for the rest, whether status,
 * convergence, analyses, grids and signal names are identical and the largest
 * per-signal relative difference max|a - b| / max|b| (complex values).
 *
 *   npx tsx benchmarks/performance/results/issue-740/scripts/corpus-compare.mts <before-root> <after-root> <out.json>
 *
 * <root>/packages/core/dist is the build under test (the aggregate's spice-ts
 * adapter, runNativeSpiceTs, loads packages/core/dist from the cwd). Each
 * fixture runs in its own child process per build with the aggregate's 120 s
 * bound.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deserialize, serialize } from 'node:v8';

const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'];
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(scriptPath, '../../../../../..');

interface Complex { re: number; im: number }
interface Execution {
  status: string;
  convergence: string;
  error?: string;
  analyses: Array<{ type: string; plotName: string; series: { grid: number[]; signals: Record<string, Complex[]> } }>;
}

if (process.argv[2] === '--child') {
  const [fixturePath, circuitJson, outPath] = process.argv.slice(3);
  const { runNativeSpiceTs } = await import(pathToFileURL(resolve(repoRoot, 'benchmarks/corpus/classic/report.ts')).href);
  const execution = await runNativeSpiceTs(readFileSync(fixturePath), JSON.parse(circuitJson));
  writeFileSync(outPath, serialize(execution));
  process.exit(0);
}

const [beforeRoot, afterRoot, out] = process.argv.slice(2);
if (!beforeRoot || !afterRoot || !out) throw new Error('usage: corpus-compare.mts <before-root> <after-root> <out.json>');
const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'spice-ts-740-corpus-'));

function run(root: string, fixture: string, circuit: unknown, file: string): Buffer | string {
  const child = spawnSync(process.execPath, [...process.execArgv, scriptPath, '--child', fixture, JSON.stringify(circuit), file], {
    cwd: resolve(root), encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024,
  });
  if (child.status !== 0) return `child-failed:${child.error?.message ?? child.status}`;
  return readFileSync(file);
}

function compare(a: Execution, b: Execution): { structure: boolean; maxAnalysisRelDiff: number; maxSignalRelDiff: number; worstSignal?: string; types: string[] } {
  const types = b.analyses.map(analysis => analysis.type);
  const broken = { structure: false, maxAnalysisRelDiff: Infinity, maxSignalRelDiff: Infinity, types };
  if (a.status !== b.status || a.convergence !== b.convergence || a.analyses.length !== b.analyses.length) return broken;
  let maxAnalysisRelDiff = 0;
  let maxSignalRelDiff = 0;
  let worstSignal: string | undefined;
  for (let k = 0; k < b.analyses.length; k++) {
    const [x, y] = [a.analyses[k], b.analyses[k]];
    if (x.type !== y.type || x.series.grid.length !== y.series.grid.length) return broken;
    if (x.series.grid.some((value, i) => value !== y.series.grid[i])) return broken;
    const names = Object.keys(y.series.signals).sort();
    if (names.join('\n') !== Object.keys(x.series.signals).sort().join('\n')) return broken;
    // Differences relative to each signal's own peak, and to the analysis
    // peak (a signal that is pure round-off around zero, e.g. an AC supply
    // node at 1e-20 V, has a per-signal relative difference near 1).
    let analysisPeak = 0;
    let analysisDiff = 0;
    for (const name of names) {
      const [sx, sy] = [x.series.signals[name], y.series.signals[name]];
      let diff = 0;
      let scale = 0;
      sy.forEach((value, i) => {
        diff = Math.max(diff, Math.hypot(sx[i].re - value.re, sx[i].im - value.im));
        scale = Math.max(scale, Math.hypot(value.re, value.im));
      });
      analysisPeak = Math.max(analysisPeak, scale);
      analysisDiff = Math.max(analysisDiff, diff);
      const relative = scale === 0 ? (diff === 0 ? 0 : Infinity) : diff / scale;
      if (relative > maxSignalRelDiff) {
        maxSignalRelDiff = relative;
        worstSignal = `${y.type} ${name} (peak ${scale.toExponential(3)}, diff ${diff.toExponential(3)})`;
      }
    }
    const relative = analysisPeak === 0 ? (analysisDiff === 0 ? 0 : Infinity) : analysisDiff / analysisPeak;
    maxAnalysisRelDiff = Math.max(maxAnalysisRelDiff, relative);
  }
  return { structure: true, maxAnalysisRelDiff, maxSignalRelDiff, worstSignal, types };
}

const results: Record<string, unknown> = {};
let identical = 0;
let total = 0;
for (const corpus of CORPORA) {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, `benchmarks/corpus/${corpus}/manifest.json`), 'utf8'));
  for (const circuit of manifest.circuits) {
    const key = `${corpus}/${circuit.id}`;
    const fixture = resolve(repoRoot, circuit.localPath);
    const before = run(beforeRoot, fixture, circuit, join(work, 'before.bin'));
    const after = run(afterRoot, fixture, circuit, join(work, 'after.bin'));
    total++;
    const digest = (value: Buffer | string) => (typeof value === 'string' ? value : createHash('sha256').update(value).digest('hex'));
    const entry: Record<string, unknown> = { before: digest(before), after: digest(after) };
    if (entry.before === entry.after) {
      identical++;
      entry.identical = true;
    } else if (typeof before !== 'string' && typeof after !== 'string') {
      Object.assign(entry, { identical: false, ...compare(deserialize(after) as Execution, deserialize(before) as Execution) });
    } else {
      entry.identical = false;
    }
    results[key] = entry;
    console.log(`${key} ${JSON.stringify(entry)}`);
  }
}
rmSync(work, { recursive: true, force: true });
writeFileSync(out, `${JSON.stringify({ total, identical, fixtures: results }, null, 2)}\n`);
console.log(`${identical}/${total} bit-identical -> ${out}`);
