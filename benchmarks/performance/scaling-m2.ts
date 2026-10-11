#!/usr/bin/env tsx
/**
 * Issue #426 (M2): spice-ts vs ngspice runtime on generated 1k/10k/50k-node
 * scaling circuits — RC ladder transient, 2-D resistor mesh OP and a MOS1
 * CMOS inverter chain transient.
 *
 * Measurement only. Both engines receive the byte-identical deck produced by
 * scaling-m2-fixture.mjs (the SHA-256 is checked per row). ngspice's linear
 * solver is selected outside the deck through a per-run `.spiceinit`
 * (`option klu` / `option sparse`), because spice-ts rejects `.options klu`
 * and the deck must stay identical. Every engine/size/solver cell runs in a
 * fresh child process; failures and timeouts are recorded, never dropped.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAsync, simulate } from '@spice-ts/core';
import { M2_CIRCUITS, m2Netlist } from './scaling-m2-fixture.mjs';

export interface Stats { min: number; median: number; p95: number; max: number }
type Status = 'ok' | 'failed' | 'timeout';
export type NgspiceSolver = 'klu' | 'sparse';

interface Sample {
  totalMs: number;
  /** spice-ts: parseAsync(); ngspice: "Netlist loading time" (includes parse). */
  parseMs?: number;
  /** spice-ts: compile + analysis in simulate(circuit); ngspice: "Total analysis time". */
  analysisMs?: number;
  ngspicePhasesMs?: Record<string, number>;
  timepoints?: number;
  probeValue?: number;
}

export interface CellResult {
  engine: 'spice-ts' | 'ngspice';
  solver?: NgspiceSolver;
  circuit: string;
  requestedNodes: number;
  actualNodes: number;
  netlistSha256: string;
  probe: string;
  status: Status;
  warmups: number;
  samples: Sample[];
  totalStatsMs?: Stats;
  parseStatsMs?: Stats;
  analysisStatsMs?: Stats;
  peakRssMiB?: number;
  error?: string;
  elapsedBeforeFailureMs?: number;
}

const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);

function valueArg(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(value: string | undefined, fallback: number, label: string, min = 1): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${label} must be an integer >= ${min}`);
  return parsed;
}

export function statistics(values: number[]): Stats {
  if (values.length === 0) throw new Error('statistics requires at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    min: sorted[0],
    median,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted[sorted.length - 1],
  };
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function summarize(cell: CellResult): CellResult {
  const pick = (key: 'totalMs' | 'parseMs' | 'analysisMs'): Stats | undefined => {
    const values = cell.samples.map(sample => sample[key]).filter((value): value is number => value !== undefined);
    return values.length === cell.samples.length && values.length > 0 ? statistics(values) : undefined;
  };
  return { ...cell, totalStatsMs: pick('totalMs'), parseStatsMs: pick('parseMs'), analysisStatsMs: pick('analysisMs') };
}

function errorText(error: unknown): string {
  return error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error);
}

// ---------------------------------------------------------------- spice-ts --

async function spiceTsSample(netlist: string, probe: string): Promise<Sample> {
  const started = performance.now();
  const circuit = await parseAsync(netlist);
  const parsed = performance.now();
  const result = await simulate(circuit);
  const finished = performance.now();
  let probeValue: number | undefined;
  let timepoints: number | undefined;
  if (result.transient) {
    const wave = result.transient.voltage(probe);
    probeValue = wave[wave.length - 1];
    timepoints = result.transient.time.length;
  } else if (result.dc) {
    probeValue = result.dc.voltage(probe);
  }
  return { totalMs: finished - started, parseMs: parsed - started, analysisMs: finished - parsed, timepoints, probeValue };
}

async function runSpiceTsCell(circuit: string, nodes: number, warmups: number, runs: number): Promise<CellResult> {
  const { netlist, actualNodes, probe } = m2Netlist(circuit, nodes);
  const base: CellResult = {
    engine: 'spice-ts', circuit, requestedNodes: nodes, actualNodes, netlistSha256: sha256(netlist), probe,
    status: 'ok', warmups, samples: [],
  };
  const started = performance.now();
  try {
    for (let index = 0; index < warmups; index++) await spiceTsSample(netlist, probe);
    for (let index = 0; index < runs; index++) base.samples.push(await spiceTsSample(netlist, probe));
  } catch (error) {
    return {
      ...base, status: 'failed', error: errorText(error), samples: [],
      elapsedBeforeFailureMs: performance.now() - started,
    };
  }
  // Node documents maxRSS in KiB; it includes the runtime baseline.
  return summarize({ ...base, peakRssMiB: process.resourceUsage().maxRSS / 1024 });
}

// ----------------------------------------------------------------- ngspice --

const NGSPICE_PHASES: Record<string, RegExp> = {
  netlistLoad: /Netlist loading time\s*=\s*([\d.eE+-]+)/,
  netlistParse: /Netlist parsing time\s*=\s*([\d.eE+-]+)/,
  matrixReorder: /Matrix reorder time\s*=\s*([\d.eE+-]+)/,
  matrixFactor: /Matrix factor time\s*=\s*([\d.eE+-]+)/,
  matrixSolve: /Matrix solve time\s*=\s*([\d.eE+-]+)/,
  matrixLoad: /Matrix load time\s*=\s*([\d.eE+-]+)/,
  transient: /Transient analysis time\s*=\s*([\d.eE+-]+)/,
};

function metric(output: string, expression: RegExp): number | undefined {
  const match = output.match(expression);
  return match ? Number(match[1]) : undefined;
}

/** Extract the probe value: last `.print tran` row, or the `.op` node listing. */
export function ngspiceProbeValue(output: string, probe: string, isTransient: boolean): number | undefined {
  if (isTransient) {
    const rows = [...output.matchAll(/^\d+\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s*$/gm)];
    return rows.length > 0 ? Number(rows[rows.length - 1][2]) : undefined;
  }
  const escaped = probe.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`^\\s*${escaped}\\s+([-+\\d.eE]+)\\s*$`, 'mi'));
  return match ? Number(match[1]) : undefined;
}

class NgspiceTimeout extends Error {}

function ngspiceSample(directory: string, netlistPath: string, probe: string, isTransient: boolean, timeoutMs: number): Sample & { peakRssMiB: number; solverLine: string } {
  const started = performance.now();
  const result = spawnSync('ngspice', ['-b', netlistPath], {
    cwd: directory, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs,
  });
  const totalMs = performance.now() - started;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    throw new NgspiceTimeout(`ngspice exceeded ${timeoutMs} ms`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ngspice exited ${result.status}: ${output.slice(-1000)}`);
  const analysisSeconds = metric(output, /Total analysis time \(seconds\)\s*=\s*([\d.eE+-]+)/);
  const peak = metric(output, /Maximum ngspice program size\s*=\s*([\d.eE+-]+) MB/);
  if (analysisSeconds === undefined || peak === undefined) throw new Error('ngspice did not report acct metrics');
  const phases: Record<string, number> = {};
  for (const [name, expression] of Object.entries(NGSPICE_PHASES)) {
    const seconds = metric(output, expression);
    if (seconds !== undefined) phases[name] = seconds * 1000;
  }
  const accepted = metric(output, /Accepted timepoints\s*=\s*(\d+)/);
  return {
    totalMs,
    parseMs: phases.netlistLoad,
    analysisMs: analysisSeconds * 1000,
    ngspicePhasesMs: phases,
    timepoints: isTransient ? accepted : undefined,
    probeValue: ngspiceProbeValue(output, probe, isTransient),
    peakRssMiB: peak,
    solverLine: output.match(/Using (\S+(?: \S+)?) as Direct Linear Solver/)?.[1] ?? 'unknown',
  };
}

function runNgspiceCell(circuit: string, nodes: number, solver: NgspiceSolver, warmups: number, runs: number, timeoutMs: number): CellResult {
  const { netlist, actualNodes, probe } = m2Netlist(circuit, nodes);
  const isTransient = /^\.tran /m.test(netlist);
  const directory = mkdtempSync(join(tmpdir(), 'spice-ts-m2-'));
  const netlistPath = join(directory, `${circuit}-${nodes}.cir`);
  writeFileSync(netlistPath, netlist);
  // Solver selection lives outside the shared deck so both engines see the same bytes.
  writeFileSync(join(directory, '.spiceinit'), `option ${solver}\n`);
  const base: CellResult = {
    engine: 'ngspice', solver, circuit, requestedNodes: nodes, actualNodes, netlistSha256: sha256(netlist), probe,
    status: 'ok', warmups, samples: [],
  };
  const started = performance.now();
  try {
    let peak = 0;
    for (let index = 0; index < warmups + runs; index++) {
      const sample = ngspiceSample(directory, netlistPath, probe, isTransient, timeoutMs);
      const expected = solver === 'klu' ? 'KLU' : 'SPARSE';
      if (!sample.solverLine.toUpperCase().startsWith(expected)) {
        throw new Error(`ngspice used '${sample.solverLine}' instead of ${expected}`);
      }
      if (index < warmups) continue;
      peak = Math.max(peak, sample.peakRssMiB);
      const { peakRssMiB: _peak, solverLine: _solver, ...kept } = sample;
      base.samples.push(kept);
    }
    return summarize({ ...base, peakRssMiB: peak });
  } catch (error) {
    return {
      ...base, status: error instanceof NgspiceTimeout ? 'timeout' : 'failed', error: errorText(error),
      samples: [], elapsedBeforeFailureMs: performance.now() - started,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------ orchestration --

async function childMain(): Promise<void> {
  const engine = valueArg('--child');
  const circuit = valueArg('--circuit') ?? '';
  const nodes = positiveInteger(valueArg('--nodes'), 0, 'nodes', 2);
  const warmups = positiveInteger(valueArg('--warmups'), 1, 'warmups', 0);
  const runs = positiveInteger(valueArg('--runs'), 10, 'runs');
  const timeoutMs = positiveInteger(valueArg('--timeout-s'), 600, 'timeout-s') * 1000;
  const result = engine === 'spice-ts'
    ? await runSpiceTsCell(circuit, nodes, warmups, runs)
    : runNgspiceCell(circuit, nodes, (valueArg('--solver') ?? 'klu') as NgspiceSolver, warmups, runs, timeoutMs);
  process.stdout.write(JSON.stringify(result));
}

function runIsolated(
  engine: 'spice-ts' | 'ngspice', circuit: string, nodes: number, solver: NgspiceSolver | undefined,
  warmups: number, runs: number, timeoutS: number,
): CellResult {
  const childArgs = [
    ...process.execArgv, scriptPath, `--child=${engine}`, `--circuit=${circuit}`, `--nodes=${nodes}`,
    `--warmups=${warmups}`, `--runs=${runs}`, `--timeout-s=${timeoutS}`, ...(solver ? [`--solver=${solver}`] : []),
  ];
  // spice-ts cannot be interrupted mid-solve inside its own process, so the
  // parent enforces the per-sample budget across the whole isolated cell.
  const budgetMs = timeoutS * 1000 * (warmups + runs) + 60_000;
  const result = spawnSync(process.execPath, childArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: budgetMs });
  const { netlist, actualNodes, probe } = m2Netlist(circuit, nodes);
  const fallback: CellResult = {
    engine, solver, circuit, requestedNodes: nodes, actualNodes, netlistSha256: sha256(netlist), probe,
    status: 'failed', warmups, samples: [],
  };
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { ...fallback, status: 'timeout', error: `isolated cell exceeded ${budgetMs} ms`, elapsedBeforeFailureMs: budgetMs };
  }
  if (result.status !== 0 || !result.stdout) {
    return { ...fallback, error: `child exited ${result.status}: ${(result.stderr ?? '').slice(-1000)}` };
  }
  return JSON.parse(result.stdout) as CellResult;
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
  const circuits = (valueArg('--circuits') ?? M2_CIRCUITS.join(',')).split(',');
  for (const circuit of circuits) m2Netlist(circuit, 1000); // validates names early
  const sizes = (valueArg('--sizes') ?? '1000,10000,50000').split(',').map(value => positiveInteger(value, 0, 'size', 2));
  const solvers = (valueArg('--ngspice-solvers') ?? 'klu,sparse').split(',') as NgspiceSolver[];
  for (const solver of solvers) if (solver !== 'klu' && solver !== 'sparse') throw new Error(`unknown solver ${solver}`);
  const warmups = positiveInteger(valueArg('--warmups'), 1, 'warmups', 0);
  const runs = positiveInteger(valueArg('--runs'), 10, 'runs');
  const timeoutS = positiveInteger(valueArg('--timeout-s'), 600, 'timeout-s');
  const outputArgument = valueArg('--output') ?? 'benchmarks/performance/results/scaling-m2.json';
  const outputPath = resolve(outputArgument);
  const rows: Array<{ circuit: string; requestedNodes: number; actualNodes: number; netlistSha256: string; cells: CellResult[] }> = [];
  const write = (complete: boolean): void => {
    const report = {
      schemaVersion: 1,
      complete,
      generatedAt: new Date().toISOString(),
      command: `pnpm bench:scaling:m2 -- --circuits=${circuits.join(',')} --sizes=${sizes.join(',')} --ngspice-solvers=${solvers.join(',')} --warmups=${warmups} --runs=${runs} --timeout-s=${timeoutS} --output=${outputArgument}`,
      methodology: {
        circuits: 'Generated by benchmarks/performance/scaling-m2-fixture.mjs; one byte-identical deck per circuit/size, SHA-256 checked across every cell',
        warmups,
        repetitions: runs,
        statistic: 'median primary; min, p95, max and every raw sample retained',
        isolation: 'one fresh child process per engine/circuit/size/solver cell; ngspice additionally starts a fresh native CLI per sample',
        spiceTsTiming: 'totalMs = parseAsync() + simulate(circuit); parseMs = parseAsync(); analysisMs = compile + analysis inside simulate()',
        ngspiceTiming: 'totalMs = native CLI wall time; parseMs = "Netlist loading time"; analysisMs = "Total analysis time" (.options acct)',
        ngspiceSolver: 'selected by a per-run .spiceinit (option klu | option sparse) in the netlist directory; the "Using ... as Direct Linear Solver" banner is verified per sample',
        failures: 'a spice-ts error stops the cell and records the error and elapsed time; timeouts are per sample (ngspice) or per cell budget (spice-ts)',
        memory: 'peak RSS including runtime baseline; spice-ts from Node resourceUsage, ngspice from its acct program size',
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
  };
  for (const circuit of circuits) {
    for (const nodes of sizes) {
      const { netlist, actualNodes } = m2Netlist(circuit, nodes);
      const cells: CellResult[] = [];
      process.stderr.write(`[${new Date().toISOString()}] ${circuit} ${nodes}: spice-ts\n`);
      cells.push(runIsolated('spice-ts', circuit, nodes, undefined, warmups, runs, timeoutS));
      for (const solver of solvers) {
        process.stderr.write(`[${new Date().toISOString()}] ${circuit} ${nodes}: ngspice ${solver}\n`);
        cells.push(runIsolated('ngspice', circuit, nodes, solver, warmups, runs, timeoutS));
      }
      const hash = sha256(netlist);
      for (const cell of cells) {
        if (cell.netlistSha256 !== hash) throw new Error(`netlist hash mismatch for ${circuit} ${nodes} (${cell.engine})`);
        process.stderr.write(`  ${cell.engine}${cell.solver ? `/${cell.solver}` : ''}: ${cell.status} median ${cell.totalStatsMs?.median.toFixed(2) ?? '-'} ms${cell.error ? ` (${cell.error})` : ''}\n`);
      }
      rows.push({ circuit, requestedNodes: nodes, actualNodes, netlistSha256: hash, cells });
      write(false);
    }
  }
  write(true);
  process.stderr.write(`wrote ${outputPath}\n`);
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
