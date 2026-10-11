#!/usr/bin/env tsx
/**
 * Issue #501: TRNOISE / TRRANDOM sources, spice-ts vs ngspice-47 on identical netlists.
 *
 * usage: pnpm exec tsx benchmarks/trnoise-501/compare.ts [--only <fixture substring>]
 *
 * Two kinds of evidence (see README.md):
 * - seeded: decks with `.option seed=N`. ngspice-47 then draws RTS and TRRANDOM values from
 *   a reproducible stream, so the sequence of held values and the RTS capture times must agree
 *   draw for draw. Metric: max relative difference over every draw both engines show.
 * - statistics: the corpus-f decks of issue #501. ngspice-47 seeds its Gaussian (Wallace) pool
 *   from the process id, so white and 1/f noise differ from run to run and cannot be compared
 *   sample by sample. Both engines are reduced to the same statistics on a linear k*TS grid:
 *   mean and rms of white noise, spectral slope of 1/f noise, mean/std of TRRANDOM values and
 *   the RTS high-time fraction, next to the value the source parameters imply.
 * - amplitude: a 1/f-only deck run several times in each engine (ngspice re-draws its pool per
 *   process; spice-ts gets `.option seed=N` appended per run). Metric: variance of the first
 *   differences of the TS-grid samples and the mean per-octave periodogram power, which the
 *   spectral slope cannot see.
 *
 * Each fixture's `.control` block and `.end` are removed (corpus-f decks keep their bytes in
 * benchmarks/corpus/corpus-f/fixtures; only the analysis/plot commands are replaced). ngspice
 * runs the body with `run`, then `linearize` (statistics) and `wrdata`; spice-ts simulates the
 * body. Writes benchmarks/trnoise-501/report.json and prints it.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../packages/core/src/index.js';

type Metric =
  | { kind: 'held'; node: string }
  | { kind: 'rts'; node: string; amplitude: number }
  | { kind: 'white'; node: string; rms: number; mean?: number }
  | { kind: 'pink'; node: string; alpha: number }
  | { kind: 'trrandom'; node: string; mean: number; std: number }
  | { kind: 'rts-duty'; node: string; high: number; expectedFraction: number }
  | { kind: 'pink-amplitude'; node: string; alpha: number; namp: number };

interface Case {
  /** Path relative to the repository root. */
  fixture: string;
  mode: 'seeded' | 'statistics' | 'amplitude';
  /** Analysis card when the deck runs `tran` only from `.control`. */
  tran?: string;
  /** Linear sampling step (the TRNOISE TS) for statistics. */
  step?: number;
  metrics: Metric[];
  /** amplitude mode: ngspice process runs and spice-ts `.option seed` values. */
  ngspiceRuns?: number;
  spiceTsSeeds?: number[];
}

const CORPUS = 'benchmarks/corpus/corpus-f/fixtures/examples';
const CASES: Case[] = [
  {
    fixture: 'benchmarks/trnoise-501/fixtures/seeded-vsrc.cir', mode: 'seeded',
    metrics: [
      { kind: 'rts', node: '1', amplitude: 1 },
      { kind: 'held', node: '2' }, { kind: 'held', node: '5' }, { kind: 'held', node: '6' },
    ],
  },
  {
    fixture: 'benchmarks/trnoise-501/fixtures/seeded-isrc.cir', mode: 'seeded',
    metrics: [
      { kind: 'rts', node: '3', amplitude: -1 },
      { kind: 'held', node: '4' }, { kind: 'held', node: '7' },
    ],
  },
  {
    fixture: `${CORPUS}/transient-noise/rts-1.cir`, mode: 'statistics', step: 1e-6,
    metrics: [
      // VW1of: white 1m rms plus 1/f (alpha 1, 0.1m), TS 1u.
      { kind: 'white', node: '21', rms: Math.hypot(1e-3, 1e-4) },
      // VRTS3 alone: RTS 10m, mean capture 20u, mean emission 40u.
      { kind: 'rts-duty', node: '11', high: 10e-3, expectedFraction: 40 / 60 },
    ],
  },
  {
    fixture: `${CORPUS}/transient-noise/simple-noise.cir`, mode: 'statistics', step: 8e-12,
    metrics: [
      // i2 into r2 (1 ohm): -(white 0.05 rms + the 0.001 RTS offset of RTSCAPT = RTSEMT = 0).
      { kind: 'white', node: '2', rms: 0.05, mean: -0.001 },
      // i3 TRRANDOM(2 8p 0 1.0 0.01) into R3 (1 ohm): Gaussian, std 1, mean -0.01.
      { kind: 'trrandom', node: '3', mean: -0.01, std: 1 },
      // v4 TRRANDOM(2 8p 0 1.0 0.01): Gaussian, std 1, mean 0.01.
      { kind: 'trrandom', node: '4', mean: 0.01, std: 1 },
    ],
  },
  {
    fixture: `${CORPUS}/transient-noise/noise_vnoi.cir`, mode: 'statistics', step: 1e-9,
    metrics: [
      { kind: 'pink', node: '1', alpha: 1.7 },
      { kind: 'pink', node: '2', alpha: 1.4 },
      { kind: 'pink', node: '3', alpha: 1.0 },
      { kind: 'pink', node: '4', alpha: 0.5 },
      { kind: 'white', node: '5', rms: 1e-9, mean: 0 },
    ],
  },
  {
    fixture: 'benchmarks/trnoise-501/fixtures/pink-amplitude.cir', mode: 'amplitude', step: 1e-6,
    ngspiceRuns: 6, spiceTsSeeds: [1, 2, 3, 4],
    metrics: [
      { kind: 'pink-amplitude', node: '1', alpha: 1, namp: 1 },
      { kind: 'pink-amplitude', node: '2', alpha: 1.7, namp: 1 },
    ],
  },
  {
    fixture: `${CORPUS}/various/mtimeavg_test.cir`, mode: 'statistics', step: 0.5e-9, tran: '.tran 0.5n 500n',
    metrics: [{ kind: 'white', node: '1', rms: 20e-9, mean: 0 }],
  },
];

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

void main();

async function main(): Promise<void> {
  const ngspice = execFileSync('ngspice', ['-v'], { encoding: 'utf8' })
    .split('\n').find(line => /ngspice-\d+/.test(line))?.replace(/\*+/g, '').trim();
  // `--only <substring>` runs the matching fixtures and prints them without writing report.json.
  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
  const results = [];
  for (const entry of CASES.filter(candidate => only === undefined || candidate.fixture.includes(only))) {
    results.push(await compare(entry));
    process.stderr.write(`${entry.fixture}: done\n`);
  }
  const report = { ngspice, generatedBy: 'benchmarks/trnoise-501/compare.ts', results };
  if (only === undefined) writeFileSync(join(here, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

interface Series { time: number[]; values: Map<string, number[]> }

async function compare(entry: Case): Promise<Record<string, unknown>> {
  const raw = readFileSync(join(root, entry.fixture));
  const body = raw.toString('utf8')
    .replace(/^\s*\.control[\s\S]*?^\s*\.endc[^\n]*\n?/im, '')
    .replace(/^\s*\.end\s*$/im, '');
  const deck = `${body}\n${entry.tran ?? ''}\n`;
  const nodes = [...new Set(entry.metrics.map(metric => metric.node))];
  if (entry.mode === 'amplitude') return compareAmplitude(entry, raw, deck, nodes);
  const reference = runNgspice(deck, nodes, entry.mode === 'statistics' ? entry.step : undefined);
  const started = performance.now();
  const result = await simulate(`${deck}.end\n`);
  const runtimeMs = performance.now() - started;
  const tran = result.transient!;
  const spiceTs: Series = { time: [...tran.time], values: new Map(nodes.map(node => [node, [...tran.voltage(node)]])) };
  const record: Record<string, unknown> = {
    fixture: entry.fixture,
    sha256: createHash('sha256').update(raw).digest('hex'),
    mode: entry.mode,
    points: { ngspice: reference.time.length, spiceTs: spiceTs.time.length },
    spiceTsRuntimeMs: Math.round(runtimeMs),
  };
  record.metrics = entry.metrics.map(metric => {
    if (metric.kind === 'held' || metric.kind === 'rts') return seededMetric(metric, reference, spiceTs);
    const sampledTs = linearGrid(spiceTs, metric.node, entry.step!, reference.time);
    const sampledNg = reference.values.get(metric.node)!;
    return { ...metric, ngspice: statistic(metric, reference.time, sampledNg, entry.step!), spiceTs: statistic(metric, reference.time, sampledTs, entry.step!) };
  });
  return record;
}

/** 1/f amplitude over repeated runs: ngspice processes vs spice-ts seeds, on the TS grid. */
async function compareAmplitude(entry: Case, raw: Buffer, deck: string, nodes: string[]): Promise<Record<string, unknown>> {
  const step = entry.step!;
  const references = Array.from({ length: entry.ngspiceRuns ?? 1 }, () => runNgspice(deck, nodes, step));
  const grid = references[0].time;
  const runs: Series[] = [];
  for (const seed of entry.spiceTsSeeds ?? [1]) {
    const tran = (await simulate(`${deck}.option seed=${seed}\n.end\n`)).transient!;
    runs.push({ time: [...tran.time], values: new Map(nodes.map(node => [node, [...tran.voltage(node)]])) });
  }
  const round = (value: number): number => Number(value.toPrecision(4));
  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    fixture: entry.fixture,
    sha256: createHash('sha256').update(raw).digest('hex'),
    mode: entry.mode,
    runs: { ngspice: references.length, spiceTsSeeds: entry.spiceTsSeeds ?? [1] },
    metrics: entry.metrics.map(metric => {
      const ng = references.map(reference => amplitude(reference.values.get(metric.node)!));
      const ts = runs.map(run => amplitude(linearGrid(run, metric.node, step, grid)));
      const ngDiff = mean(ng.map(value => value.diffVariance));
      const tsDiff = mean(ts.map(value => value.diffVariance));
      const ngOctave = mean(ng.map(value => value.octavePower));
      const tsOctave = mean(ts.map(value => value.octavePower));
      return {
        ...metric,
        ngspice: { diffVariance: ng.map(value => round(value.diffVariance)), octavePower: ng.map(value => round(value.octavePower)) },
        spiceTs: { diffVariance: ts.map(value => round(value.diffVariance)), octavePower: ts.map(value => round(value.octavePower)) },
        meanDiffVarianceRatioSpiceTsOverNgspice: round(tsDiff / ngDiff),
        meanOctavePowerRatioSpiceTsOverNgspice: round(tsOctave / ngOctave),
      };
    }),
  };
}

/** Variance of first differences and mean per-octave power (octaves 4..n/4) of TS-grid samples. */
function amplitude(values: number[]): { diffVariance: number; octavePower: number } {
  const samples = values.slice(1);
  const diffs = samples.slice(1).map((value, k) => value - samples[k]);
  const diffMean = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  const diffVariance = diffs.reduce((sum, value) => sum + (value - diffMean) ** 2, 0) / diffs.length;
  const bands = octaveBands(samples);
  const octavePower = Math.exp(bands.reduce((sum, [, logPower]) => sum + logPower, 0) / bands.length);
  return { diffVariance, octavePower };
}

/** ngspice-47 on the deck body; `step` linearizes onto k*step before writing. */
function runNgspice(deck: string, nodes: string[], step: number | undefined): Series {
  const workspace = mkdtempSync(join(tmpdir(), 'spicets-trnoise-501-'));
  try {
    const dataPath = join(workspace, 'out.dat');
    const vectors = nodes.map(node => `v(${node})`).join(' ');
    const linearize = step === undefined ? '' : `linearize ${vectors}\n`;
    // numdgt=17: wrdata prints every significant digit (gnuplot.c ft_writesimple).
    writeFileSync(join(workspace, 'deck.cir'), `${deck}.control\nset numdgt=17\nrun\n${linearize}wrdata ${dataPath} ${vectors}\nquit\n.endc\n.end\n`);
    execFileSync('ngspice', ['-b', join(workspace, 'deck.cir')], {
      cwd: workspace, env: { ...process.env, HOME: workspace }, stdio: 'ignore', timeout: 600_000,
    });
    // wrdata: one x column then one value column per vector (x repeated per vector).
    const rows = readFileSync(dataPath, 'utf8').trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
    return {
      time: rows.map(row => row[0]),
      values: new Map(nodes.map((node, k) => [node, rows.map(row => row[2 * k + 1])])),
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function plateaus(time: number[], values: number[]): { times: number[]; values: number[] } {
  const result = { times: [] as number[], values: [] as number[] };
  values.forEach((value, k) => {
    if (k === 0 || value !== values[k - 1]) { result.times.push(time[k]); result.values.push(value); }
  });
  return result;
}

function seededMetric(metric: Metric & { kind: 'held' | 'rts' }, reference: Series, spiceTs: Series): Record<string, unknown> {
  const ng = plateaus(reference.time, reference.values.get(metric.node)!);
  const ts = plateaus(spiceTs.time, spiceTs.values.get(metric.node)!);
  if (metric.kind === 'rts') {
    const captures = (series: typeof ng): number[] => series.times.filter((_, k) => series.values[k] === metric.amplitude);
    const a = captures(ng);
    const b = captures(ts);
    const count = Math.min(a.length, b.length);
    return {
      ...metric,
      captures: { ngspice: a.length, spiceTs: b.length },
      maxRelativeCaptureTimeDifference: maxRelative(a.slice(0, count), b.slice(0, count)),
    };
  }
  // ngspice's drifting VSRC breakpoints can show one extra draw just before TSTOP.
  const count = Math.min(ng.values.length, ts.values.length);
  return {
    ...metric,
    draws: { ngspice: ng.values.length, spiceTs: ts.values.length, compared: count },
    maxRelativeValueDifference: maxRelative(ng.values.slice(0, count), ts.values.slice(0, count)),
  };
}

function maxRelative(a: number[], b: number[]): number {
  let worst = 0;
  a.forEach((value, k) => { worst = Math.max(worst, Math.abs(value - b[k]) / Math.max(Math.abs(value), 1e-300)); });
  return Number(worst.toExponential(2));
}

/** spice-ts linearly interpolated onto the ngspice `linearize` grid. */
function linearGrid(series: Series, node: string, _step: number, grid: number[]): number[] {
  const values = series.values.get(node)!;
  const result: number[] = [];
  let j = 0;
  for (const t of grid) {
    while (j + 1 < series.time.length - 1 && series.time[j + 1] < t) j++;
    const t0 = series.time[j];
    const t1 = series.time[j + 1] ?? t0;
    const fraction = t1 > t0 ? Math.min(Math.max((t - t0) / (t1 - t0), 0), 1) : 0;
    result.push(values[j] + (values[j + 1] - values[j]) * fraction);
  }
  return result;
}

function statistic(metric: Metric, time: number[], values: number[], step: number): Record<string, number> {
  const round = (value: number): number => Number(value.toPrecision(4));
  // Skip t = 0, where every TRNOISE source is held at its DC value.
  const samples = values.slice(1);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const std = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
  switch (metric.kind) {
    case 'white':
      return { samples: samples.length, mean: round(mean), rms: round(std), rmsOverExpected: round(std / metric.rms) };
    case 'pink':
      return { samples: samples.length, spectralSlope: round(spectralSlope(samples)), expectedSlope: -metric.alpha };
    case 'trrandom': {
      // Held values: every sample of a TS-spaced grid is one draw.
      return { samples: samples.length, mean: round(mean), std: round(std) };
    }
    case 'rts-duty': {
      const high = samples.filter(value => Math.abs(value - metric.high) < Math.abs(value)).length;
      let transitions = 0;
      for (let k = 1; k < samples.length; k++) {
        if ((Math.abs(samples[k] - metric.high) < Math.abs(samples[k])) !== (Math.abs(samples[k - 1] - metric.high) < Math.abs(samples[k - 1]))) transitions++;
      }
      return { samples: samples.length, highFraction: round(high / samples.length), transitions, durationS: round(time.at(-1)! - time[0]), stepS: step };
    }
    default:
      return {};
  }
}

/** Least-squares slope of log power vs log frequency over octave bands of a radix-2 periodogram. */
function spectralSlope(samples: number[]): number {
  const points = octaveBands(samples);
  const mx = points.reduce((s, [x]) => s + x, 0) / points.length;
  const my = points.reduce((s, [, y]) => s + y, 0) / points.length;
  return points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
}

/** [log centre frequency, log mean power] of octave bands 4..n/4 of a radix-2 periodogram. */
function octaveBands(samples: number[]): [number, number][] {
  let n = 1;
  while (n * 2 <= samples.length) n *= 2;
  const re = Float64Array.from(samples.slice(0, n));
  const im = new Float64Array(n);
  fft(re, im);
  const points: [number, number][] = [];
  for (let low = 4; low < n / 4; low *= 2) {
    let power = 0;
    for (let f = low; f < 2 * low; f++) power += re[f] * re[f] + im[f] * im[f];
    points.push([Math.log(1.5 * low), Math.log(power / low)]);
  }
  return points;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    for (let start = 0; start < n; start += length) {
      for (let k = 0; k < length / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const i = start + k;
        const j = i + length / 2;
        const xr = re[j] * wr - im[j] * wi;
        const xi = re[j] * wi + im[j] * wr;
        re[j] = re[i] - xr; im[j] = im[i] - xi;
        re[i] += xr; im[i] += xi;
      }
    }
  }
}
