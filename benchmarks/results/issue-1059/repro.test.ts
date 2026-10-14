import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { simulate } from '../../../packages/core/dist/index.js';
import { alignAndMeasure, sharedGridPoints, type SampleSeries } from '../../comparison-harness.js';
interface Capture { input: string; sha256: string; reference: { grid: number[]; signals: Record<string, number[]> } }
const here = dirname(fileURLToPath(import.meta.url));
async function error(file: string): Promise<number> {
  const capture = JSON.parse(gunzipSync(readFileSync(resolve(here, file))).toString()) as Capture;
  assert.equal(createHash('sha256').update(capture.input).digest('hex'), capture.sha256);
  const result = (await simulate(capture.input)).transient!;
  const signals = ['i(vdd)', 'i(vp)', 'v(3)', 'v(4)'];
  const actual: SampleSeries = { grid: result.time, signals: Object.fromEntries(signals.map(s => [s, (s.startsWith('i') ? result.current(s.slice(2, -1)) : result.voltage(s.slice(2, -1))).map(re => ({ re, im: 0 }))])) };
  const reference: SampleSeries = { grid: capture.reference.grid, signals: Object.fromEntries(signals.map(s => [s, capture.reference.signals[s].map(re => ({ re, im: 0 }))])) };
  const metrics = alignAndMeasure(actual, reference, signals, { breakpoints: sharedGridPoints(actual.grid, reference.grid) });
  return Math.max(...signals.map(s => {
    const metric = metrics.signals[s];
    assert.equal(metric.status, 'compared');
    if (metric.status !== 'compared') throw new Error('missing signal');
    return metric.absoluteError.max / Math.max(s.startsWith('i') ? 1e-10 : 1e-4, ...capture.reference.signals[s].map(Math.abs));
  }));
}
test('RED #1059: two MOS3 inverters match ngspice-47 at default steps', {
  todo: process.env.ISSUE1059_RED === '1' ? false : 'Unfixed adaptive-grid mismatch. No production change in this diagnosis card.',
}, async () => {
  assert.ok(await error('reduced-pair.waveforms.json.gz') <= 0.01, 'default exceeds uniform 1% peak rule');
});
test('same reduced deck matches at uniform TSTEP/20 in both engines', async () => {
  assert.ok(await error('reduced-pair-fine.waveforms.json.gz') <= 0.01);
});
