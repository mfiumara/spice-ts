import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { alignAndMeasure, parseNgspiceRaw, sharedGridPoints, type SampleSeries } from '../../comparison-harness.js';

// Data shape: bounded native last-load states and canonical native-control comparisons.
interface NativeLoad { name: string; time: number; mode: number; order: number; ag: number[]; prime: number[]; v: number[]; half: number[]; q0: number[]; q1: number[]; cq: number[] }
const here = dirname(fileURLToPath(import.meta.url));
const scratch = process.env.TMPDIR!;
const baseline = JSON.parse(gunzipSync(readFileSync(resolve(here, 'original.json.gz'))).toString()) as { actual: SampleSeries; reference: SampleSeries };
const loads = readFileSync(resolve(scratch, 't_e457fe0a-gm17.trace'), 'utf8').split('\n')
  .filter(line => line.startsWith('GM17 ')).map(line => JSON.parse(line.slice(5)) as NativeLoad);
const last = new Map<string, NativeLoad>();
for (const row of loads) last.set(`${row.time}/${row.mode}/${row.name}`, row);
const gate9 = ['m.x11.mp1', 'm.x11.mn1', 'm.x14.mp2', 'm.x14.mn2'];
const gate3 = ['m.x14.mp1', 'm.x14.mn1', 'm.x15.mp2', 'm.x15.mn2'];
const kcl = [1.6e-12, 3.2e-12].map(time => {
  const rows = Array.from(last.values()).filter(r => Math.abs(r.time - time) < 1e-25 && r.mode === 257);
  const current = (names: string[]) => rows.filter(r => names.includes(r.name))
    .reduce((sum, r) => sum + (r.name.endsWith('mp1') || r.name.endsWith('mp2') ? -1 : 1) * r.cq.reduce((a, b) => a + b, 0), 0);
  return { time, gate9ChargeCurrent: current(gate9), gate3ChargeCurrent: current(gate3) };
});
const nativeStates = Array.from(last.values()).filter(r => [...gate9, ...gate3].includes(r.name));
const diagonal = new Map<string, unknown>();
for (const line of readFileSync(resolve(scratch, 't_e457fe0a-gm17.trace'), 'utf8').split('\n')) {
  if (!line.startsWith('GM17_DIAG ')) continue;
  const row = JSON.parse(line.slice('GM17_DIAG '.length)) as { time: number; mode: number };
  diagonal.set(`${row.time}/${row.mode}`, row);
}
const controls = ['gm17', 'gm17-no-leak', 'storage-no-leak'].map(name => {
  const reference = parseNgspiceRaw(readFileSync(resolve(scratch, `t_e457fe0a-${name}.raw`), 'utf8'))[0];
  const actual = name.startsWith('storage')
    ? (JSON.parse(gunzipSync(readFileSync(resolve(here, 'storage-write.json.gz'))).toString()) as { actual: SampleSeries }).actual : baseline.actual;
  const signals = Object.keys(actual.signals).filter(s => reference.signals[s]);
  const scores = alignAndMeasure(actual, reference, signals, { breakpoints: sharedGridPoints(actual.grid, reference.grid) });
  const errors = signals.map(signal => {
    const metric = scores.signals[signal];
    if (metric.status !== 'compared') throw new Error(signal);
    const peak = Math.max(signal.startsWith('i(') ? 1e-10 : 1e-4, ...reference.signals[signal].map(v => Math.abs(v.re)));
    return { signal, normalized: metric.absoluteError.max / peak, absoluteMax: metric.absoluteError.max };
  }).sort((a, b) => b.normalized - a.normalized);
  return { name, errors, reference };
});
writeFileSync(resolve(here, 'native-controls.json.gz'), gzipSync(JSON.stringify(controls), { level: 9 }));
writeFileSync(resolve(here, 'native-state.json'), JSON.stringify({ sourceRevision: 'a80f6e3e95d51534905b1f23410a951802666656', nativeStates, kcl, diagonal: Array.from(diagonal.values()),
  controls: controls.map(({ name, errors, reference }) => ({ name, errors, first: { grid: reference.grid.slice(0, 3),
    signals: Object.fromEntries(Object.entries(reference.signals).filter(([s]) => ['i(vdi)', 'i(vwr)', 'v(10)', 'v(11)', 'v(x15.4)'].includes(s)).map(([s, v]) => [s, v.slice(0, 3)])) } })) }, null, 2) + '\n');
console.log(JSON.stringify({ kcl, controls: controls.map(({ name, errors }) => ({ name, worst: errors.slice(0, 3) })) }, null, 2));
