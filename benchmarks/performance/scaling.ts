#!/usr/bin/env tsx
/**
 * Reproducible large-node DC scaling comparison for spice-ts and ngspice.
 *
 * Both engines receive byte-identical generated netlists. spice-ts timings
 * include parse + compile + solve through the public simulate() API. ngspice
 * reports both its internal analysis time and end-to-end CLI wall time.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '@spice-ts/core';
import { scalingLadder } from './scaling-fixture.mjs';

interface Stats {
  min: number;
  median: number;
  p95: number;
  max: number;
}

interface EngineMeasurement {
  status: 'ok' | 'failed';
  timesMs: number[];
  statsMs?: Stats;
  analysisTimesMs?: number[];
  analysisStatsMs?: Stats;
  peakRssMiB?: number;
  error?: string;
}

interface ChildResult extends EngineMeasurement {
  engine: 'spice-ts' | 'ngspice';
  nodes: number;
  netlistSha256: string;
}

const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);

function valueArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export function statistics(values: number[]): Stats {
  if (values.length === 0) throw new Error('statistics requires at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return {
    min: sorted[0],
    median,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted[sorted.length - 1],
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseMetric(output: string, expression: RegExp, label: string): number {
  const match = output.match(expression);
  if (!match) throw new Error(`ngspice did not report ${label}`);
  return Number(match[1]);
}

async function runSpiceTsChild(nodes: number, warmups: number, runs: number): Promise<ChildResult> {
  const netlist = scalingLadder(nodes);
  try {
    for (let index = 0; index < warmups; index++) await simulate(netlist);
    const timesMs: number[] = [];
    for (let index = 0; index < runs; index++) {
      const start = performance.now();
      await simulate(netlist);
      timesMs.push(performance.now() - start);
    }
    // Node documents maxRSS in KiB. It includes the runtime baseline and is the
    // peak for this isolated size-specific process, not incremental heap usage.
    const peakRssMiB = process.resourceUsage().maxRSS / 1024;
    return {
      engine: 'spice-ts', nodes, netlistSha256: sha256(netlist), status: 'ok',
      timesMs, statsMs: statistics(timesMs), peakRssMiB,
    };
  } catch (error) {
    return {
      engine: 'spice-ts', nodes, netlistSha256: sha256(netlist), status: 'failed',
      timesMs: [], error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
}

function runNgspiceOnce(netlistPath: string): { wallMs: number; analysisMs: number; peakRssMiB: number } {
  const started = performance.now();
  const result = spawnSync('ngspice', ['-b', netlistPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  const wallMs = performance.now() - started;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ngspice exited ${result.status}: ${output.slice(-2000)}`);
  return {
    wallMs,
    analysisMs: parseMetric(output, /Total analysis time \(seconds\)\s*=\s*([\d.eE+-]+)/, 'analysis time') * 1000,
    peakRssMiB: parseMetric(output, /Maximum ngspice program size\s*=\s*([\d.eE+-]+) MB/, 'peak program size'),
  };
}

function runNgspiceChild(nodes: number, warmups: number, runs: number): ChildResult {
  const netlist = scalingLadder(nodes);
  const directory = mkdtempSync(join(tmpdir(), 'spice-ts-scaling-'));
  const netlistPath = join(directory, `ladder-${nodes}.cir`);
  writeFileSync(netlistPath, netlist);
  try {
    for (let index = 0; index < warmups; index++) runNgspiceOnce(netlistPath);
    const samples = Array.from({ length: runs }, () => runNgspiceOnce(netlistPath));
    const timesMs = samples.map(sample => sample.wallMs);
    const analysisTimesMs = samples.map(sample => sample.analysisMs);
    return {
      engine: 'ngspice', nodes, netlistSha256: sha256(netlist), status: 'ok',
      timesMs, statsMs: statistics(timesMs), analysisTimesMs,
      analysisStatsMs: statistics(analysisTimesMs),
      peakRssMiB: Math.max(...samples.map(sample => sample.peakRssMiB)),
    };
  } catch (error) {
    return {
      engine: 'ngspice', nodes, netlistSha256: sha256(netlist), status: 'failed',
      timesMs: [], error: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function childMain(): Promise<void> {
  const engine = valueArg('--child');
  const nodes = positiveInteger(valueArg('--nodes'), 0, 'nodes');
  const warmups = positiveInteger(valueArg('--warmups'), 3, 'warmups');
  const runs = positiveInteger(valueArg('--runs'), 10, 'runs');
  const result = engine === 'spice-ts'
    ? await runSpiceTsChild(nodes, warmups, runs)
    : runNgspiceChild(nodes, warmups, runs);
  process.stdout.write(JSON.stringify(result));
}

function runIsolated(engine: 'spice-ts' | 'ngspice', nodes: number, warmups: number, runs: number): ChildResult {
  const childArgs = [
    ...process.execArgv,
    scriptPath,
    `--child=${engine}`,
    `--nodes=${nodes}`,
    `--warmups=${warmups}`,
    `--runs=${runs}`,
  ];
  const output = execFileSync(process.execPath, childArgs, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
  });
  return JSON.parse(output) as ChildResult;
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

function parentMain(): void {
  const sizes = (valueArg('--sizes') ?? '100,1000,5000,10000')
    .split(',').map(value => positiveInteger(value, 0, 'size'));
  const warmups = positiveInteger(valueArg('--warmups'), 3, 'warmups');
  const runs = positiveInteger(valueArg('--runs'), 10, 'runs');
  const outputArgument = valueArg('--output') ?? 'benchmarks/results/scaling-baseline.json';
  const outputPath = resolve(outputArgument);
  const rows = sizes.map(nodes => {
    process.stderr.write(`Measuring ${nodes} nodes...\n`);
    const spiceTs = runIsolated('spice-ts', nodes, warmups, runs);
    const ngspice = runIsolated('ngspice', nodes, warmups, runs);
    if (spiceTs.netlistSha256 !== ngspice.netlistSha256) {
      throw new Error(`netlist hash mismatch at ${nodes} nodes`);
    }
    return { nodes, netlistSha256: spiceTs.netlistSha256, spiceTs, ngspice };
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    command: `pnpm bench:scaling -- --sizes=${sizes.join(',')} --warmups=${warmups} --runs=${runs} --output=${outputArgument}`,
    methodology: {
      circuit: 'Generated linear resistor ladder, DC operating point; byte-identical netlist per size',
      warmups,
      repetitions: runs,
      statistic: 'median primary; min, p95, max and every raw sample retained',
      spiceTsTiming: 'public simulate() API in one isolated process per size; includes parse, compile, and solve',
      ngspiceTiming: 'fresh native CLI process per sample; wall time plus ngspice internal analysis time',
      memory: 'peak process RSS including runtime baseline; spice-ts from Node resourceUsage, ngspice from rusage acct',
    },
    versions: {
      spiceTs: JSON.parse(readFileSync(resolve(dirname(scriptPath), '../../packages/core/package.json'), 'utf8')).version,
      node: process.version,
      pnpm: commandVersion('pnpm', ['--version']),
      ngspice: ngspiceVersion(),
    },
    machine: machineMetadata(),
    rows,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) {
  if (args.some(arg => arg.startsWith('--child='))) {
    childMain().catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  } else {
    parentMain();
  }
}
