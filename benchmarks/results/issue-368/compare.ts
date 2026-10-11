#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpiceEngine } from '../../../packages/wasm/dist/index.js';
import { parseNgspiceRaw } from '../../comparison-harness.js';

const scriptPath = fileURLToPath(import.meta.url);
const directory = dirname(scriptPath);
const reportPath = resolve(directory, 'report.json');
const repetitions = 5;
const relativeErrorFloor = 1e-12;
const baselineRevision = 'd3eaf5a9e6a19ebb56741967d14291c2b3392be1';
const baseline = { workerJs: 434_883, indexJs: 43_149, denseSolverWasm: 4_418 };
const fixtures = ['series-rlc.cir', 'parallel-rlc.cir'];
const unsupportedFixtures = readdirSync(resolve(directory, 'unsupported')).filter(name => name.endsWith('.cir')).sort();

type Backend = 'spice-ts-wasm' | 'spice-ts-js';
type Waveform = { timeS: number[]; vectors: Record<string, number[]> };
type SuiteRun = { wallMs: number; waveforms: Record<string, Waveform> };

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function version(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  if (command === 'ngspice') return output.match(/ngspice-\d+[^\n]*/i)?.[0] ?? 'unavailable';
  return output.split('\n')[0] ?? 'unavailable';
}

function read(path: string): string {
  return readFileSync(resolve(directory, path), 'utf8');
}

/** Protocol names -> ngspice raw names: node `out` -> `v(out)`, branch `L1` -> `i(l1)`. */
function protocolWaveform(analysis: { timeS: number[]; voltagesV: Record<string, number[]>; currentsA: Record<string, number[]> }): Waveform {
  const vectors: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(analysis.voltagesV)) vectors[`v(${name.toLowerCase()})`] = values;
  for (const [name, values] of Object.entries(analysis.currentsA)) vectors[`i(${name.toLowerCase()})`] = values;
  return { timeS: analysis.timeS, vectors };
}

async function child(backend: Backend): Promise<void> {
  const engine = await createSpiceEngine({ backend });
  try {
    const waveforms: Record<string, Waveform> = {};
    for (const fixture of fixtures) {
      const result = await engine.simulate({ apiVersion: '1', input: { format: 'spice', source: read(fixture) } }, {
        requestId: fixture,
      });
      if (!result.ok) throw new Error(`${backend} ${fixture}: ${JSON.stringify(result.error)}`);
      if (result.metadata?.backend !== backend) throw new Error(`${fixture} ran on ${result.metadata?.backend}, not ${backend}`);
      const transient = result.data.analyses[0];
      if (transient?.type !== 'tran') throw new Error(`${backend} ${fixture}: no transient analysis`);
      waveforms[fixture] = protocolWaveform(transient);
    }
    process.stdout.write(JSON.stringify(waveforms));
  } finally {
    await engine.close();
  }
}

function runChild(backend: Backend): SuiteRun {
  const started = performance.now();
  const result = spawnSync('pnpm', ['exec', 'tsx', scriptPath, `--child=${backend}`], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000,
  });
  const wallMs = performance.now() - started;
  if (result.status !== 0) throw new Error(`${backend} child failed: ${result.stderr}`);
  return { wallMs, waveforms: JSON.parse(result.stdout) as Record<string, Waveform> };
}

function ngspice(source: string): { status: 'complete' | 'failed'; waveform?: Waveform; log: string } {
  const work = mkdtempSync(join(tmpdir(), 'issue-368-'));
  const netlist = join(work, 'circuit.cir');
  const raw = join(work, 'circuit.raw');
  writeFileSync(netlist, source);
  writeFileSync(join(work, '.spiceinit'), 'set filetype=ascii\n');
  try {
    const result = spawnSync('ngspice', ['-b', '-r', raw, netlist], {
      encoding: 'utf8', env: { ...process.env, HOME: work }, maxBuffer: 64 * 1024 * 1024, timeout: 120_000,
    });
    const log = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status !== 0) return { status: 'failed', log };
    const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(value => value.plotName.toLowerCase().includes('transient'));
    if (!plot) return { status: 'failed', log };
    const vectors = Object.fromEntries(Object.entries(plot.signals).map(([name, values]) => [name, values.map(value => value.re)]));
    return { status: 'complete', waveform: { timeS: plot.grid, vectors }, log };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function runNgspiceSuite(): SuiteRun {
  const started = performance.now();
  const waveforms: Record<string, Waveform> = {};
  for (const fixture of fixtures) {
    const result = ngspice(read(fixture));
    if (result.status !== 'complete' || !result.waveform) throw new Error(`ngspice ${fixture} failed: ${result.log}`);
    waveforms[fixture] = result.waveform;
  }
  return { wallMs: performance.now() - started, waveforms };
}

function interpolate(reference: Waveform, vector: string, time: number): { value: number; span: number } {
  const values = reference.vectors[vector];
  if (!values) throw new Error(`reference omitted ${vector}`);
  const exact = reference.timeS.findIndex(candidate => Math.abs(candidate - time) <= 1e-15);
  if (exact >= 0) return { value: values[exact]!, span: 0 };
  const upper = reference.timeS.findIndex(candidate => candidate > time);
  if (upper <= 0) throw new Error(`reference does not bracket timepoint ${time}`);
  const t0 = reference.timeS[upper - 1]!;
  const t1 = reference.timeS[upper]!;
  const v0 = values[upper - 1]!;
  return { value: v0 + (time - t0) / (t1 - t0) * (values[upper]! - v0), span: t1 - t0 };
}

function compare(reference: Waveform, actual: Waveform, vector: string) {
  const absolute: number[] = [];
  const relative: number[] = [];
  let peak = 0;
  let span = 0;
  actual.timeS.forEach((time, index) => {
    const expected = interpolate(reference, vector, time);
    const error = Math.abs(actual.vectors[vector]![index]! - expected.value);
    absolute.push(error);
    relative.push(error / Math.max(Math.abs(expected.value), relativeErrorFloor));
    peak = Math.max(peak, Math.abs(expected.value));
    span = Math.max(span, expected.span);
  });
  const rms = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  return {
    matchedPointCount: absolute.length,
    maximumReferenceInterpolationSpanS: span,
    referencePeakMagnitude: peak,
    maximumAbsoluteError: Math.max(...absolute),
    rmsAbsoluteError: rms(absolute),
    maximumAbsoluteErrorOverPeak: Math.max(...absolute) / Math.max(peak, relativeErrorFloor),
    maximumRelativeError: Math.max(...relative),
    rmsRelativeError: rms(relative),
  };
}

async function unsupportedForms() {
  const engines = {
    wasm: await createSpiceEngine({ backend: 'spice-ts-wasm' }),
    ts: await createSpiceEngine({ backend: 'spice-ts-js' }),
  };
  try {
    const rows = [];
    for (const name of unsupportedFixtures) {
      const source = read(join('unsupported', name));
      const outcome = async (engine: typeof engines.wasm) => {
        const result = await engine.simulate({ apiVersion: '1', input: { format: 'spice', source } }, { requestId: name });
        return result.ok
          ? { status: 'complete', backend: result.metadata?.backend }
          : { status: 'error', backend: result.metadata?.backend, code: result.error.code, phase: result.error.phase, message: result.error.message, details: result.error.details };
      };
      rows.push({
        fixture: `benchmarks/results/issue-368/unsupported/${name}`,
        sha256: sha256(source),
        wasm: await outcome(engines.wasm),
        typescript: await outcome(engines.ts),
        ngspice: { status: ngspice(source).status },
      });
    }
    return rows;
  } finally {
    await engines.wasm.close();
    await engines.ts.close();
  }
}

async function main(): Promise<void> {
  const wasmRuns = Array.from({ length: repetitions }, () => runChild('spice-ts-wasm'));
  const tsRuns = Array.from({ length: repetitions }, () => runChild('spice-ts-js'));
  const ngspiceRuns = Array.from({ length: repetitions }, runNgspiceSuite);
  const stat = (runs: SuiteRun[]) => ({ samples: runs.map(run => run.wallMs), median: median(runs.map(run => run.wallMs)) });
  const results = fixtures.map(fixture => {
    const wasm = wasmRuns[0]!.waveforms[fixture]!;
    const ts = tsRuns[0]!.waveforms[fixture]!;
    const reference = ngspiceRuns[0]!.waveforms[fixture]!;
    const vectors = Object.keys(reference.vectors).sort();
    const missing = vectors.filter(vector => !wasm.vectors[vector] || !ts.vectors[vector]);
    if (missing.length > 0) throw new Error(`${fixture}: engines omitted ${missing.join(', ')}`);
    const deterministic = wasmRuns.every(run => JSON.stringify(run.waveforms[fixture]) === JSON.stringify(wasm));
    const source = read(fixture);
    return {
      fixture: `benchmarks/results/issue-368/${fixture}`,
      sha256: sha256(source),
      identicalInputBytes: true,
      convergence: { wasm: 'complete', typescript: 'complete', ngspice: 'complete' },
      pointCounts: { wasm: wasm.timeS.length, typescript: ts.timeS.length, ngspice: reference.timeS.length },
      wasmDeterministicAcrossRuns: deterministic,
      matchedAt: 'every exact WASM output time; TypeScript and ngspice are linearly interpolated between bracketing points',
      errors: {
        wasmVsNgspice: Object.fromEntries(vectors.map(vector => [vector, compare(reference, wasm, vector)])),
        typescriptVsNgspice: Object.fromEntries(vectors.map(vector => [vector, compare(reference, {
          timeS: wasm.timeS,
          vectors: { [vector]: wasm.timeS.map(time => interpolate(ts, vector, time).value) },
        }, vector)])),
        wasmVsTypescript: Object.fromEntries(vectors.map(vector => [vector, compare(ts, wasm, vector)])),
      },
    };
  });

  const dist = (name: string) => readFileSync(resolve(directory, '../../../packages/wasm/dist', name)).byteLength;
  const after = { workerJs: dist('worker.js'), indexJs: dist('index.js'), denseSolverWasm: dist('dense-solver.wasm') };
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
  const report = {
    schemaVersion: 1,
    issue: 368,
    generatedAt: new Date().toISOString(),
    methodology: {
      repetitions,
      timing: 'one fresh process per suite run: pnpm + tsx + Node + worker construction + both fixtures for spice-ts backends; one fresh native ngspice process per fixture',
      matching: 'linear interpolation of each reference at every exact WASM fixed-step output time',
      relativeErrorFloor,
      integration: 'bounded fixed-step trapezoidal WASM; adaptive TypeScript engine; default adaptive ngspice-47; no per-circuit or per-engine tolerances',
      fallback: 'the WASM child asserts metadata.backend === spice-ts-wasm for every fixture; the backend has no TypeScript fallback',
    },
    versions: {
      measuredRevision: version('git', ['rev-parse', 'HEAD']),
      worktreeClean: status === '',
      node: process.version,
      pnpm: version('pnpm', ['--version']),
      ngspice: version('ngspice', ['--version']),
    },
    machine: {
      platform: `${process.platform} ${process.arch}`,
      os: version('uname', ['-srv']),
      cpu: process.platform === 'darwin' ? version('sysctl', ['-n', 'machdep.cpu.brand_string']) : 'not measured',
    },
    commands: {
      reproduce: 'pnpm --filter @spice-ts/wasm bench:rlc-tran',
      wasm: 'pnpm exec tsx benchmarks/results/issue-368/compare.ts --child=spice-ts-wasm',
      typescript: 'pnpm exec tsx benchmarks/results/issue-368/compare.ts --child=spice-ts-js',
      ngspice: 'ngspice -b -r <raw> <identical-netlist>',
    },
    results,
    unsupportedForms: await unsupportedForms(),
    performance: {
      wasmSuiteWallMs: stat(wasmRuns),
      typescriptSuiteWallMs: stat(tsRuns),
      ngspiceSuiteWallMs: stat(ngspiceRuns),
    },
    artifactSizesBytes: {
      baselineRevision,
      before: baseline,
      after,
      delta: Object.fromEntries(Object.entries(baseline).map(([name, bytes]) => [name, after[name as keyof typeof after] - bytes])),
    },
    retainedLosses: [
      'WASM uses a fixed print-step trapezoidal solve; ngspice and the TypeScript engine use adaptive internal timesteps, so waveform errors are dominated by timestep choice, not stamping.',
      'Coupled inductors (K), inductor IC=, and inductor instance parameters/models/expressions are rejected by WASM with UNSUPPORTED_FEATURE although ngspice-47 completes them (see unsupportedForms).',
      'End-to-end WASM and TypeScript timings include pnpm, tsx and Node startup and lose to native ngspice; this is not a speed claim.',
      'Relative errors near signal zero crossings use the declared 1e-12 denominator floor and are therefore large; maximumAbsoluteErrorOverPeak is reported alongside.',
      'worker.js grows by the reported delta for the inductor validation; dense-solver.wasm is unchanged.',
    ],
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const childArgument = process.argv.find(argument => argument.startsWith('--child='));
if (childArgument) {
  child(childArgument.slice('--child='.length) as Backend).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
