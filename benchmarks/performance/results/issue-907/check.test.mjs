import assert from 'node:assert/strict';
import { test } from 'node:test';
import { binaryProbe, errors } from './metrics.mjs';
function raw(values = [0, 1.123456789012345, 1e-9, 1.23456789012345]) {
  const header = Buffer.from('Title: test\nPlotname: Transient Analysis\nFlags: real\nNo. Variables: 2\nNo. Points: 2\nVariables:\n\t0\ttime\ttime\n\t1\tv(n1)\tvoltage\nBinary:\n');
  const bytes = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => bytes.writeDoubleLE(v, i * 8));
  return Buffer.concat([header, bytes]);
}
test('binary probe retains double precision and grid', () => {
  assert.deepEqual(binaryProbe(raw(), 'n1'), { grid: [0, 1e-9], values: [1.123456789012345, 1.23456789012345], variables: 2, points: 2 });
});
test('reject missing probe, truncated and extra raw bytes', () => {
  assert.throws(() => binaryProbe(raw(), 'n2'));
  assert.throws(() => binaryProbe(raw().subarray(0, -1), 'n1'));
  assert.throws(() => binaryProbe(Buffer.concat([raw(), Buffer.from('Title: another plot')]), 'n1'));
});
test('reject nonfinite raw values', () => assert.throws(() => binaryProbe(raw([0, NaN, 1e-9, 1]), 'n1')));
test('errors measure all matched points without interpolation', () => {
  assert.deepEqual(errors({ grid: [0, 1], values: [1, 4] }, { grid: [0, 1], values: [2, 4] }), { points: 2, maxAbs: 1, rmsAbs: Math.sqrt(0.5), maxPeakRelative: 0.25, rmsPeakRelative: Math.sqrt(0.5) / 4, maxGridAbs: 0 });
  assert.throws(() => errors({ grid: [0, 2], values: [1, 4] }, { grid: [0, 1], values: [2, 4] }));
});
