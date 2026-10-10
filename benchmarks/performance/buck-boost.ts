#!/usr/bin/env tsx
/** Reproducible long-run resource comparison for the issue #40 buck-boost deck. */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '@spice-ts/core';
import { parseNgspiceRaw } from '../comparison-harness.js';
import { buckBoostNetlist } from './buck-boost-fixture.mjs';

type Mode = 'full' | 'smoke';
type Engine = 'spice-ts' | 'ngspice';

interface OutputSummary {
  finalVolts: number;
  lastCycleMeanVolts: number;
  minimumVolts: number;
  maximumVolts: number;
  expectedVolts: -12;
  relativeErrorToExpected: number;
  reachesExpectedNegativeRail: boolean;
}

interface RunReceipt {
  run: number;
  netlistSha256: string;
  wallMs: number;
  peakRssMiB: number;
  steps: { accepted: number; outputPoints: number };
  output: OutputSummary;
}

interface EngineReport {
  command: string[];
  runs: RunReceipt[];
  deterministic: { output: boolean; steps: boolean };
}

export interface BenchmarkReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: Mode;
  command: string;
  methodology: Record<string, string | number>;
  circuit: { netlistSha256: string; stopTimeSeconds: number; expectedNegativeRailVolts: -12 };
  versions: { spiceTs: string; node: string; pnpm: string; ngspice: string };
  machine: Record<string, string>;
  engines: { spiceTs: EngineReport; ngspice: EngineReport };
}

export interface BenchmarkOptions {
  mode?: Mode;
  repetitions?: number;
}

const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);

function valueArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function summarize(time: number[], values: number[]): OutputSummary {
  if (time.length === 0 || time.length !== values.length) throw new Error('missing or misaligned V(neg) waveform');
  const stop = time[time.length - 1];
  const lastCycle = values.filter((_, index) => time[index] >= stop - 10e-6);
  const { minimum, maximum } = values.reduce(
    (result, value) => ({ minimum: Math.min(result.minimum, value), maximum: Math.max(result.maximum, value) }),
    { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
  );
  const lastCycleMeanVolts = lastCycle.reduce((sum, value) => sum + value, 0) / lastCycle.length;
  const relativeErrorToExpected = Math.abs(lastCycleMeanVolts - -12) / 12;
  return {
    finalVolts: values[values.length - 1],
    lastCycleMeanVolts,
    minimumVolts: minimum,
    maximumVolts: maximum,
    expectedVolts: -12,
    relativeErrorToExpected,
    reachesExpectedNegativeRail: lastCycleMeanVolts < 0 && relativeErrorToExpected <= 0.1,
  };
}

async function runSpiceTs(netlist: string, run: number): Promise<RunReceipt> {
  const started = performance.now();
  const result = await simulate(netlist);
  const wallMs = performance.now() - started;
  const transient = result.transient;
  if (!transient) throw new Error('spice-ts returned no transient result');
  return {
    run,
    netlistSha256: sha256(netlist),
    wallMs,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    steps: {
      accepted: result.convergence?.transient.acceptedSteps ?? transient.time.length - 1,
      outputPoints: transient.time.length,
    },
    output: summarize(transient.time, transient.voltage('neg')),
  };
}

function parsePeakRssMiB(stderr: string): number {
  const darwin = stderr.match(/(\d+)\s+maximum resident set size/i);
  if (darwin) return Number(darwin[1]) / 1024 / 1024;
  const gnu = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/i);
  if (gnu) return Number(gnu[1]) / 1024;
  throw new Error('resource timer did not report peak RSS');
}

function runNgspice(netlist: string, run: number): RunReceipt {
  const directory = mkdtempSync(join(tmpdir(), 'spice-ts-buck-boost-'));
  const netlistPath = join(directory, 'buck-boost.cir');
  const rawPath = join(directory, 'buck-boost.raw');
  writeFileSync(netlistPath, netlist);
  writeFileSync(join(directory, '.spiceinit'), 'set filetype=ascii\n');
  const timeArgs = process.platform === 'darwin'
    ? ['-l', 'ngspice', '-b', '-r', rawPath, netlistPath]
    : ['-v', 'ngspice', '-b', '-r', rawPath, netlistPath];
  try {
    const started = performance.now();
    const completed = spawnSync('/usr/bin/time', timeArgs, {
      encoding: 'utf8',
      env: { ...process.env, HOME: directory },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300_000,
    });
    const wallMs = performance.now() - started;
    if (completed.error) throw completed.error;
    if (completed.status !== 0) {
      throw new Error(`ngspice exited ${completed.status}: ${completed.stderr.slice(-2000)}`);
    }
    const plot = parseNgspiceRaw(readFileSync(rawPath, 'utf8'))
      .find(candidate => candidate.plotName.toLowerCase().includes('transient'));
    if (!plot) throw new Error('ngspice raw output contained no transient plot');
    const neg = plot.signals['v(neg)']?.map(value => value.re);
    if (!neg) throw new Error('ngspice raw output contained no V(neg)');
    return {
      run,
      netlistSha256: sha256(netlist),
      wallMs,
      peakRssMiB: parsePeakRssMiB(completed.stderr),
      steps: { accepted: plot.grid.length - 1, outputPoints: plot.grid.length },
      output: summarize(plot.grid, neg),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function childMain(engine: Engine, mode: Mode, run: number): Promise<void> {
  const netlist = buckBoostNetlist(mode);
  const receipt = engine === 'spice-ts' ? await runSpiceTs(netlist, run) : runNgspice(netlist, run);
  process.stdout.write(JSON.stringify(receipt));
}

function runIsolated(engine: Engine, mode: Mode, run: number): RunReceipt {
  const output = execFileSync(process.execPath, [
    ...process.execArgv,
    scriptPath,
    `--child=${engine}`,
    `--mode=${mode}`,
    `--run=${run}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000 });
  return JSON.parse(output) as RunReceipt;
}

function commandVersion(command: string, versionArgs: string[]): string {
  const result = spawnSync(command, versionArgs, { encoding: 'utf8' });
  if (result.error) return `unavailable: ${result.error.message}`;
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().split('\n')[0];
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error) return `unavailable: ${result.error.message}`;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return output.match(/ngspice-\d+[^\n]*/i)?.[0].trim() ?? output.trim().split('\n')[0];
}

function machineMetadata(): Record<string, string> {
  const sysctl = (key: string): string => {
    const result = spawnSync('sysctl', ['-n', key], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : 'unknown';
  };
  return {
    platform: `${process.platform} ${process.arch}`,
    osRelease: commandVersion('uname', ['-srv']),
    cpu: process.platform === 'darwin' ? sysctl('machdep.cpu.brand_string') : 'see platform metadata',
    logicalCpus: process.platform === 'darwin' ? sysctl('hw.logicalcpu') : 'see platform metadata',
    memoryBytes: process.platform === 'darwin' ? sysctl('hw.memsize') : 'see platform metadata',
  };
}

function engineReport(engine: Engine, mode: Mode, repetitions: number, netlistHash: string): EngineReport {
  const runs = Array.from({ length: repetitions }, (_, index) => runIsolated(engine, mode, index + 1));
  if (runs.some(run => run.netlistSha256 !== netlistHash)) throw new Error(`${engine} received a different netlist`);
  return {
    command: engine === 'spice-ts'
      ? ['node', '<tsx-loader>', 'benchmarks/performance/buck-boost.ts', '--child=spice-ts', `--mode=${mode}`]
      : ['/usr/bin/time', process.platform === 'darwin' ? '-l' : '-v', 'ngspice', '-b', '-r', '<raw>', '<identical-netlist>'],
    runs,
    deterministic: {
      output: runs.every(run => JSON.stringify(run.output) === JSON.stringify(runs[0].output)),
      steps: runs.every(run => run.steps.accepted === runs[0].steps.accepted),
    },
  };
}

export async function runBenchmark(options: BenchmarkOptions = {}): Promise<BenchmarkReport> {
  const mode = options.mode ?? 'full';
  const repetitions = options.repetitions ?? 2;
  if (!Number.isInteger(repetitions) || repetitions < 2) throw new Error('repetitions must be an integer >= 2');
  const netlist = buckBoostNetlist(mode);
  const netlistHash = sha256(netlist);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    command: `pnpm exec tsx benchmarks/performance/buck-boost.ts --mode=${mode} --runs=${repetitions}`,
    methodology: {
      circuit: 'Project-authored issue #40 inverting buck-boost; byte-identical netlist for both engines',
      repetitions,
      timing: 'fresh isolated process per engine and run; wall clock includes parse, setup, and solve',
      memory: 'peak process RSS including runtime baseline; Node resourceUsage for spice-ts, /usr/bin/time for native ngspice',
      output: 'V(neg) final, extrema, and arithmetic mean over the final 10 us switching cycle',
      correctness: 'expected -12 V rail is reached only when final-cycle mean is negative and within 10% of -12 V',
    },
    circuit: { netlistSha256: netlistHash, stopTimeSeconds: mode === 'full' ? 5e-3 : 50e-6, expectedNegativeRailVolts: -12 },
    versions: {
      spiceTs: JSON.parse(readFileSync(resolve(dirname(scriptPath), '../../packages/core/package.json'), 'utf8')).version,
      node: process.version,
      pnpm: commandVersion('pnpm', ['--version']),
      ngspice: ngspiceVersion(),
    },
    machine: machineMetadata(),
    engines: {
      spiceTs: engineReport('spice-ts', mode, repetitions, netlistHash),
      ngspice: engineReport('ngspice', mode, repetitions, netlistHash),
    },
  };
}

async function parentMain(): Promise<void> {
  const mode = (valueArg('--mode') ?? 'full') as Mode;
  if (mode !== 'full' && mode !== 'smoke') throw new Error('--mode must be full or smoke');
  const repetitions = Number(valueArg('--runs') ?? '2');
  const outputPath = resolve(valueArg('--output') ?? `benchmarks/results/buck-boost-${mode}.json`);
  const report = await runBenchmark({ mode, repetitions });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) {
  const child = valueArg('--child') as Engine | undefined;
  if (child) {
    const mode = (valueArg('--mode') ?? 'full') as Mode;
    const run = Number(valueArg('--run') ?? '1');
    childMain(child, mode, run).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  } else {
    parentMain().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
