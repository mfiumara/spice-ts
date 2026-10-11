#!/usr/bin/env tsx
/**
 * RF port sources and `.sp` S-parameter parity against ngspice-47 (#499).
 *
 * Every fixture is read once and its exact bytes are given to both engines. Each ngspice raw
 * vector with a spice-ts counterpart is compared at every point (the frequency grids must be
 * identical); the error of a vector is |spice-ts - ngspice| divided by the vector's ngspice peak
 * magnitude. Every residual, loss and exclusion is written to report.json.
 *
 * Usage (repository root): pnpm bench:rf-port-sp
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulate, type SimulationResult } from '../../packages/core/src/index.js';
import { type ComplexValue, parseNgspiceRaw } from '../comparison-harness.js';

const DIRECTORY = 'benchmarks/rf-port-sp';
const REPORT_PATH = `${DIRECTORY}/report.json`;
const FIXTURES = [
  'sp1-power-ports.cir',
  'sp2-lc-voltage-ports.cir',
  'sp4-three-ports.cir',
  'tschebyschef-lp.cir',
  'port-op-ac.cir',
];

interface VectorError {
  vector: string;
  points: number;
  ngspicePeak: number;
  maxAbsolute: number;
  /** Max error over the vector's own ngspice peak; inflated for structurally zero entries. */
  maxNormalized: number;
  rmsNormalized: number;
  /** Max error over the ngspice peak of the whole matrix the vector belongs to (S, Y, Z or Cy). */
  maxNormalizedToMatrix: number;
}

void main();

async function main(): Promise<void> {
  const ngspiceVersion = execFileSync('ngspice', ['--version'], { encoding: 'utf8' })
    .match(/ngspice-(\d+)/)?.[0] ?? 'ngspice (version not parsed)';
  const fixtures = [];
  for (const name of FIXTURES) fixtures.push(await compareFixture(name));
  const worst = fixtures.flatMap(fixture => fixture.vectors)
    .reduce<VectorError | null>((max, entry) =>
      (max === null || entry.maxNormalizedToMatrix > max.maxNormalizedToMatrix ? entry : max), null);
  const report = {
    schema: 'spice-ts-rf-port-sp/v1',
    issue: 'https://github.com/mfiumara/spice-ts/issues/499',
    referenceSimulator: ngspiceVersion,
    machine: { platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model ?? 'unknown', node: process.version },
    commands: {
      comparison: 'pnpm bench:rf-port-sp',
      ngspice: 'ngspice -b -r <temporary-raw-path> <byte-identical fixture> (with set filetype=ascii)',
    },
    identicalNetlistBytesForBothEngines: true,
    errorMetric: 'max_k |spice-ts_k - ngspice_k| over all points, divided by the ngspice peak of the vector (maxNormalized) and of its whole S/Y/Z/Cy matrix (maxNormalizedToMatrix, the headline metric: structurally zero entries such as sp4 Y_1_2 ~ 3e-17 are rounding noise in both engines); frequency grids must match exactly',
    worstNormalizedError: worst?.maxNormalizedToMatrix ?? null,
    worstVector: worst?.vector ?? null,
    fixtures,
    exclusions: [
      'ngspice also writes the node voltages/branch currents of its last port excitation into the SP plot; spice-ts returns only the S/Y/Z (and noise) vectors, so those are not compared.',
      'Transient pwr/freq port waveforms are covered by unit tests (closed form, ngspice-47 t=0 value), not this receipt.',
    ],
    losses: [
      'donoise supports resistor thermal noise only; other noisy devices are rejected with InvalidCircuitError.',
      'ngspice-47 vsrcload.c adds the previously loaded V source value to a pwr/freq port waveform (uninitialized accumulator); spice-ts evaluates sqrt(4*pwr*z0)*cos(2*pi*freq*t) alone, so circuits with another V source loaded just before a power port differ in .op (no DC value) and .tran.',
      'Any non-zero residual above is retained; runtimes include ngspice process startup and are not a speed claim.',
    ],
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(resolve(REPORT_PATH), json);
  process.stdout.write(json);
}

async function compareFixture(name: string) {
  const path = `${DIRECTORY}/${name}`;
  const bytes = readFileSync(resolve(path));
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-rf-port-sp-'));
  try {
    const inputPath = join(workspace, basename(path));
    const rawPath = join(workspace, 'output.raw');
    writeFileSync(inputPath, bytes);
    writeFileSync(join(workspace, '.spiceinit'), 'set filetype=ascii\n');
    const ngspiceStart = performance.now();
    execFileSync('ngspice', ['-b', '-r', rawPath, inputPath], {
      cwd: workspace, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: workspace },
    });
    const ngspiceMilliseconds = performance.now() - ngspiceStart;
    const plots = parseNgspiceRaw(readFileSync(rawPath, 'utf8'));

    const spiceTsStart = performance.now();
    const result = await simulate(bytes.toString('utf8'));
    const spiceTsMilliseconds = performance.now() - spiceTsStart;

    const vectors: VectorError[] = [];
    for (const plot of plots) {
      const kind = plot.plotName.toLowerCase();
      const compared = Object.entries(plot.signals)
        .map(([signal, reference]) => ({ signal, reference, actual: spiceTsVector(result, kind, signal, plot.grid) }))
        .filter((entry): entry is { signal: string; reference: ComplexValue[]; actual: ComplexValue[] } => entry.actual !== null);
      const matrixPeak = new Map<string, number>();
      for (const { signal, reference } of compared) {
        const family = matrixFamily(signal);
        matrixPeak.set(family, Math.max(matrixPeak.get(family) ?? 0, peakOf(reference)));
      }
      for (const { signal, reference, actual } of compared) {
        vectors.push(measure(`${plot.plotName}: ${signal}`, actual, reference, matrixPeak.get(matrixFamily(signal))!));
      }
    }
    if (vectors.length === 0) throw new Error(`${name}: no comparable vectors`);
    return {
      fixture: path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      plots: plots.map(plot => `${plot.plotName}:${plot.grid.length}`),
      convergence: { spiceTs: 'success', ngspice: 'success' },
      runtimeMilliseconds: { spiceTs: round(spiceTsMilliseconds), ngspiceProcess: round(ngspiceMilliseconds) },
      comparedVectors: vectors.length,
      worstNormalizedError: Math.max(...vectors.map(vector => vector.maxNormalizedToMatrix)),
      vectors,
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

/** The spice-ts values for one ngspice raw vector, or null when spice-ts has no counterpart. */
function spiceTsVector(result: SimulationResult, plot: string, signal: string, grid: number[]): ComplexValue[] | null {
  const node = (name: string) => name.replace(/^(.*)#res$/, (_, source: string) => `${source.toUpperCase()}.res`);
  if (plot.includes('sp analysis')) {
    const sp = result.sParameters!;
    assertGrid(sp.frequencies, grid, signal);
    const name = signal.replace(/^i\((cy_\d+_\d+)\)$/, '$1');
    if (!/^(s|y|z|cy)_\d+_\d+$|^(nf|sopt|nfmin|rn)$/.test(name)) return null;
    return sp.vector(name).map(value => ({ re: value.real, im: value.imaginary }));
  }
  const match = signal.match(/^([vi])\((.+)\)$/);
  if (!match) return null;
  if (plot.includes('operating point')) {
    const dc = result.dc!;
    return [{ re: match[1] === 'v' ? dc.voltage(node(match[2])) : dc.current(match[2].toUpperCase()), im: 0 }];
  }
  if (plot.includes('ac analysis')) {
    const ac = result.ac!;
    assertGrid(ac.frequencies, grid, signal);
    const values = match[1] === 'v' ? ac.voltage(node(match[2])) : ac.current(match[2].toUpperCase());
    return values.map(({ magnitude, phase }) => ({
      re: magnitude * Math.cos(phase * Math.PI / 180),
      im: magnitude * Math.sin(phase * Math.PI / 180),
    }));
  }
  return null;
}

function assertGrid(actual: number[], expected: number[], signal: string): void {
  if (actual.length !== expected.length
      || actual.some((value, index) => Math.abs(value - expected[index]) > 1e-9 * Math.abs(expected[index]))) {
    throw new Error(`${signal}: frequency grid differs (spice-ts ${actual.length} points, ngspice ${expected.length})`);
  }
}

/** `s_1_2` -> `s`, `i(cy_1_2)` -> `cy`; any other vector is its own family. */
function matrixFamily(signal: string): string {
  return signal.match(/^(?:i\()?(s|y|z|cy)_\d+_\d+\)?$/)?.[1] ?? signal;
}

function peakOf(values: ComplexValue[]): number {
  return Math.max(...values.map(value => Math.hypot(value.re, value.im)));
}

function measure(vector: string, actual: ComplexValue[], reference: ComplexValue[], matrixPeak: number): VectorError {
  const peak = peakOf(reference);
  const errors = reference.map((value, index) => Math.hypot(actual[index].re - value.re, actual[index].im - value.im));
  const maxError = Math.max(...errors);
  const scale = peak > 0 ? peak : 1;
  return {
    vector,
    points: reference.length,
    ngspicePeak: sig(peak),
    maxAbsolute: sig(maxError),
    maxNormalized: sig(maxError / scale),
    rmsNormalized: sig(Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length) / scale),
    maxNormalizedToMatrix: sig(maxError / (matrixPeak > 0 ? matrixPeak : 1)),
  };
}

function sig(value: number): number {
  return Number(value.toPrecision(3));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
