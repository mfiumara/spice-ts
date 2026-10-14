import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { catalogue, ROOT, bucket, summarize, metricDigest } from './audit.js';
import { peakFloor } from '../corpus/corpus-f/lib.js';
import { compareExecutions } from '../aggregate-report.js';
import type { EngineExecution } from '../corpus/classic/report.js';

test('inventory includes exactly all 700 original entries and all 20 new K entries', async () => {
  const entries = await catalogue();
  const report = JSON.parse(await readFile(`${ROOT}/inventory.json`, 'utf8'));
  assert.equal(report.rows.length, 720);
  assert.equal(report.originalCount, 700);
  assert.equal(report.supplementalK, 20);
  assert.equal(report.controlCount, 247);
  assert.deepEqual(report.rows.map((row: { key: string }) => row.key), entries.map(e => e.key));
  const counts: Record<string, number> = {};
  for (const row of report.rows) {
    assert.ok(['changed-improved', 'changed-regressed', 'changed-neutral', 'unchanged', 'not-comparable'].includes(row.bucket));
    counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
    if (row.bucket === 'not-comparable') assert.ok(row.reason);
    if (row.bucket !== 'not-comparable') assert.equal(row.bucket, bucket(row.before, row.after));
    if (row.before && row.after) {
      assert.equal(row.before.metricSha256, metricDigest(row.beforeComparisons));
      assert.equal(row.after.metricSha256, metricDigest(row.afterComparisons));
      for (const side of [row.before, row.after]) {
        for (const error of side.signalErrors) {
          assert.ok(Number.isFinite(error.normalized));
          assert.equal(error.normalized, error.absoluteMax / Math.max(error.ngspicePeak, peakFloor(error.analysis, error.signal)));
        }
        assert.equal(side.normalizedMismatch, side.signalErrors.length ? Math.max(...side.signalErrors.map((error: { normalized: number }) => error.normalized)) : null);
      }
    }
    if (row.after?.ordinalAligned) assert.ok(row.tags.includes('ordinal-aligned'));
    if (row.bucket.startsWith('changed-')) {
      for (const side of [row.before, row.after]) {
        for (const field of ['alignedPoints', 'excludedPoints', 'plotsPaired', 'plotsUnmatched', 'groupsUnmatched']) assert.equal(typeof side[field], 'number');
        assert.ok(side.normalizedMismatch === null || typeof side.normalizedMismatch === 'number');
      }
    }
  }
  assert.deepEqual(report.counts, counts);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 720);
});

test('j-14 reproduces the published same-raw before/after comparison exactly', async () => {
  const report = JSON.parse(await readFile(`${ROOT}/inventory.json`, 'utf8'));
  const row = report.rows.find((r: { key: string }) => r.key === 'corpus-j/j-14');
  assert.deepEqual([row.before.plotsPaired, row.before.alignedPoints, row.before.excludedPoints, row.before.normalizedMismatch], [1, 6, 180, 11.640724167089497]);
  assert.deepEqual([row.after.plotsPaired, row.after.alignedPoints, row.after.excludedPoints, row.after.normalizedMismatch], [6, 1236, 0, 7.609774879516523e-9]);
  assert.equal(row.bucket, 'changed-improved');
});

test('direction buckets preserve regressions and neutral higher-error movement', () => {
  const execution: EngineExecution = { status: 'success', convergence: 'converged', analyses: [{ type: 'dc', plotName: 'dc1', series: { grid: [0, 1], signals: { 'v(out)': [{ re: 0, im: 0 }, { re: 1, im: 0 }] } } }] };
  const base = summarize(compareExecutions(execution, execution), execution, execution);
  assert.equal(bucket(base, base), 'unchanged');
  assert.equal(bucket(base, { ...base, ordinalAligned: true }), 'unchanged');
  const loss = { ...base, matched: false, normalizedMismatch: 0.1 };
  assert.equal(bucket(base, loss), 'changed-regressed');
  assert.equal(bucket(loss, base), 'changed-improved');
  assert.equal(bucket(loss, { ...loss, normalizedMismatch: 0.2 }), 'changed-neutral');
  assert.equal(bucket({ ...loss, normalizedMismatch: null }, { ...loss, normalizedMismatch: null }), 'not-comparable');
  const comparisons = compareExecutions(execution, execution);
  const linearOnly = [{ ...comparisons[0], linearMetrics: structuredClone(comparisons[0].linearMetrics) }];
  const metric = linearOnly[0].linearMetrics.signals['v(out)'];
  assert.equal(metric.status, 'compared');
  if (metric.status === 'compared') metric.absoluteError.max = 0.2;
  assert.deepEqual(linearOnly[0].metrics, comparisons[0].metrics);
  assert.notEqual(metricDigest(linearOnly), metricDigest(comparisons));
});
