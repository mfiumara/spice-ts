import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const report = JSON.parse(readFileSync('benchmarks/reference/maxord-983/report.json', 'utf8'));

test('five unique cases retain identical-byte hashes and nonempty comparisons', () => {
  assert.equal(report.fixtures.length, 5);
  assert.equal(new Set(report.fixtures.map(row => row.id)).size, 5);
  for (const row of report.fixtures) {
    assert.equal(row.ngspice.status, 'success');
    assert.equal(row.spiceTs.status, 'success');
    assert.equal(row.comparedAnalyses, 1);
    assert.ok(row.comparedSignals > 0);
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
  }
});

test('unchanged pump input moved from unsupported to measured mismatch, not parity', () => {
  const pump = report.fixtures.find(row => row.id === 'k-13');
  const bytes = readFileSync('benchmarks/corpus/corpus-k/fixtures/xyce/Netlists/CircuitSim90/MOS2/pump.cir');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pump.sha256);
  assert.equal(report.before.sha256, pump.sha256);
  assert.equal(report.before.spiceTs.status, 'unsupported');
  assert.equal(report.before.worstNormalizedError, null);
  assert.equal(pump.outcome, 'mismatch');
  assert.ok(pump.worstNormalizedError > 0.01);
  assert.equal(pump.worstSignal, 'tran i(vnin)');
  for (const metric of Object.values(pump.comparisons[0].metrics.signals)) {
    assert.ok(metric.sampleCount > 0);
    assert.ok(Number.isFinite(metric.absoluteError.max));
    assert.ok(Number.isFinite(metric.absoluteError.rms));
  }
});

test('trap and gear MAXORD 1/2 RC probes all match at uniform 1e-6 normalized bound', () => {
  for (const method of ['trap', 'gear']) {
    for (const order of [1, 2]) {
      const row = report.fixtures.find(row => row.id === `rc-${method}-${order}`);
      assert.equal(row.outcome, 'matched');
      assert.ok(row.worstNormalizedError < 1e-6);
      assert.deepEqual(row.spiceTs.analyses, row.ngspice.analyses);
    }
  }
});
