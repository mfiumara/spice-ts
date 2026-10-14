import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { compareExecutions } from '../aggregate-report.js';
import type { EngineExecution } from '../corpus/classic/report.js';

test('j-14 raw receipt reproduces all six comparisons and retains near-zero TEMP residuals', () => {
  const receipt = JSON.parse(readFileSync('benchmarks/plot-970/j14.json', 'utf8'));
  const raw = JSON.parse(gunzipSync(readFileSync('benchmarks/plot-970/j14-raw.json.gz')).toString()) as { afterEngine: EngineExecution; afterReference: EngineExecution };
  const comparisons = compareExecutions(raw.afterEngine, raw.afterReference);
  assert.deepEqual(comparisons, receipt.after.comparisons);
  assert.equal(comparisons.length, 6);
  assert.equal(comparisons.reduce((sum, c) => sum + c.metrics.grid.alignedPoints, 0), 1236);
  for (const [id, signal, minimum] of [['dc3', 'i(vdsn)', 5e-13], ['dc6', 'i(vdsp)', 8e-13]] as const) {
    const comparison = comparisons.find(c => c.plot?.spiceTs === id)!;
    assert.equal(comparison.metrics.sweepAlignment, 'secondary-value');
    assert.deepEqual(comparison.metrics.sweepGroups?.map(g => g.secondaryValue), [-40, 0, 40, 80, 120, 160]);
    const metric = comparison.metrics.signals[signal];
    assert.equal(metric.status, 'compared');
    if (metric.status === 'compared') {
      assert.ok(metric.absoluteError.max > minimum);
      assert.ok((metric.relativeError.max ?? 0) > 1);
    }
  }
});
