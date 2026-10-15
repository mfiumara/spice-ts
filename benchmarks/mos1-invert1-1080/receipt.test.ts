import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name: string) => JSON.parse(readFileSync(`benchmarks/mos1-invert1-1080/${name}`, 'utf8'));
test('original loss remains; fine-step diagnostic is not a claimed fix', () => {
  const runs = read('probe.json');
  assert.deepEqual(runs.map((r: {step: string}) => r.step), ['original', ' 1ns', ' 0.2ns']);
  assert.equal(runs[0].row.worstNormalizedError, 0.249);
  assert.equal(runs[0].row.outcome, 'mismatch');
  assert.equal(runs[1].row.outcome, 'mismatch');
  assert.equal(runs[2].row.outcome, 'matched');
  assert.equal(runs[2].row.worstNormalizedError, 0.000794);
  const metric = runs[0].row.comparisons[0].metrics.signals['i(vdddev)'];
  assert.equal(metric.absoluteError.max, 0.0004459265790256867);
  assert.equal(metric.absoluteError.rms, 1.929833451751002e-5);
});
test('all 24 public outcomes retain their scores and losses', () => {
  const delta = read('corpus-delta.json');
  assert.equal(delta.rows.length, 24);
  assert.equal(new Set(delta.rows.map((r: {id: string}) => r.id)).size, 24);
  assert.equal(delta.changedScores, 0);
  for (const r of delta.rows) {
    assert.equal(r.beforeOutcome, r.afterOutcome, r.id);
    assert.equal(r.beforeWorst, r.afterWorst, r.id);
  }
  const publicReport = JSON.parse(readFileSync('benchmarks/corpus/corpus-m/outcomes.json', 'utf8'));
  assert.equal(publicReport.fixtures.find((r: {id: string}) => r.id === 'm-18').worstNormalizedError, 0.249);
});
