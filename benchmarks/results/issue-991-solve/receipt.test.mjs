import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../../performance/linear-10k-verify.mjs';
const root = new URL('./matrix/', import.meta.url);
const rows = readFileSync(new URL('receipts.jsonl', root), 'utf8').trim().split('\n').map(JSON.parse);
const prepared = JSON.parse(readFileSync(new URL('prepared.json', root)));
const budget = JSON.parse(readFileSync(new URL('budget.json', root)));
test('certifies all 180 published interleaved cells and full-output equality', () => {
  assert.equal(verify(rows, prepared, budget).samples, 180);
});
test('rejects clock corruption rather than trimming the sample', () => {
  const corrupt = structuredClone(rows);
  corrupt[0].end.continuous += 1;
  assert.throws(() => verify(corrupt, prepared, budget), /clock disagreement/);
});
test('rejects a missing round', () => {
  assert.throws(() => verify(rows.slice(1), prepared, budget), /incomplete/);
});
test('rejects candidate output drift', () => {
  const corrupt = structuredClone(rows);
  corrupt.find(r => r.mode === 'candidate').worker.evidence.output.outputSha256 = '0'.repeat(64);
  assert.throws(() => verify(corrupt, prepared, budget), /output changed/);
});
