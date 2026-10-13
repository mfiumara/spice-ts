import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribution, cpuSelf } from './metrics.mjs';
test('distribution retains all samples including losses and computes even/odd medians', () => {
  assert.deepEqual(distribution([5, 1, 100]), { count: 3, median: 5, min: 1, max: 100 });
  assert.equal(distribution([10, 2]).median, 6);
});
test('distribution rejects missing/nonfinite samples', () => {
  assert.throws(() => distribution([]));
  assert.throws(() => distribution([NaN]));
});
test('CPU self uses sample deltas rather than hit counts', () => {
  assert.deepEqual(cpuSelf({ nodes: [{ id: 1, callFrame: { functionName: 'a' } }, { id: 2, callFrame: { functionName: 'b' } }], samples: [1, 2, 1], timeDeltas: [1000, 5000, 2000] }), [{ name: 'b', ms: 5 }, { name: 'a', ms: 3 }]);
});
test('CPU self rejects inconsistent sample IDs and missing deltas', () => {
  assert.throws(() => cpuSelf({ nodes: [], samples: [1], timeDeltas: [1] }));
  assert.throws(() => cpuSelf({ nodes: [], samples: [1], timeDeltas: [] }));
});
