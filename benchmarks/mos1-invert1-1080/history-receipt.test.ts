import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
const root = 'benchmarks/mos1-invert1-1080/';
const read = (name: string) => JSON.parse(readFileSync(root + name, 'utf8'));
const packed = (name: string) => JSON.parse(gunzipSync(readFileSync(root + name)).toString());

test('trace inventories and unchanged corner loss are backed by complete receipts', () => {
  const summary = read('history-summary.json');
  const native = packed('native-history.json.gz');
  const ts = packed('ts-history.json.gz');
  assert.equal(summary.counts.nativeRecords, native.records.length);
  assert.equal(summary.counts.tsRecords, ts.records.length);
  assert.equal(summary.counts.nativeAccepted, native.accepted.length);
  assert.equal(summary.counts.tsAccepted, ts.accepted.length);
  assert.equal(read('history-metadata.json').nativeWaveformBitIdenticalToStock, true);
  assert.equal(summary.corner.tsAccepted[0].current, -0.0013664114551422994);
  assert.ok(Math.abs(summary.corner.nativeAccepted[0].current + 0.0015772673739574594) < 1e-18);
  assert.ok(summary.corner.native.some((r: { kind: string }) => r.kind === 'iteration'));
  assert.ok(summary.corner.ts.some((r: { kind: string }) => r.kind === 'lte'));
});

test('first material predictor current difference precedes adaptive-grid separation', () => {
  const summary = read('history-summary.json');
  const first = summary.firstPredictorCurrentDivergence;
  assert.ok(first.native.time < summary.firstGridDivergence.native.time);
  assert.ok(Math.abs(first.native.time - first.ts.time) < 1e-14);
  assert.equal(first.ts.static.predict, true);
  assert.equal(first.native.bypass, false);
  assert.equal(first.native.order, 2);
  assert.equal(first.ts.integration.method, 'trapezoidal');
  assert.ok(first.native.current[0] < -3e-5);
  assert.ok(first.ts.entries[1].current > 3e-5);
  assert.equal(first.ts.entries[1].charge, first.ts.acceptedCharge[1]);
  assert.ok(Math.abs(first.native.charge[0] - first.native.acceptedCharge[0]) > 1e-14);
  assert.ok(first.maxCurrentDifference > 6e-5);
});

test('all 24 corpus rows retain scores, comparison metrics and engine outcomes', () => {
  const delta = read('history-corpus-delta.json');
  const before = packed('history-corpus-before.json.gz');
  const after = packed('history-corpus-after.json.gz');
  assert.equal(delta.rows.length, 24);
  assert.equal(new Set(delta.rows.map((r: { id: string }) => r.id)).size, 24);
  assert.equal(before.fixtures.length, 24);
  assert.equal(after.fixtures.length, 24);
  for (const row of delta.rows) {
    const a = before.fixtures.find((r: { id: string }) => r.id === row.id);
    const b = after.fixtures.find((r: { id: string }) => r.id === row.id);
    assert.equal(a.outcome, b.outcome);
    assert.equal(a.worstNormalizedError, b.worstNormalizedError);
    assert.deepEqual(a.comparisons, b.comparisons);
    assert.equal(row.comparisonsChanged, false);
  }
  assert.deepEqual(delta.counts, { matched: 15, mismatch: 6, 'spice-ts-loss': 3 });
  assert.equal(delta.rows.find((r: { id: string }) => r.id === 'm-18').afterScore, 0.249);
});
