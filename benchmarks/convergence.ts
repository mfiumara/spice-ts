#!/usr/bin/env tsx
/**
 * Convergence-hard fixture audit against native ngspice.
 *
 * Usage: pnpm bench:convergence [--json]
 * Requires ngspice-47 on PATH. Results are written to
 * benchmarks/convergence-results.json.
 */
import { simulate } from '@spice-ts/core';
import type { SimulationResult } from '@spice-ts/core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_MODE = process.argv.includes('--json');
const RUNTIME_RUNS = 5;
const RELATIVE_FLOOR_VOLTS = 1e-6;

const SPICE_OPTIONS = {
  reltol: 1e-3,
  abstol: 1e-12,
  vntol: 1e-6,
  gmin: 0,
  maxIterations: 100,
  maxTransientIterations: 50,
  integrationMethod: 'trapezoidal' as const,
  trtol: 7,
};

type Mechanism = 'gmin-stepping' | 'source-stepping' | 'timestep-rejection';
type Analysis = 'op' | 'tran';

interface Fixture {
  id: string;
  file: string;
  mechanism: Mechanism;
  analysis: Analysis;
  probe: string;
}

const FIXTURES: Fixture[] = [
  {
    id: 'gmin-reverse-diode',
    file: 'gmin-reverse-diode.cir',
    mechanism: 'gmin-stepping',
    analysis: 'op',
    probe: 'sense',
  },
  {
    id: 'source-step-bjt',
    file: 'source-step-bjt.cir',
    mechanism: 'source-stepping',
    analysis: 'op',
    probe: 'collector',
  },
  {
    id: 'timestep-diode-rectifier',
    file: 'timestep-diode-rectifier.cir',
    mechanism: 'timestep-rejection',
    analysis: 'tran',
    probe: 'out',
  },
];

interface Series {
  x: number[];
  y: number[];
}

interface EngineRun {
  converged: boolean;
  error: string | null;
  runtimeMs: number | null;
  analysisRuntimeMs?: number | null;
  acceptedPoints: number | null;
  rejectedRetries: number | 'not-exposed';
  iterations: number | 'not-exposed';
  series: Series | null;
}

interface ErrorMetrics {
  matchedPoints: number;
  maxRelativeError: number;
  rmsRelativeError: number;
  relativeFloorVolts: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function numberFrom(output: string, label: string): number | null {
  const match = output.match(new RegExp(`${label}\\s*=\\s*([\\d.e+-]+)`, 'i'));
  return match ? Number(match[1]) : null;
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const match = output.match(/ngspice-(\d+)/i);
  if (result.status !== 0 || !match) throw new Error('ngspice is required on PATH');
  if (match[1] !== '47') throw new Error(`Expected ngspice-47, found ngspice-${match[1]}`);
  return `ngspice-${match[1]}`;
}

async function runSpiceTs(netlist: string, fixture: Fixture): Promise<EngineRun> {
  try {
    let result: SimulationResult | null = null;
    const runtimes: number[] = [];
    for (let i = 0; i < RUNTIME_RUNS; i++) {
      const started = performance.now();
      result = await simulate(netlist, SPICE_OPTIONS);
      runtimes.push(performance.now() - started);
    }
    if (!result) throw new Error('simulation returned no result');

    if (fixture.analysis === 'op') {
      const value = result.dc?.voltage(fixture.probe);
      if (value === undefined) throw new Error(`missing DC probe v(${fixture.probe})`);
      return {
        converged: true,
        error: null,
        runtimeMs: median(runtimes),
        acceptedPoints: 1,
        rejectedRetries: 'not-exposed',
        iterations: 'not-exposed',
        series: { x: [0], y: [value] },
      };
    }

    const transient = result.transient;
    if (!transient) throw new Error('missing transient result');
    const y = transient.voltage(fixture.probe);
    return {
      converged: true,
      error: null,
      runtimeMs: median(runtimes),
      acceptedPoints: transient.time.length,
      rejectedRetries: 'not-exposed',
      iterations: 'not-exposed',
      series: { x: transient.time, y },
    };
  } catch (error) {
    return {
      converged: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      runtimeMs: null,
      acceptedPoints: null,
      rejectedRetries: 'not-exposed',
      iterations: 'not-exposed',
      series: null,
    };
  }
}

function parseWaveform(path: string): Series {
  const rows = readFileSync(path, 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim().split(/\s+/).map(Number))
    .filter(row => row.length >= 2 && row.every(Number.isFinite));
  return { x: rows.map(row => row[0]), y: rows.map(row => row[1]) };
}

function runNgspice(netlist: string, fixture: Fixture): EngineRun {
  const directory = mkdtempSync(join(tmpdir(), 'spice-ts-convergence-'));
  const deckPath = join(directory, `${fixture.id}.cir`);
  const waveformPath = join(directory, `${fixture.id}.dat`);
  const deckWithoutEnd = netlist.replace(/^\.end\s*$/im, '');
  const exportCommand = fixture.analysis === 'tran'
    ? `set wr_singlescale\nset wr_vecnames\nwrdata ${waveformPath} v(${fixture.probe})`
    : `print v(${fixture.probe})`;
  const deck = `${deckWithoutEnd}\n.control\nrun\n${exportCommand}\nrusage all\nquit\n.endc\n.end\n`;
  writeFileSync(deckPath, deck);

  try {
    const started = performance.now();
    const result = spawnSync('ngspice', ['-b', deckPath], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    const runtimeMs = performance.now() - started;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.status !== 0) {
      return {
        converged: false,
        error: output.trim().slice(-500) || `ngspice exited ${result.status}`,
        runtimeMs,
        analysisRuntimeMs: numberFrom(output, 'Total analysis time \\(seconds\\)') === null
          ? null
          : numberFrom(output, 'Total analysis time \\(seconds\\)')! * 1000,
        acceptedPoints: null,
        rejectedRetries: numberFrom(output, 'Rejected timepoints') ?? 0,
        iterations: numberFrom(output, 'Total iterations') ?? 0,
        series: null,
      };
    }

    let series: Series;
    if (fixture.analysis === 'tran') {
      series = parseWaveform(waveformPath);
    } else {
      const match = output.match(new RegExp(`v\\(${fixture.probe}\\)\\s*=\\s*([\\d.e+-]+)`, 'i'));
      if (!match) throw new Error(`ngspice did not print v(${fixture.probe})`);
      series = { x: [0], y: [Number(match[1])] };
    }
    const analysisSeconds = numberFrom(output, 'Total analysis time \\(seconds\\)');
    return {
      converged: true,
      error: null,
      runtimeMs,
      analysisRuntimeMs: analysisSeconds === null ? null : analysisSeconds * 1000,
      acceptedPoints: fixture.analysis === 'op'
        ? 1
        : numberFrom(output, 'Accepted timepoints') ?? series.x.length,
      rejectedRetries: numberFrom(output, 'Rejected timepoints') ?? 0,
      iterations: numberFrom(output, 'Total iterations') ?? 0,
      series,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function interpolate(series: Series, x: number): number {
  if (series.x.length === 1) return series.y[0];
  if (x <= series.x[0]) return series.y[0];
  if (x >= series.x.at(-1)!) return series.y.at(-1)!;
  let low = 0;
  let high = series.x.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (series.x[mid] <= x) low = mid;
    else high = mid;
  }
  const fraction = (x - series.x[low]) / (series.x[high] - series.x[low]);
  return series.y[low] + fraction * (series.y[high] - series.y[low]);
}

function errors(spiceTs: Series | null, ngspice: Series | null): ErrorMetrics | null {
  if (!spiceTs || !ngspice || spiceTs.x.length === 0 || ngspice.x.length === 0) return null;
  const relative = spiceTs.x.map((x, index) => {
    const reference = interpolate(ngspice, x);
    return Math.abs(spiceTs.y[index] - reference) / Math.max(Math.abs(reference), RELATIVE_FLOOR_VOLTS);
  });
  return {
    matchedPoints: relative.length,
    maxRelativeError: Math.max(...relative),
    rmsRelativeError: Math.sqrt(relative.reduce((sum, value) => sum + value * value, 0) / relative.length),
    relativeFloorVolts: RELATIVE_FLOOR_VOLTS,
  };
}

async function main(): Promise<void> {
  const version = ngspiceVersion();
  const results = [];
  for (const fixture of FIXTURES) {
    const path = resolve(__dirname, 'convergence', 'circuits', fixture.file);
    const netlist = readFileSync(path, 'utf8');
    const spiceTs = await runSpiceTs(netlist, fixture);
    const ngspice = runNgspice(netlist, fixture);
    results.push({
      fixture: fixture.id,
      file: `benchmarks/convergence/circuits/${fixture.file}`,
      mechanism: fixture.mechanism,
      analysis: fixture.analysis,
      probe: `v(${fixture.probe})`,
      spiceTs,
      ngspice,
      errors: errors(spiceTs.series, ngspice.series),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    versions: { spiceTs: 'workspace', ngspice: version, node: process.version },
    machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown' },
    command: 'pnpm bench:convergence',
    runtimeRuns: RUNTIME_RUNS,
    settings: {
      netlist: '.options reltol=1e-3 abstol=1e-12 vntol=1e-6 gmin=0 itl1=100; transient also uses itl4=50 method=trap trtol=7',
      spiceTs: SPICE_OPTIONS,
      note: 'The same checked-in deck and numerical settings are used by both engines. The ngspice-only .control block exports data and rusage.',
    },
    retryTelemetry: {
      spiceTs: 'not exposed by the public API; recorded explicitly instead of inferred from accepted samples',
      ngspice: 'Rejected timepoints from rusage (0 for operating-point fixtures)',
    },
    results,
  };

  const outputPath = resolve(__dirname, 'convergence-results.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`${version}; ${results.length} fixtures; results: ${outputPath}`);
    for (const result of results) {
      const metric = result.errors;
      console.log(
        `${result.fixture}: spice-ts=${result.spiceTs.converged ? 'converged' : 'FAILED'} `
        + `ngspice=${result.ngspice.converged ? 'converged' : 'FAILED'} `
        + `max=${metric ? (metric.maxRelativeError * 100).toFixed(3) : 'n/a'}% `
        + `rms=${metric ? (metric.rmsRelativeError * 100).toFixed(3) : 'n/a'}%`,
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
