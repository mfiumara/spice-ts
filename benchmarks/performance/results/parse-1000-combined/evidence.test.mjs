import test from 'node:test';
import assert from 'node:assert/strict';
import { matrix, corpus, load, rows } from './evidence.mjs';
import { verify } from '../../linear-10k-verify.mjs';

test('all 240 samples certify clocks, decks, parse state and complete output', () => {
  const baseline = matrix('baseline');
  const comparison = matrix('comparison');
  assert.equal(baseline.samples, 60);
  assert.equal(comparison.samples, 180);
  assert.equal(comparison.thresholdMet, true);
  for (const circuit of ['rc-ladder-tran', 'resistor-mesh-op']) {
    assert.equal(baseline.parseHashes[circuit], comparison.parseHashes[circuit + '-10000']);
    assert.equal(baseline.outputHashes[circuit].control, comparison.outputHashes[circuit + '-10000'].control);
  }
});

test('all successful parser corpus calls preserve their input/state multiset', () => {
  assert.deepEqual(corpus(), {
    successfulParses: 951,
    uniqueStates: 771,
    sha256: 'fe6b2d01637f62bf5de89813c1de493c384340fc2d1d9e7cb63acbf9d7cb5c5f',
  });
});

test('refreshed main comparison is certified but fails the disjoint-IQR gate', () => {
  assert.equal(matrix('baseline-refreshed').samples, 60);
  const refreshed = matrix('comparison-refreshed');
  assert.equal(refreshed.samples, 180);
  assert.equal(refreshed.thresholdMet, false);
  assert.equal(refreshed.comparison['resistor-mesh-op-10000'].nonOverlappingIQR, false);
  assert.ok(corpus('-refreshed').successfulParses > 951);
});

for (const [name, corrupt] of [
  ['parse-state corruption', rows => { rows.find(row => row.mode === 'candidate').worker.evidence.parseSha256 = '0'.repeat(64); }],
  ['output corruption', rows => { rows.find(row => row.mode === 'candidate').worker.evidence.output.outputSha256 = '0'.repeat(64); }],
  ['missing round', rows => { rows.pop(); }],
  ['clock corruption', rows => { rows[0].end.realtime += 1; }],
]) test('rejects ' + name, () => {
  const samples = rows('comparison/receipts.jsonl');
  corrupt(samples);
  assert.throws(() => verify(samples, load('comparison/prepared.json'), load('comparison/budget.json')));
});
