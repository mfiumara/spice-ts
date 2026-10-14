import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verify } from './linear-10k-verify.mjs';
import { instrument, targets } from './rc1k-attribution-prepare.mjs';
import { hashVectors, statistics } from './rc1k-attribution-data.mjs';

test('nested matrix/ordering instrumentation records exclusive time and preserves result', () => {
  targets['MNAAssembler.lockTopology'] = 'matrixBuild';
  targets['GilbertPeierlsSolver.analyzePattern'] = 'ordering';
  const counts = {};
  const source = `class GilbertPeierlsSolver { analyzePattern() { return 7; } }
class MNAAssembler { lockTopology() { return new GilbertPeierlsSolver().analyzePattern(); } }
return new MNAAssembler().lockTopology();`;
  const code = instrument(source, 'fixture.js', counts);
  assert.deepEqual(counts, { 'GilbertPeierlsSolver.analyzePattern': 1, 'MNAAssembler.lockTopology': 1 });
  let now = 0;
  const stack = [], totals = {};
  globalThis.__rc1k = {
    enter(key) { const span = { key, start: ++now, children: 0 }; stack.push(span); return span; },
    leave(span) { const elapsed = ++now - span.start; assert.equal(stack.pop(), span); totals[span.key] = elapsed - span.children; if (stack.length) stack.at(-1).children += elapsed; },
  };
  try { assert.equal(new Function(code)(), 7); } finally { delete globalThis.__rc1k; }
  assert.deepEqual(totals, { ordering: 1, matrixBuild: 2 });
  assert.equal(stack.length, 0);
});

test('full output hash detects any non-probe change', () => {
  assert.notEqual(hashVectors([['v:a', [1]], ['v:b', [2]]]).outputSha256,
    hashVectors([['v:a', [1]], ['v:b', [3]]]).outputSha256);
});

test('ten samples use interpolated median and IQR, no trimmed wins', () => {
  const result = statistics([10, 1, 8, 2, 9, 3, 7, 4, 6, 5]);
  assert.equal(result.n, 10); assert.equal(result.median, 5.5); assert.equal(result.iqr, 4.5);
  assert.throws(() => statistics([NaN]));
});

const directory = new URL('./results/linear-10k-991/baseline/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, directory)));
const receipts = readFileSync(new URL('receipts.jsonl', directory), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const prepared = read('prepared.json'), budget = read('budget.json');
test('all sixty actual samples certify unchanged output and no eligible solver bucket', () => {
  const result = verify(receipts, prepared, budget);
  assert.equal(result.samples, 60);
  assert.deepEqual(result.eligibleSolverBuckets, []);
});
for (const [name, mutate] of [
  ['missing sample', rows => rows.pop()],
  ['duplicate round', rows => { rows[6].round = rows[0].round; }],
  ['changed deck', rows => { rows[0].worker.evidence.deckSha256 = 'changed'; }],
  ['changed non-probe output', rows => { rows[0].worker.evidence.output.outputSha256 = 'changed'; }],
  ['overlapping phase', rows => { rows.find(r => r.mode === 'instrumented').boundaries.factor += 100; }],
  ['worker failure', rows => { rows[0].code = 1; }],
  ['clock corruption', rows => { rows[0].end.continuous += 1; }],
]) test(`reject ${name}`, () => {
  const rows = structuredClone(receipts); mutate(rows);
  assert.throws(() => verify(rows, prepared, budget));
});
