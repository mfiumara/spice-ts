import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MATCH_RULE } from '../../benchmarks/corpus/corpus-f/outcomes.js';

test('#982 receipts retain all 14 MOS2 resistance-gap rows and original-byte hashes', () => {
  const receipt = JSON.parse(readFileSync('evidence/982/parity.json', 'utf8'));
  const original = JSON.parse(spawnSync('git', ['show', `${receipt.fixtureRevision}:benchmarks/corpus/corpus-k/outcomes.json`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout);
  const ids = ['k-1', 'k-2', 'k-3', 'k-4', 'k-5', 'k-6', 'k-7', 'k-8', 'k-10', 'k-11', 'k-12', 'k-15', 'k-16', 'k-17'];
  assert.deepEqual(receipt.fixtures.map((row: { id: string }) => row.id), ids);
  assert.equal(receipt.policy.matchRule, MATCH_RULE);
  assert.equal(receipt.policy.fixtureAdaptation, 'none');
  assert.equal(receipt.fixtures.filter((row: { after: { ngspice: { status: string } } }) => row.after.ngspice.status === 'success').length, 13);
  for (const row of receipt.fixtures) {
    assert.deepEqual(row.before, original.fixtures.find((before: { id: string }) => before.id === row.id));
    const inputPath = `benchmarks/corpus/corpus-k/fixtures/${row.after.sourcePath}`;
    const object = spawnSync('git', ['show', `${receipt.fixtureRevision}:${inputPath}`]);
    assert.equal(object.status, 0);
    assert.equal(createHash('sha256').update(object.stdout).digest('hex'), row.after.sha256);
    assert.ok(Number.isFinite(row.after.runtime.ngspiceChildWallMs));
    assert.ok(Number.isFinite(row.after.runtime.spiceTsChildWallMs));
    assert.ok(!/series resistance parameter .*not supported/.test(row.after.spiceTs.firstErrorLine ?? ''));
    if (row.after.comparedSignals === 0) assert.equal(row.after.worstNormalizedError, null);
    else {
      assert.ok(row.after.comparisons.length > 0);
      assert.ok(Number.isFinite(row.after.worstNormalizedError));
    }
  }
  const bothFailed = receipt.fixtures.find((row: { id: string }) => row.id === 'k-6');
  assert.equal(bothFailed.before.outcome, 'both-failed');
  assert.equal(bothFailed.after.outcome, 'both-failed');
});
