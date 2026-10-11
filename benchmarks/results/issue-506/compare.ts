#!/usr/bin/env tsx
/**
 * Issue #506 receipt: VDMOS power MOSFET model vs ngspice-47 on the ngspice
 * examples/vdmos decks named in #506/#509.
 *
 * Usage (after `pnpm -C packages/core build`):
 *   npx tsx benchmarks/results/issue-506/compare.ts                 # print report
 *   npx tsx benchmarks/results/issue-506/compare.ts --output benchmarks/results/issue-506/report.json
 *   npx tsx benchmarks/results/issue-506/compare.ts --decks <ngspice-47>/examples/vdmos
 *
 * Deck bytes: by default read from the corpus-f commit that #506 cites
 * (`git show 5014ae0b:benchmarks/corpus/corpus-f/fixtures/examples/vdmos/<deck>`,
 * BSD-3-Clause ngspice examples, byte-identical to the ngspice-47 tarball);
 * `--decks DIR` reads them from a directory instead. Nothing is committed.
 *
 * The decks run their analyses from `.control` (`dc`, `tran`, `run`, `plot`),
 * which `ngspice -b -r` does not export, so each analysis is compared on an
 * in-memory variant: the `.control ... .endc` block is replaced by the dot
 * card of that one analysis (e.g. `dc vd -1 15 0.05 vg 3 7 1` becomes
 * `.dc vd -1 15 0.05 vg 3 7 1`). Both engines receive the same variant bytes,
 * hashed in the report. The unchanged deck is also run through spice-ts and
 * its status recorded (two decks repeat `dc` in `.control`, which spice-ts
 * does not support yet).
 *
 * Metrics, per common signal: max |spice-ts - ngspice| (abs), the largest
 * |delta| / |ngspice| over points with a non-zero reference (rel), and the
 * corpus-f normalised error max|delta| / max(peak |ngspice|, 1e-12) whose
 * 1% bound is the corpus-f match rule. DC sweeps are compared point by point
 * on identical grids (nested sweeps flattened outer-major by both engines);
 * transient on the spice-ts grid with ngspice linearly interpolated (the
 * corpus-f rule), and also at the ngspice timepoints with spice-ts
 * interpolated, because linear interpolation of a coarse ngspice step across
 * a fast edge inflates the first metric.
 * No per-circuit tolerance.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNativeNgspice, type ClassicCircuit, type EngineExecution } from '../../corpus/classic/report.js';

const CORPUS_F_COMMIT = '5014ae0bcfd6484a2ad4d5b25ed14672851b3ca2';
const CORPUS_F_DIR = 'benchmarks/corpus/corpus-f/fixtures/examples/vdmos';
const MATCH_THRESHOLD = 0.01;
const PEAK_FLOOR = 1e-12;

interface Variant {
  key: string;
  /** Dot card replacing the `.control` block; null keeps the deck's own dot cards. */
  card: string | null;
  analysis: 'dc' | 'tran';
  /** Also report the mean period of rising crossings of this signal through `level` (oscillators). */
  period?: { signal: string; level: number };
}

interface Deck {
  file: string;
  variants: Variant[];
}

const DECKS: Deck[] = [
  { file: 'vdmos-out_ir_mtr.sp', variants: [{ key: 'dc', card: null, analysis: 'dc' }] },
  {
    file: 'vdmos-out.sp',
    variants: [
      { key: 'dc1', card: '.dc vd -1 15 0.05 vg 3 7 1', analysis: 'dc' },
      { key: 'dc2', card: '.dc vg 2 7 0.05 vd 0.5 2.5 0.5', analysis: 'dc' },
    ],
  },
  {
    file: 'vdmosp-out-mtr.sp',
    variants: [
      { key: 'dc1', card: '.dc vd -12 1 0.05 vg 0 -5 -1', analysis: 'dc' },
      { key: 'dc2', card: '.dc vg 0 -4 -0.05 vd -1 -12 -2', analysis: 'dc' },
    ],
  },
  {
    file: 'inv_vdmos.sp',
    variants: [
      { key: 'dc', card: '.dc Vin 0 5 0.05', analysis: 'dc' },
      { key: 'tran', card: '.tran 1n 1u', analysis: 'tran' },
      // Same analysis over the first period with TMAX = 5 ps in both engines:
      // separates time-step control from device-model error.
      { key: 'tran-tmax5p', card: '.tran 1n 300n 0 0.005n', analysis: 'tran' },
    ],
  },
  { file: 'vdmosp-out.sp', variants: [{ key: 'dc', card: null, analysis: 'dc' }] },
  // corpus-f VDMOS deck that runs end to end once VDMOS exists; its start-up is
  // set by `.ic v(6)=2.5`, which spice-ts treats as an initial guess only (#531).
  {
    file: 'ro_11_vdmos.sp',
    variants: [{ key: 'tran', card: null, analysis: 'tran', period: { signal: 'v(6)', level: 2.5 } }],
  },
];

function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function readDeck(file: string, directory: string | undefined): Promise<Buffer> {
  if (directory) return readFile(resolve(directory, file));
  const shown = spawnSync('git', ['show', `${CORPUS_F_COMMIT}:${CORPUS_F_DIR}/${file}`], { maxBuffer: 1 << 24 });
  if (shown.status !== 0) {
    throw new Error(`git show ${CORPUS_F_COMMIT}:${CORPUS_F_DIR}/${file} failed; fetch origin or pass --decks`);
  }
  return shown.stdout;
}

/** Replace the `.control ... .endc` block by `card` (or drop it when card is null). */
function variantBytes(deck: string, card: string | null): string {
  const pattern = /^\.control\b[\s\S]*?^\.endc\b.*$/im;
  if (!pattern.test(deck)) throw new Error('deck has no .control block');
  return deck.replace(pattern, card ?? '');
}

type Series = { grid: number[]; signals: Record<string, number[]> };

async function runSpiceTs(text: string): Promise<{ status: string; error?: string; dc?: Series; tran?: Series }> {
  const core = await import(pathToFileURL(resolve('packages/core/dist/index.js')).href);
  try {
    const result = await core.simulate(text);
    const named = (voltages: Map<string, ArrayLike<number>>, currents: Map<string, ArrayLike<number>>) => {
      const signals: Record<string, number[]> = {};
      for (const [name, values] of voltages) signals[`v(${name.toLowerCase()})`] = Array.from(values);
      for (const [name, values] of currents) signals[`i(${name.toLowerCase()})`] = Array.from(values);
      return signals;
    };
    const out: { status: string; dc?: Series; tran?: Series } = { status: 'success' };
    if (result.dcSweep) {
      const sweep = result.dcSweep as {
        sweepValues: Float64Array;
        voltageArrays: Map<string, Float64Array>;
        currentArrays: Map<string, Float64Array>;
      };
      out.dc = { grid: Array.from(sweep.sweepValues), signals: named(sweep.voltageArrays, sweep.currentArrays) };
    }
    if (result.transient) {
      out.tran = {
        grid: Array.from(result.transient.time as number[]),
        signals: named(result.transient.voltages, result.transient.currents),
      };
    }
    return out;
  } catch (error) {
    return { status: 'failed', error: (error instanceof Error ? error.message : String(error)).slice(0, 400) };
  }
}

function ngspiceSeries(execution: EngineExecution, analysis: 'dc' | 'tran'): Series | undefined {
  const found = execution.analyses.find(entry => entry.type === analysis);
  if (!found) return undefined;
  const signals: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(found.series.signals)) signals[name] = values.map(value => value.re);
  return { grid: found.series.grid, signals };
}

/** ngspice raw names: `vs#branch` -> `i(vs)`, bare node `d` -> `v(d)`. */
function canonical(name: string): string {
  const branch = name.match(/^(?:i\()?(.+)#branch\)?$/);
  if (branch) return `i(${branch[1]})`;
  if (/^[vi]\(/.test(name)) return name;
  return `v(${name})`;
}

function interpolate(grid: number[], values: number[], at: number): number {
  if (at <= grid[0]) return values[0];
  if (at >= grid[grid.length - 1]) return values[values.length - 1];
  let lo = 0;
  let hi = grid.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] <= at) lo = mid; else hi = mid;
  }
  const span = grid[hi] - grid[lo];
  if (span === 0) return values[hi];
  return values[lo] + (values[hi] - values[lo]) * (at - grid[lo]) / span;
}

interface Metric {
  maxAbs: number;
  maxRel: number;
  normalized: number;
  peak: number;
  pass: boolean;
  /** Transient only: normalised error at the ngspice timepoints, spice-ts interpolated. */
  normalizedAtNgspicePoints?: number;
}
interface Comparison {
  gridMismatch?: Record<string, number>;
  points?: { spiceTs: number; ngspice: number };
  signals: Record<string, Metric>;
}

function compare(ours: Series, theirs: Series, analysis: 'dc' | 'tran'): Comparison {
  const reference: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(theirs.signals)) reference[canonical(name)] = values;
  if (analysis === 'dc') {
    if (ours.grid.length !== theirs.grid.length) {
      return { gridMismatch: { spiceTs: ours.grid.length, ngspice: theirs.grid.length }, signals: {} };
    }
    const worstGridDelta = Math.max(...ours.grid.map((value, index) => Math.abs(value - theirs.grid[index])));
    if (worstGridDelta > 1e-9) return { gridMismatch: { worstGridDelta }, signals: {} };
  }
  const signals: Record<string, Metric> = {};
  for (const [name, values] of Object.entries(ours.signals)) {
    const ref = reference[name];
    if (!ref) continue;
    let maxAbs = 0;
    let maxRel = 0;
    let peak = 0;
    for (const value of ref) peak = Math.max(peak, Math.abs(value));
    for (let index = 0; index < values.length; index++) {
      const expected = analysis === 'dc' ? ref[index] : interpolate(theirs.grid, ref, ours.grid[index]);
      const delta = Math.abs(values[index] - expected);
      maxAbs = Math.max(maxAbs, delta);
      if (expected !== 0) maxRel = Math.max(maxRel, delta / Math.abs(expected));
    }
    const normalized = maxAbs / Math.max(peak, PEAK_FLOOR);
    signals[name] = { maxAbs, maxRel, normalized, peak, pass: normalized <= MATCH_THRESHOLD };
    if (analysis === 'tran') {
      let reverse = 0;
      theirs.grid.forEach((time, index) => {
        reverse = Math.max(reverse, Math.abs(interpolate(ours.grid, values, time) - ref[index]));
      });
      signals[name].normalizedAtNgspicePoints = reverse / Math.max(peak, PEAK_FLOOR);
    }
  }
  return { points: { spiceTs: ours.grid.length, ngspice: theirs.grid.length }, signals };
}

/** Mean period between rising crossings of `level`, skipping the first two (start-up) periods. */
function meanPeriod(series: Series, signal: string, level: number): { crossings: number; firstCrossing: number | null; period: number | null } {
  const values = series.signals[signal] ?? series.signals[canonical(signal)];
  if (!values) return { crossings: 0, firstCrossing: null, period: null };
  const crossings: number[] = [];
  for (let index = 1; index < values.length; index++) {
    const before = values[index - 1] - level;
    const after = values[index] - level;
    if (before < 0 && after >= 0) {
      const t0 = series.grid[index - 1];
      crossings.push(t0 + (series.grid[index] - t0) * (-before) / (after - before));
    }
  }
  const periods = crossings.slice(1).map((time, index) => time - crossings[index]).slice(2);
  return {
    crossings: crossings.length,
    firstCrossing: crossings[0] ?? null,
    period: periods.length > 0 ? periods.reduce((sum, value) => sum + value, 0) / periods.length : null,
  };
}

async function main(): Promise<void> {
  const decksIndex = process.argv.indexOf('--decks');
  const directory = decksIndex >= 0 ? process.argv[decksIndex + 1] : undefined;
  const version = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  const decks = [];
  for (const deck of DECKS) {
    const bytes = await readDeck(deck.file, directory);
    const text = bytes.toString('utf8');
    const unchanged = await runSpiceTs(text);
    const variants = [];
    for (const variant of deck.variants) {
      const input = variantBytes(text, variant.card);
      const circuit: ClassicCircuit = {
        id: `${deck.file}#${variant.key}`,
        category: variant.analysis,
        analyses: [variant.analysis],
        sourcePath: `examples/vdmos/${deck.file}`,
        sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/506',
        localPath: deck.file,
        sha256: sha256(input),
        ngspice: { expectedStatus: 'pass' },
        spiceTs: { expectedStatus: 'pass' },
      };
      const ngStart = performance.now();
      const ngspice = await runNativeNgspice(Buffer.from(input, 'utf8'), circuit);
      const ngspiceMs = performance.now() - ngStart;
      const tsStart = performance.now();
      const spiceTs = await runSpiceTs(input);
      const spiceTsMs = performance.now() - tsStart;
      const ours = spiceTs[variant.analysis];
      const theirs = ngspiceSeries(ngspice, variant.analysis);
      const comparison = ours && theirs ? compare(ours, theirs, variant.analysis) : undefined;
      const signals = comparison?.signals ?? {};
      const worst = Object.entries(signals).reduce<[string, number] | null>(
        (best, [name, metric]) => (best === null || metric.normalized > best[1] ? [name, metric.normalized] : best),
        null,
      );
      variants.push({
        key: variant.key,
        card: variant.card ?? '(deck dot cards, .control removed)',
        sha256: circuit.sha256,
        identicalForBothEngines: true,
        ngspice: { status: ngspice.status, ...(ngspice.error ? { error: ngspice.error } : {}), runtimeMs: Number(ngspiceMs.toFixed(1)) },
        spiceTs: { status: spiceTs.status, ...(spiceTs.error ? { error: spiceTs.error } : {}), runtimeMs: Number(spiceTsMs.toFixed(1)) },
        ...(comparison?.gridMismatch ? { gridMismatch: comparison.gridMismatch } : {}),
        ...(comparison?.points ? { points: comparison.points } : {}),
        ...(variant.period && ours && theirs ? {
          period: {
            signal: variant.period.signal,
            level: variant.period.level,
            spiceTs: meanPeriod(ours, variant.period.signal, variant.period.level),
            ngspice: meanPeriod(theirs, variant.period.signal, variant.period.level),
          },
        } : {}),
        matched: worst !== null && worst[1] <= MATCH_THRESHOLD,
        worst: worst ? { signal: worst[0], normalized: worst[1] } : null,
        signals,
      });
    }
    decks.push({
      deck: `examples/vdmos/${deck.file}`,
      sha256: sha256(bytes),
      unchangedDeck: { spiceTs: unchanged.status, ...(unchanged.error ? { error: unchanged.error } : {}) },
      variants,
    });
  }
  const report = {
    schemaVersion: 'spice-ts-issue-506/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/506',
    deckSource: directory ? `directory ${directory}` : `git ${CORPUS_F_COMMIT}:${CORPUS_F_DIR}`,
    tools: {
      ngspice: `${version.stdout}\n${version.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown',
      node: process.version,
    },
    policy: {
      input: 'byte-identical variant for both engines',
      matchRule: `max|delta| <= ${MATCH_THRESHOLD} x max(peak |ngspice|, ${PEAK_FLOOR}) per signal`,
      perCircuitToleranceTuning: false,
    },
    decks,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]), json);
  else process.stdout.write(json);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
