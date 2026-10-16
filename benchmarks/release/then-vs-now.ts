#!/usr/bin/env tsx
/**
 * Release comparison, never a release/publish command.
 * npm install --prefix "$BASELINE" --ignore-scripts @spice-ts/core@0.3.0
 * spice-heavy pnpm exec tsx benchmarks/release/then-vs-now.ts \
 *   --baseline "$BASELINE/node_modules/@spice-ts/core/dist/index.js" --output "$OUT"
 * Output is scratch evidence, not committed. No per-fixture tolerance overrides.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { compareExecutions } from '../aggregate-report.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit, type EngineExecution } from '../corpus/classic/report.js';
import { M2_CIRCUITS, m2Netlist } from '../performance/scaling-m2-fixture.mjs';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '../..');
export const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'];
export const POLICY = { absoluteMax: 1e-6, relativeMax: 0.01, minimumGridCoverage: 0.95 };
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const flag = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarize(execution: EngineExecution, reference: EngineExecution) {
  const comparisons = compareExecutions(execution, reference);
  const signals = comparisons.flatMap((comparison, index) => Object.entries(comparison.metrics.signals).map(([name, value]) => ({
    key: `${comparison.analysis}:${index}:${name}`, ...value,
  })));
  const measured = signals.filter((signal): signal is Extract<typeof signal, { status: 'compared' }> =>
    signal.status === 'compared' && signal.sampleCount > 0);
  const matched = execution.status === 'success' && reference.status === 'success'
    && comparisons.length > 0 && comparisons.every(comparison => !comparison.unmatched
      && comparison.metrics.grid.alignedPoints >= POLICY.minimumGridCoverage * comparison.metrics.grid.spiceTsPoints)
    && signals.length > 0 && measured.length === signals.length
    && measured.every(signal => Number.isFinite(signal.absoluteError.max)
      && (signal.absoluteError.max <= POLICY.absoluteMax
        || (signal.relativeError.max !== null && signal.relativeError.max <= POLICY.relativeMax)));
  return { status: execution.status, error: execution.error, matched, signals,
    plots: comparisons.map(comparison => ({ analysis: comparison.analysis, unmatched: comparison.unmatched, grid: comparison.metrics.grid })),
    worstAbsoluteMax: measured.length ? Math.max(...measured.map(signal => signal.absoluteError.max)) : null,
    worstRelativeMax: measured.length ? Math.max(...measured.map(signal => signal.relativeError.max ?? 0)) : null,
  };
}

type Engine = 'baseline' | 'candidate' | 'ngspice';
interface Job { input: Buffer; circuit: ClassicCircuit; engine: Engine; coreModule?: string }
interface Receipt { execution: EngineExecution; runtimeMs: number; wallMs?: number }
type Summary = ReturnType<typeof summarize> & { runtimeMs: number };
interface ReferenceSummary { status: EngineExecution['status']; error?: string; runtimeMs: number }
interface Runs { baseline: Summary; candidate: Summary; ngspice: ReferenceSummary }
interface Row extends Runs { name: string; sha256: string }
interface ScalingSample extends Runs { repeat: number; order: Engine[] }
interface ScalingRow { name: string; requestedNodes: number; actualNodes: number; sha256: string; samples: ScalingSample[] }
interface Report { environment: Record<string, unknown>; rows: Row[]; scaling: ScalingRow[] }

export function renderHeadline(report: Report): string {
  const lines = ['| Frozen 100 fixtures | npm baseline | candidate | ngspice |', '|---|---:|---:|---:|'];
  const count = (engine: Engine, status: string) => report.rows.filter(row => row[engine].status === status).length;
  lines.push(`| Run success | ${count('baseline', 'success')}/100 | ${count('candidate', 'success')}/100 | ${count('ngspice', 'success')}/100 |`);
  lines.push(`| Failed / unsupported | ${count('baseline', 'failed')} / ${count('baseline', 'unsupported')} | ${count('candidate', 'failed')} / ${count('candidate', 'unsupported')} | ${count('ngspice', 'failed')} / ${count('ngspice', 'unsupported')} |`);
  lines.push(`| Matched vs complete ngspice reference | ${report.rows.filter(row => row.baseline.matched).length}/100 | ${report.rows.filter(row => row.candidate.matched).length}/100 | reference |`);
  for (const [prefix, unit] of [['v(', 'V'], ['i(', 'A']]) {
    const worst = (engine: 'baseline' | 'candidate') => {
      const values = report.rows.flatMap(row => row[engine].signals.filter(signal => ['op', 'dc', 'tran', 'ac', 'disto'].includes(signal.key.split(':')[0]) && signal.key.split(':').at(-1)?.startsWith(prefix)
        && signal.status === 'compared' && signal.sampleCount > 0)
        .map(signal => signal.status === 'compared' ? signal.absoluteError.max : 0));
      return values.length ? Math.max(...values).toExponential(6) : 'n/a';
    };
    lines.push(`| Worst matched-point absolute max (${unit}) | ${worst('baseline')} | ${worst('candidate')} | — |`);
  }
  lines.push('', '| Scaling workload (requested nodes) | baseline median ms | candidate median ms | ngspice median ms | baseline / candidate | ngspice / candidate |', '|---|---:|---:|---:|---:|---:|');
  for (const row of report.scaling) {
    const value = (engine: Engine) => row.samples.length === 3 && row.samples.every(sample => sample[engine].status === 'success')
      ? median(row.samples.map(sample => sample[engine].runtimeMs)) : null;
    const a = value('baseline'), b = value('candidate'), n = value('ngspice');
    const format = (value: number | null) => value === null ? 'failed/timeout' : value.toFixed(2);
    const ratio = (left: number | null, right: number | null) => left === null || right === null ? '—' : `${(left / right).toFixed(2)}×`;
    lines.push(`| ${row.name} | ${format(a)} | ${format(b)} | ${format(n)} | ${ratio(a, b)} | ${ratio(n, b)} |`);
  }
  lines.push('', 'Ratios >1 favour the candidate. Timings are not correctness wins. Failed/timeout cells have no speed ratio.');
  return lines.join('\n') + '\n';
}

async function worker(inputPath: string, outputPath: string) {
  const job: Job = deserialize(readFileSync(inputPath));
  const started = performance.now();
  const execution = job.engine === 'ngspice'
    ? await runNativeNgspice(job.input, job.circuit)
    : await runNativeSpiceTs(job.input, job.circuit, { coreModule: job.coreModule });
  writeFileSync(outputPath, serialize({ execution, runtimeMs: performance.now() - started }));
}

function bounded(job: Job, directory: string, timeoutMs: number): Receipt {
  const inputPath = join(directory, 'job.v8');
  const outputPath = join(directory, 'result.v8');
  writeFileSync(inputPath, serialize(job));
  rmSync(outputPath, { force: true });
  const start = performance.now();
  const result = spawnSync(process.execPath, [...process.execArgv, script, '--worker', inputPath, '--result', outputPath], {
    cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  });
  const wallMs = performance.now() - start;
  if (result.status === 0 && !result.error) return { ...deserialize(readFileSync(outputPath)), wallMs };
  return { runtimeMs: wallMs, wallMs, execution: { status: 'failed', convergence: 'failed', analyses: [],
    error: result.error?.message ?? `child exit=${result.status} signal=${result.signal}: ${result.stderr.slice(-1000)}` } };
}

async function main() {
  const baseline = flag('--baseline');
  const output = flag('--output');
  if (!baseline || !output) throw new Error('--baseline <installed core entry> and --output <directory> are required');
  const timeoutMs = Number(flag('--timeout-ms') ?? 120000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) throw new Error('invalid --timeout-ms');
  const baselineEntry = resolve(baseline);
  const baselinePackage = JSON.parse(readFileSync(resolve(dirname(baselineEntry), '../package.json'), 'utf8'));
  if (baselinePackage.name !== '@spice-ts/core') throw new Error('baseline must be an installed @spice-ts/core package');
  const modules = { baseline: pathToFileURL(baselineEntry).href, candidate: pathToFileURL(resolve(root, 'packages/core/dist/index.js')).href };
  mkdirSync(resolve(output), { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'release-compare-'));
  const fixtures: Array<{ name: string; circuit: ClassicCircuit; input: Buffer }> = [];
  for (const corpus of CORPORA) {
    const manifest = JSON.parse(readFileSync(resolve(root, `benchmarks/corpus/${corpus}/manifest.json`), 'utf8'));
    if (manifest.circuits.length !== 20) throw new Error(`${corpus}: expected 20 fixtures`);
    for (const circuit of manifest.circuits) {
      const input = readFileSync(resolve(root, circuit.localPath));
      if (hash(input) !== circuit.sha256) throw new Error(`fixture hash mismatch: ${circuit.localPath}`);
      fixtures.push({ name: `${corpus}/${circuit.id}`, circuit, input });
    }
  }
  if (fixtures.length !== 100 || new Set(fixtures.map(f => f.name)).size !== 100) throw new Error('expected 100 unique fixtures');
  const environment = {
    node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
    sha: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
    baseline: baselinePackage.version, baselineEntrySha256: hash(readFileSync(baselineEntry)),
    candidateEntrySha256: hash(readFileSync(resolve(root, 'packages/core/dist/index.js'))),
    sourcesSha256: hash(readFileSync(resolve(root, 'benchmarks/SOURCES.md'))),
    ngspice: spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).stdout.trim(),
    generatedAt: new Date().toISOString(), timeoutMs, policy: POLICY,
  };
  const rows: Row[] = [];
  const scaling: ScalingRow[] = [];
  const checkpoint = () => writeFileSync(resolve(output, 'report.json'), JSON.stringify({ environment, rows, scaling }, null, 2));
  try {
    for (const [index, fixture] of fixtures.entries()) {
      const runs = {} as Record<Engine, Receipt>;
      const order: Engine[] = index % 2 ? ['candidate', 'baseline', 'ngspice'] : ['baseline', 'candidate', 'ngspice'];
      for (const engine of order) runs[engine] = bounded({ ...fixture, engine, coreModule: engine === 'ngspice' ? undefined : modules[engine] }, directory, timeoutMs);
      rows.push({ name: fixture.name, sha256: hash(fixture.input),
        baseline: { ...summarize(runs.baseline.execution, runs.ngspice.execution), runtimeMs: runs.baseline.runtimeMs },
        candidate: { ...summarize(runs.candidate.execution, runs.ngspice.execution), runtimeMs: runs.candidate.runtimeMs },
        ngspice: { status: runs.ngspice.execution.status, error: runs.ngspice.execution.error, runtimeMs: runs.ngspice.runtimeMs } });
      checkpoint();
      console.log(`fixture ${index + 1}/100 ${fixture.name}: ${runs.baseline.execution.status}/${runs.candidate.execution.status}/${runs.ngspice.execution.status}`);
    }
    for (const circuitName of M2_CIRCUITS) for (const nodes of [1000, 10000, 50000]) {
      const generated = m2Netlist(circuitName, nodes);
      // All engines get the same save directive, bounding raw-file IO to the measured probe.
      const input = Buffer.from(generated.netlist.replace(/\.end\s*$/, `.save v(${generated.probe})\n.end\n`));
      const circuit = { id: `${circuitName}-${nodes}`, localPath: `${circuitName}-${nodes}.cir`, analyses: [circuitName === 'resistor-mesh-op' ? 'op' : 'tran'] } as ClassicCircuit;
      const samples: ScalingSample[] = [];
      for (let repeat = 0; repeat < 3; repeat++) {
        const engines: Engine[] = ['baseline', 'candidate', 'ngspice'];
        const order = [...engines.slice(repeat), ...engines.slice(0, repeat)];
        const runs = {} as Record<Engine, Receipt>;
        for (const engine of order) {
          runs[engine] = bounded({ input, circuit, engine, coreModule: engine === 'ngspice' ? undefined : modules[engine] }, directory, timeoutMs);
          console.log(`scaling ${circuit.id} repeat=${repeat + 1} ${engine}: ${runs[engine].execution.status} ${runs[engine].runtimeMs.toFixed(1)}ms`);
        }
        samples.push({ repeat, order, baseline: { ...summarize(runs.baseline.execution, runs.ngspice.execution), runtimeMs: runs.baseline.runtimeMs },
          candidate: { ...summarize(runs.candidate.execution, runs.ngspice.execution), runtimeMs: runs.candidate.runtimeMs },
          ngspice: { status: runs.ngspice.execution.status, error: runs.ngspice.execution.error, runtimeMs: runs.ngspice.runtimeMs } });
        scaling.splice(scaling.findIndex(row => row.name === circuit.id) < 0 ? scaling.length : scaling.findIndex(row => row.name === circuit.id), 1,
          { name: circuit.id, requestedNodes: nodes, actualNodes: generated.actualNodes, sha256: hash(input), samples: [...samples] });
        checkpoint();
      }
    }
    writeFileSync(resolve(output, 'headline.md'), renderHeadline({ environment, rows, scaling }));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === script) {
  const job = flag('--worker');
  const report = flag('--summarize');
  if (report) process.stdout.write(renderHeadline(JSON.parse(readFileSync(report, 'utf8'))));
  else (job ? worker(job, flag('--result')!) : main()).catch(error => { console.error(error); process.exitCode = 1; });
}
