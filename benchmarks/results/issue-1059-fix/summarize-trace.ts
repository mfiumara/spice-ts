import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { chargeTruncationTimestep } from '../../../packages/core/src/devices/charge-state.js';

interface TruncationRecord {
  kind: string; name: string; time: number; bound: number;
  truncation: { deltas: [number, number, number]; reltol: number; abstol: number; chgtol: number; trtol: number };
  before: { charge: number[]; previous: number[]; older: number[]; current: number[] };
  load: { capacitances: number[] };
}
const dir = new URL('./', import.meta.url);
const trace = JSON.parse(gunzipSync(readFileSync(new URL('trace.json.gz', dir))).toString()) as { grid: number[]; records: TruncationRecord[] };
const native = gunzipSync(readFileSync(new URL('ngspice-trace.txt.gz', dir))).toString().split('\n');
const trialTime = 1.0094080480255495e-8;
const mos = native.find(line => line.startsWith('MOS ') && Number(line.split(' ')[1]) === trialTime && line.split(' ')[2] === 'mn1')!.split(' ');
const qgbIndex = Number(mos[5]);
const line = native.find(line => line.startsWith('TERR ') && Number(line.split(' ')[1]) === trialTime && Number(line.split(' ')[2]) === qgbIndex)!;
const values = line.split(' ').slice(1).map(Number);
const nativeInput = { deltas: values.slice(3, 6) as [number, number, number], reltol: 0.001, abstol: 1e-12, chgtol: 1e-14, trtol: 7 };
const nativeRecomputed = chargeTruncationTimestep('trapezoidal', 2, ...values.slice(6, 12) as [number, number, number, number, number, number], nativeInput);
assert.ok(Math.abs(nativeRecomputed - values[12]) < 1e-25);
const ts = trace.records.find(r => r.kind === 'trunc' && r.name === 'mn1' && r.time === trialTime)!;
assert.equal(ts.load.capacitances[2], 0);
const { charge, previous, older, current } = ts.before;
const tsRecomputed = chargeTruncationTimestep('trapezoidal', 2, charge[2], charge[2], previous[2], older[2], -current[2], current[2], ts.truncation);
assert.ok(Math.abs(tsRecomputed - ts.bound) < 1e-25);
const reference = JSON.parse(gunzipSync(readFileSync(new URL('../issue-1059/reduced-pair.waveforms.json.gz', dir))).toString()).reference.grid as number[];
// Ignore sub-attosecond representation differences, not a waveform-error threshold.
const index = trace.grid.findIndex((time, i) => Math.abs(time - reference[i]) > 1e-18);
assert.equal(index, 20);
const result = {
  ngspiceRevision: 'a80f6e3e95d51534905b1f23410a951802666656',
  firstSplit: { index, tsTime: trace.grid[index], ngTime: reference[index], delta: trace.grid[index] - reference[index] },
  firstRejectedEdgeTrial: { time: trialTime, device: 'mn1', charge: 'qgb', nativeLine: line, nativeRecomputed, tsRecomputed, tsBound: ts.bound, tsCharge: charge[2], ngCharge: values[6] },
  conclusion: 'CKTterr arithmetic reproduces native bound on native history. The tiny initial split reflects different charge/current history, not a proven truncation-formula error. Final-load-voltage candidate fails broad acceptance gates.'
};
writeFileSync(new URL('first-split.json', dir), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
