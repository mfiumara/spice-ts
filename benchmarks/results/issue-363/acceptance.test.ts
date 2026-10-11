import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import {
  assertDistortionMetricAccepted,
  DISTORTION_RELTOL,
  type ErrorMetrics,
} from './acceptance.js';

const FIXTURE_PATH = 'benchmarks/corpus/classic/fixtures/spice3f5/diodisto.cir';
const FIXTURE_SHA256 = '912c8cedf66aadbe78f17ceb28644cb8c39a2cb3442559be3219fbaac6d11de8';
const REPORT_PATH = 'benchmarks/results/issue-363/report.json';

describe('issue #363 nonlinear diode distortion receipt', () => {
  it('rejects a product above the shared relative-error bound', () => {
    const metrics: ErrorMetrics = {
      sampleCount: 1,
      maximumAbsoluteError: 0.006,
      rmsAbsoluteError: 0.006,
      maximumRelativeError: 0.006,
      rmsRelativeError: 0.006,
    };
    assert.throws(
      () => assertDistortionMetricAccepted(metrics, 'f1+f2', 'v(out)'),
      new RegExp(`exceeds ${DISTORTION_RELTOL}`),
    );
  });

  it('pins the unchanged fixture and complete focused receipt', async () => {
    const fixture = await readFile(resolve(FIXTURE_PATH));
    assert.equal(createHash('sha256').update(fixture).digest('hex'), FIXTURE_SHA256);
    assert.equal(fixture.byteLength, 292);

    const report = JSON.parse(await readFile(resolve(REPORT_PATH), 'utf8'));
    assert.equal(report.schemaVersion, 'spice-ts-issue-363/v1');
    assert.deepEqual(report.input, {
      path: FIXTURE_PATH,
      bytes: 292,
      sha256: FIXTURE_SHA256,
      byteIdenticalBetweenEngines: true,
    });
    assert.equal(report.tools.ngspice, 'ngspice-47');
    assert.deepEqual(report.after.grid, {
      variation: 'DEC',
      pointsPerDecade: 20,
      startHz: 1000,
      stopHz: 100000000,
      points: 101,
    });
    assert.equal(report.after.fixedSecondToneHz, 900);
    assert.deepEqual(
      report.after.comparisons.map((comparison: { product: string }) => comparison.product),
      ['f1+f2', 'f1-f2', '2f1-f2'],
    );
    for (const comparison of report.after.comparisons) {
      assert.equal(comparison.pointCount, 101);
      assert.equal(comparison.frequencyOrder.length, 101);
      assert.deepEqual(comparison.vectorOrder, [
        'v(2)', 'v(1)', 'v(3)', 'i(vcc2)', 'i(vcc)',
      ]);
      assert.equal(comparison.vectors.length, 5);
      for (const vector of comparison.vectors) {
        assert.equal(vector.metrics.sampleCount, 101);
        assert.ok(vector.metrics.maximumRelativeError <= DISTORTION_RELTOL);
      }
    }
    assert.equal(report.batchStreamContract.batch, 'success');
    assert.deepEqual(report.batchStreamContract.stream, {
      status: 'explicitly-unsupported',
      error: "simulateStream() does not support '.disto' analysis",
    });
    assert.equal(report.policy.perCircuitToleranceTuning, false);
    assert.equal(report.policy.speedClaim, false);
    assert.ok(report.retainedLosses.length >= 5);
  });
});
