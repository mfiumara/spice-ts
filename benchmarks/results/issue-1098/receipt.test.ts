import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { outcomeDigest } from '../../corpus/corpus-f/outcomes.js';
import { report } from '../../corpus/corpus-n/parity.js';
import { hash } from '../../corpus/corpus-n/survey.js';

test('#1098 full corpus snapshot retains every original fixture and loss', async () => {
  const bytes = await readFile('benchmarks/corpus/corpus-n/manifest.json');
  const manifest = JSON.parse(bytes.toString());
  const result = JSON.parse(await readFile(new URL('./outcomes.json', import.meta.url), 'utf8'));
  assert.equal(result.coreTree, '58a5e5b36461875209311cba9c5183c459971bba');
  assert.equal(result.manifestSha256, hash(bytes));
  assert.equal(result.outcomeSha256, outcomeDigest(result));
  assert.equal(result.fixtures.length, 24);
  assert.deepEqual(result.fixtures.map((row: { sha256: string }) => row.sha256), manifest.circuits.map((circuit: { sha256: string }) => circuit.sha256));
  assert.deepEqual(result.totals, report.summarize(result.fixtures).totals);
  assert.equal(result.policy.fixtureAdaptation, 'none');
  assert.equal(result.policy.perCircuitToleranceTuning, false);
  assert.equal(result.policy.matchThreshold, 0.01);
  const target = result.fixtures.find((row: { id: string }) => row.id === 'n-2');
  assert.equal(target.ngspice.status, 'success');
  assert.equal(target.spiceTs.status, 'success');
  assert.equal(target.outcome, 'not-compared');
  assert.equal(target.comparedSignals, 0);
  assert.equal(target.worstNormalizedError, null);
});
