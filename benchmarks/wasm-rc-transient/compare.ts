#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSpiceEngine } from '../../packages/wasm/dist/index.js';
import { parseNgspiceRaw } from '../comparison-harness.js';

const scriptPath = fileURLToPath(import.meta.url);
const fixturePath = resolve(dirname(scriptPath), 'rc-step.cir');
const reportPath = resolve(dirname(scriptPath), 'report.json');
const repetitions = 5;

type Waveform = { timeS: number[]; vectors: Record<string, number[]> };
type Run = { wallMs: number; peakRssMiB: number; waveform: Waveform };

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

function peakRssMiB(stderr: string): number {
  const darwin = stderr.match(/(\d+)\s+maximum resident set size/i);
  if (darwin) return Number(darwin[1]) / 1024 / 1024;
  const gnu = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/i);
  if (gnu) return Number(gnu[1]) / 1024;
  throw new Error('peak RSS was not reported by /usr/bin/time');
}

async function wasmChild(): Promise<void> {
  const source = readFileSync(fixturePath, 'utf8');
  const engine = await createSpiceEngine({ backend: 'spice-ts-wasm' });
  try {
    const result = await engine.simulate({ apiVersion: '1', input: { format: 'spice', source } }, { requestId: 'benchmark' });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const transient = result.data.analyses[0];
    if (transient?.type !== 'tran') throw new Error('WASM backend returned no transient analysis');
    process.stdout.write(JSON.stringify({
      timeS: transient.timeS,
      vectors: {
        'v(in)': transient.voltagesV.in,
        'v(out)': transient.voltagesV.out,
        'i(v1)': transient.currentsA.V1,
      },
    }));
  } finally {
    await engine.close();
  }
}

function runWasm(): Run {
  const started = performance.now();
  const result = spawnSync('/usr/bin/time', [
    process.platform === 'darwin' ? '-l' : '-v',
    'pnpm', 'exec', 'tsx', scriptPath, '--child=wasm',
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
  const wallMs = performance.now() - started;
  if (result.status !== 0) throw new Error(`WASM child failed: ${result.stderr}`);
  return { wallMs, peakRssMiB: peakRssMiB(result.stderr), waveform: JSON.parse(result.stdout) as Waveform };
}

function runNgspice(source: string): Run {
  const directory = mkdtempSync(join(tmpdir(), 'wasm-rc-transient-'));
  const netlist = join(directory, 'rc-step.cir');
  const raw = join(directory, 'rc-step.raw');
  writeFileSync(netlist, source);
  writeFileSync(join(directory, '.spiceinit'), 'set filetype=ascii\n');
  try {
    const started = performance.now();
    const result = spawnSync('/usr/bin/time', [
      process.platform === 'darwin' ? '-l' : '-v',
      'ngspice', '-b', '-r', raw, netlist,
    ], { encoding: 'utf8', env: { ...process.env, HOME: directory }, maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
    const wallMs = performance.now() - started;
    if (result.status !== 0) throw new Error(`ngspice failed: ${result.stderr}`);
    const plot = parseNgspiceRaw(readFileSync(raw, 'utf8')).find(value => value.plotName.toLowerCase().includes('transient'));
    if (!plot) throw new Error('ngspice returned no transient plot');
    const vectors = Object.fromEntries(['v(in)', 'v(out)', 'i(v1)'].map(name => {
      const signal = plot.signals[name];
      if (!signal) throw new Error(`ngspice omitted ${name}`);
      return [name, signal.map(value => value.re)];
    }));
    return { wallMs, peakRssMiB: peakRssMiB(result.stderr), waveform: { timeS: plot.grid, vectors } };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function matched(reference: Waveform, actual: Waveform, vector: string) {
  const refValues: number[] = [];
  const actualValues: number[] = [];
  const matchedTimes: number[] = [];
  let maximumInterpolationSpanS = 0;
  for (let index = 0; index < actual.timeS.length; index++) {
    const time = actual.timeS[index]!;
    const exact = reference.timeS.findIndex(candidate => Math.abs(candidate - time) <= 1e-15);
    if (exact >= 0) {
      refValues.push(reference.vectors[vector]![exact]!);
    } else {
      const upper = reference.timeS.findIndex(candidate => candidate > time);
      if (upper <= 0) throw new Error(`ngspice does not bracket timepoint ${time}`);
      const lower = upper - 1;
      const t0 = reference.timeS[lower]!;
      const t1 = reference.timeS[upper]!;
      const fraction = (time - t0) / (t1 - t0);
      const v0 = reference.vectors[vector]![lower]!;
      const v1 = reference.vectors[vector]![upper]!;
      refValues.push(v0 + fraction * (v1 - v0));
      maximumInterpolationSpanS = Math.max(maximumInterpolationSpanS, t1 - t0);
    }
    matchedTimes.push(time);
    actualValues.push(actual.vectors[vector]![index]!);
  }
  const absolute = actualValues.map((value, index) => Math.abs(value - refValues[index]!));
  const relative = absolute.map((value, index) => value / Math.max(Math.abs(refValues[index]!), 1e-12));
  const rms = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  return {
    matchedPointCount: matchedTimes.length,
    maximumNgspiceInterpolationSpanS: maximumInterpolationSpanS,
    maximumAbsoluteError: Math.max(...absolute),
    rmsAbsoluteError: rms(absolute),
    maximumRelativeError: Math.max(...relative),
    rmsRelativeError: rms(relative),
  };
}

async function main(): Promise<void> {
  const source = readFileSync(fixturePath, 'utf8');
  const wasmRuns = Array.from({ length: repetitions }, runWasm);
  const ngspiceRuns = Array.from({ length: repetitions }, () => runNgspice(source));
  const wasm = wasmRuns[0]!.waveform;
  const ngspice = ngspiceRuns[0]!.waveform;
  const stat = (runs: Run[]) => ({
    wallMs: { samples: runs.map(run => run.wallMs), median: median(runs.map(run => run.wallMs)) },
    peakRssMiB: { samples: runs.map(run => run.peakRssMiB), median: median(runs.map(run => run.peakRssMiB)) },
  });
  const artifactSizes = {
    before: { workerJs: 367841, indexJs: 41878, denseSolverWasm: 1190 },
    after: {
      workerJs: readFileSync(resolve(dirname(scriptPath), '../../packages/wasm/dist/worker.js')).byteLength,
      indexJs: readFileSync(resolve(dirname(scriptPath), '../../packages/wasm/dist/index.js')).byteLength,
      denseSolverWasm: readFileSync(resolve(dirname(scriptPath), '../../packages/wasm/dist/dense-solver.wasm')).byteLength,
    },
  };
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixture: {
      path: 'benchmarks/wasm-rc-transient/rc-step.cir',
      sha256: sha256(source),
      identicalInputBytes: true,
      source: 'ngspice tests/general/rc.cir at 3ef069fb1f04177a153f342a32d941fc20ff047e',
      licence: 'BSD-3-Clause',
    },
    methodology: {
      repetitions,
      timing: 'fresh process wall time including runtime startup, package runner, parse, setup, solve, and serialization',
      memory: 'peak process RSS from /usr/bin/time; includes each runtime baseline',
      matching: 'linear interpolation between bracketing native ngspice points at each exact WASM output time; interpolation span is reported per vector',
      relativeErrorFloor: 1e-12,
      integration: 'default ngspice trapezoidal and bounded fixed-step WASM trapezoidal; no per-circuit tolerances',
    },
    versions: {
      spiceTsRevision: version('git', ['rev-parse', 'HEAD']),
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
      build: 'pnpm -C packages/wasm build',
      wasm: '/usr/bin/time -l pnpm exec tsx benchmarks/wasm-rc-transient/compare.ts --child=wasm',
      ngspice: '/usr/bin/time -l ngspice -b -r <raw> <identical-netlist>',
      reproduce: 'pnpm exec tsx benchmarks/wasm-rc-transient/compare.ts',
    },
    convergence: { wasm: 'complete', ngspice: 'complete' },
    pointCounts: { wasm: wasm.timeS.length, ngspice: ngspice.timeS.length },
    errors: Object.fromEntries(['v(in)', 'v(out)', 'i(v1)'].map(vector => [vector, matched(ngspice, wasm, vector)])),
    performance: { wasm: stat(wasmRuns), ngspice: stat(ngspiceRuns) },
    artifactSizesBytes: {
      ...artifactSizes,
      delta: Object.fromEntries(Object.keys(artifactSizes.before).map(name => [
        name,
        artifactSizes.after[name as keyof typeof artifactSizes.after]
          - artifactSizes.before[name as keyof typeof artifactSizes.before],
      ])),
      note: 'before worker.js measured from the RED build at 4598b9f parent implementation; index.js and dense-solver.wasm are unchanged task-start sizes',
    },
    retainedLosses: [
      'WASM uses a fixed print-step solve while ngspice uses adaptive internal timesteps.',
      'Fresh-process WASM timing includes pnpm and Node startup and is expected to lose to native ngspice.',
      'Relative errors near zero use the declared 1e-12 denominator floor.',
    ],
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv.includes('--child=wasm')) {
  wasmChild().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
