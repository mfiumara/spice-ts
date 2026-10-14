import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verify } from './verify.mjs';
const load = () => ({
  rows: readFileSync(new URL('./baseline/receipts.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse),
  prepared: JSON.parse(readFileSync(new URL('./baseline/prepared.json', import.meta.url))),
  budget: JSON.parse(readFileSync(new URL('./baseline/budget.json', import.meta.url))),
});
test('all-size extended leaf phases remain exclusive and preserve complete output', () => {
  const { rows, prepared, budget } = load();
  assert.equal(verify(rows, prepared, budget).samples, 180);
});
for (const [label, mutate] of [
  ['missing round', v => v.rows.pop()],
  ['duplicate round', v => { v.rows[20].round = v.rows[0].round; }],
  ['parse hash drift', v => { v.rows[0].worker.evidence.parseSha256 = '0'.repeat(64); }],
  ['full output drift', v => { v.rows[0].worker.evidence.output.outputSha256 = '0'.repeat(64); }],
  ['overlapping phases', v => { v.rows.find(r => r.mode === 'instrumented').boundaries.numparam += 1; }],
  ['incomplete budget', v => { v.budget.completed--; }],
]) test('rejects ' + label, () => {
  const v = load(); mutate(v);
  assert.throws(() => verify(v.rows, v.prepared, v.budget));
});
