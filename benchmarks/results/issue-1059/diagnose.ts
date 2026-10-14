import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../../../packages/core/dist/index.js';
import { runNgspice } from '../../comparison-harness.js';

// Data shape: real-valued series, paired input digest, per-signal peak-normalised errors.
interface Series { grid: number[]; signals: Record<string, number[]> }
const here = dirname(fileURLToPath(import.meta.url));
const revision = '66d67caff2f10e4d6a36d2e59898cc52d661b98d';
const version = execFileSync('ngspice', ['-v'], { encoding: 'utf8' });
if (!version.includes('ngspice-47')) throw new Error('requires ngspice-47');
function signals(entries: Iterable<[string, number | number[]]>, prefix: string): Array<[string, number[]]> {
  return Array.from(entries, ([name, values]) => [`${prefix}(${name.toLowerCase()})`, typeof values === 'number' ? [values] : values]);
}
function interpolate(series: Series, signal: string, time: number): number {
  let lo = 0; let hi = series.grid.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (series.grid[mid] <= time) lo = mid; else hi = mid; }
  if (series.grid[hi] === series.grid[lo]) return series.signals[signal][lo];
  const f = (time - series.grid[lo]) / (series.grid[hi] - series.grid[lo]);
  return series.signals[signal][lo] * (1 - f) + series.signals[signal][hi] * f;
}
function compare(actual: Series, reference: Series) {
  return Object.keys(actual.signals).filter(s => reference.signals[s]).map(signal => {
    const floor = signal.startsWith('i(') ? 1e-10 : 1e-4;
    const peak = Math.max(floor, ...reference.signals[signal].map(Math.abs));
    let worst = 0; let worstTime = 0;
    let first: { time: number; actual: number; reference: number; normalized: number } | null = null;
    for (let i = 0; i < actual.grid.length; i++) {
      const time = actual.grid[i];
      if (time < reference.grid[0] || time > reference.grid.at(-1)!) continue;
      const ref = interpolate(reference, signal, time);
      const error = Math.abs(actual.signals[signal][i] - ref) / peak;
      if (error > worst) { worst = error; worstTime = time; }
      if (!first && error > 0.01) first = { time, actual: actual.signals[signal][i], reference: ref, normalized: error };
    }
    return { signal, peak, worst, worstTime, first };
  }).sort((a, b) => b.worst - a.worst);
}
export async function paired(name: string, input: string, analysis: 'op' | 'tran') {
  const sha256 = createHash('sha256').update(input).digest('hex');
  const ng = await runNgspice({ name, netlist: input, analysis, signals: [] });
  if (ng.status !== 'success') throw new Error(`${name}: ${JSON.stringify(ng)}`);
  const result = await simulate(input);
  const plot = analysis === 'op' ? result.dc! : result.transient!;
  const ts: Series = {
    grid: analysis === 'op' ? [0] : result.transient!.time,
    signals: Object.fromEntries([
      ...signals(plot.voltages, 'v'),
      ...signals(plot.currents, 'i'),
    ]),
  };
  const reference: Series = { grid: ng.series.grid, signals: Object.fromEntries(Object.entries(ng.series.signals).map(([s, v]) => [s, v.map(x => x.re)])) };
  const errors = compare(ts, reference);
  // Keep full numeric receipts for every common signal, but bound waveform payloads.
  // Selection does not affect scoring. Include the eight worst, eight earliest,
  // and a fixed list of local nodes/currents used in the report and reduced test.
  const retained = new Set([
    ...errors.slice(0, 8).map(e => e.signal),
    ...errors.filter(e => e.first).sort((a, b) => a.first!.time - b.first!.time).slice(0, 8).map(e => e.signal),
    ...['v(2)', 'v(3)', 'v(4)', 'v(5)', 'v(11)', 'v(12)', 'v(13)', 'v(x15.4)', 'i(vin)', 'i(vdd)', 'i(vp)', 'i(vtest1)', 'i(vpulse)', 'i(vdi)', 'i(vwr)'],
  ]);
  const retain = (series: Series): Series => ({ grid: series.grid, signals: Object.fromEntries(Object.entries(series.signals).filter(([s]) => retained.has(s))) });
  writeFileSync(resolve(here, `${name}.waveforms.json.gz`), gzipSync(JSON.stringify({ input, sha256, allSignalCount: errors.length, reference: retain(reference), spiceTs: retain(ts) }), { level: 9 }));
  return { sha256, ngPoints: reference.grid.length, tsPoints: ts.grid.length, errors, ts, reference };
}
async function main() {
  mkdirSync(here, { recursive: true });
  const rows = [];
  for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['gm17', 'gm19', 'gm2', 'mike2', 'gm1', 'gm3', 'todd3']) {
    const input = execFileSync('git', ['show', `${revision}:benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/CircuitSim90/MOS3/${name}.cir`], { encoding: 'utf8' });
    const opInput = input.replace(/^\s*\.tran[^\n]*/mi, '.op');
    const tranLine = input.match(/^\s*\.tran\s+(\S+)\s+(\S+)[^\n]*/mi)!;
    const defaultRun = await paired(`${name}-default`, input, 'tran');
    const op = await paired(`${name}-op`, opInput, 'op');
    // Uniform diagnostic cap: original TSTEP / 20, applied to BOTH engines.
    const { parse } = await import('../../../packages/core/dist/index.js');
    const parsed = parse(input);
    const tran = parsed.analyses.find(a => a.type === 'tran')!;
    if (tran.type !== 'tran') throw new Error('no transient');
    const fineInput = input.replace(tranLine[0], `.tran ${tranLine[1]} ${tranLine[2]} 0 ${tran.timestep / 20}`);
    const fine = await paired(`${name}-fine`, fineInput, 'tran');
    const strip = ({ ts: _ts, reference: _ref, ...receipt }: Awaited<ReturnType<typeof paired>>) => receipt;
    const row = { name, default: strip(defaultRun), op: strip(op), fine: strip(fine), defaultTsVsFineNg: compare(defaultRun.ts, fine.reference), defaultNgVsFineNg: compare(defaultRun.reference, fine.reference) };
    rows.push(row);
    writeFileSync(resolve(here, 'summary.json'), JSON.stringify({ revision, coreRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), ngspice: 'ngspice-47', node: process.version, rows }, null, 2) + '\n');
    console.log(name, 'OP', op.errors.slice(0, 3), 'default', defaultRun.errors.slice(0, 2), 'fine', fine.errors.slice(0, 2));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
