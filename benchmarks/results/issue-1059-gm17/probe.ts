import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { simulate } from '../../../packages/core/dist/index.js';
import { runNgspice, alignAndMeasure, sharedGridPoints, type SampleSeries } from '../../comparison-harness.js';

// Data shape: identical input bytes, waveform grids and per-signal canonical scores.
const here = dirname(fileURLToPath(import.meta.url));
export const revision = '66d67caff2f10e4d6a36d2e59898cc52d661b98d';
export function original(name: string): string {
  return execFileSync('git', ['show', `${revision}:benchmarks/corpus/corpus-l/fixtures/xyce/Netlists/CircuitSim90/MOS3/${name}.cir`], { encoding: 'utf8' });
}
export async function pair(name: string, input: string) {
  const ng = await runNgspice({ name, netlist: input, analysis: 'tran', signals: [] });
  if (ng.status !== 'success') throw new Error(JSON.stringify(ng));
  const ts = (await simulate(input)).transient!;
  const actual: SampleSeries = { grid: ts.time, signals: Object.fromEntries([
    ...Array.from(ts.voltages, ([s, v]) => [`v(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
    ...Array.from(ts.currents, ([s, v]) => [`i(${s.toLowerCase()})`, v.map(re => ({ re, im: 0 }))]),
  ]) };
  const signals = Object.keys(actual.signals).filter(s => ng.series.signals[s]);
  const metrics = alignAndMeasure(actual, ng.series, signals, { breakpoints: sharedGridPoints(actual.grid, ng.series.grid) });
  const errors = signals.map(signal => {
    const metric = metrics.signals[signal];
    if (metric.status !== 'compared') throw new Error(signal);
    const peak = Math.max(signal.startsWith('i(') ? 1e-10 : 1e-4, ...ng.series.signals[signal].map(v => Math.abs(v.re)));
    return { signal, normalized: metric.absoluteError.max / peak, absoluteMax: metric.absoluteError.max };
  }).sort((a, b) => b.normalized - a.normalized);
  return { name, input, sha256: createHash('sha256').update(input).digest('hex'), errors, actual, reference: ng.series };
}
async function main() {
  mkdirSync(here, { recursive: true });
  const input = original('gm17');
  const models = input.slice(input.indexOf('.model nn4a'), input.indexOf('*.ic'));
  const subcircuits = input.slice(input.indexOf('.subckt inv'), input.indexOf('.model nn4a'));
  const variants = [
    ['original', input],
    ['storage-write', input.replace(/\* transparent latch:[\s\S]*?\* tri-state write cell:/, '* tri-state write cell:')
      .replace(/\* address decoder:[\s\S]*?\.subckt tg/, 'vword 2 0 0\n.subckt tg')
      .replace(/^vclk .*$/m, '').replace(/^vad .*$/m, '').replace(/ v\(1\)=5/g, '')],
    ['write-cell', `gm17 write cell startup reduction\nvdd 10 0 5\nvdi 9 0 0\nvwr 3 0 0\nx11 11 9 10 inv\nx12 14 13 10 inv\nx13 15 12 10 inv\nx14 12 9 3 10 nand\nx15 13 3 11 10 nand\n${subcircuits}${models}.ic v(10)=5\n.tran .25n 16n\n.end\n`],
    ['nand', `gm17 NAND startup reduction\nvdd 10 0 5\nvdi 9 0 0\nvwr 3 0 0\nx14 12 9 3 10 nand\n${subcircuits}${models}.ic v(10)=5\n.tran .25n 16n\n.end\n`],
    ['inverter', `gm17 inverter startup reduction\nvdd 10 0 5\nvdi 9 0 0\nx11 11 9 10 inv\n${subcircuits}${models}.ic v(10)=5\n.tran .25n 16n\n.end\n`],
  ];
  for (const [name, bytes] of variants) {
    const row = await pair(name, bytes);
    writeFileSync(resolve(here, `${name}.json.gz`), gzipSync(JSON.stringify(row), { level: 9 }));
    writeFileSync(resolve(here, `${name}.cir`), bytes);
    console.log(name, row.errors.slice(0, 3), 'first', row.actual.grid.slice(0, 3), row.reference.grid.slice(0, 3));
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
