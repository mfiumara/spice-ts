import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verify } from './linear-10k-verify.mjs';

const directory = new URL('./results/parse-1000/baseline/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, directory)));
const receipts = readFileSync(new URL('receipts.jsonl', directory), 'utf8').trim().split('\n').map(JSON.parse);
const prepared = read('prepared.json'), budget = read('budget.json');

test('parser attribution certifies all sixty samples and serialized circuit equality', () => {
  const result = verify(receipts, prepared, budget);
  assert.equal(result.samples, 60);
  assert.equal(Object.keys(result.parseHashes).length, 2);
});
for (const [name, mutate] of [
  ['parser overlap', rows => { rows.find(r => r.mode === 'instrumented').boundaries.numparam += 1; }],
  ['missing phase', rows => { delete rows.find(r => r.mode === 'instrumented').boundaries.preprocess; }],
  ['changed parse result', rows => { rows.find(r => r.mode === 'instrumented').worker.evidence.parseSha256 = 'changed'; }],
  ['missing parse result', rows => { delete rows.find(r => r.mode === 'control').worker.evidence.parseSha256; }],
]) test(`reject ${name}`, () => {
  const rows = structuredClone(receipts); mutate(rows);
  assert.throws(() => verify(rows, prepared, budget));
});

test('all attempts retain historical full output and serialized parse identity', () => {
  const expected = {
    'rc-ladder-tran': 'cfed768fddaa3d8f6f44396c0b98d1e1101231083774afcf4f993b888a787ede',
    'resistor-mesh-op': '7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f',
  };
  const baseline = verify(receipts, prepared, budget);
  for (const attempt of ['detailed', 'rejected-candidate', 'comparison']) {
    const root = new URL(`./results/parse-1000/${attempt}/`, import.meta.url);
    const load = name => JSON.parse(readFileSync(new URL(name, root)));
    const rows = readFileSync(new URL('receipts.jsonl', root), 'utf8').trim().split('\n').map(JSON.parse);
    const result = verify(rows, load('prepared.json'), load('budget.json'));
    for (const [circuit, hash] of Object.entries(expected)) {
      const key = attempt === 'comparison' ? `${circuit}-10000` : circuit;
      assert.equal(result.outputHashes[key].control, hash);
      assert.equal(result.parseHashes[key], baseline.parseHashes[circuit]);
    }
    if (attempt === 'comparison') {
      assert.equal(result.samples, 180);
      assert.equal(result.thresholdMet, false);
      assert.ok(result.comparison['rc-ladder-tran-10000'].reduction < 0.25);
      assert.ok(result.comparison['resistor-mesh-op-10000'].reduction < 0.25);
      const changed = structuredClone(rows);
      changed.find(r => r.mode === 'candidate' && r.size === 50000).worker.evidence.parseSha256 = 'changed';
      assert.throws(() => verify(changed, load('prepared.json'), load('budget.json')));
    }
  }
});
