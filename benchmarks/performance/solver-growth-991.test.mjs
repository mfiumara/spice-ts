import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verify } from './solver-growth-991-verify.mjs';
const circuits = ['rc-ladder-tran', 'resistor-mesh-op', 'cmos-inverter-chain-tran'];
function fixture() {
  const decks = [], rows = [];
  for (const circuit of circuits) for (const size of [1000, 10000, 50000]) {
    decks.push({ circuit, size, deckSha256: 'a'.repeat(64) });
    for (let round = 1; round <= 10; round++) for (const mode of ['control', 'candidate', 'ngspice']) {
      rows.push({ circuit, size, round, mode, status: 'ok', stopReason: null, code: 0, processGroupGone: true,
        start: { continuous: 1, monotonic: 1, realtime: 1 }, end: { continuous: 1.1, monotonic: 1.1, realtime: 1.1 },
        boundaries: { wall: 100, factor: mode === 'candidate' ? 15 : 20, growth: 1, simulate: 30, nativeWall: 50 },
        worker: { status: 'ok', lifetime: { performanceMs: 90, realtimeMs: 90 },
          evidence: { deckSha256: 'a'.repeat(64), output: { outputSha256: 'b'.repeat(64), count: 10, vectors: 2 }, native: { code: 0 } } } });
    }
  }
  const ordered = [];
  const modes = ['control', 'candidate', 'ngspice'];
  for (let round = 1; round <= 10; round++) for (const size of [1000, 10000, 50000]) for (const circuit of circuits) for (const mode of [...modes.slice((round - 1) % 3), ...modes.slice(0, (round - 1) % 3)]) ordered.push(rows.find(r => r.round === round && r.size === size && r.circuit === circuit && r.mode === mode));
  return { rows: ordered, prepared: { decks, factorComparison: true }, budget: { planned: 270, started: 270, completed: 270, nativeAttempted: 90,
    deadlineAndBudgetCertified: true, stopReason: null, actualRunSeconds: 100,
    start: { continuous: 0, monotonic: 0, realtime: 0 }, end: { continuous: 100, monotonic: 100, realtime: 100 } } };
}
test('complete nine-deck matrix and ten-round interleaving certify an identical candidate', () => {
  const f = fixture(), result = verify(f.rows, f.prepared, f.budget);
  assert.equal(result.samples, 270);
  assert.equal(Object.keys(result.summary).length, 9);
  assert.equal(result.thresholdMet, true);
});
for (const [name, mutate] of [
  ['missing cell', f => f.rows.pop()],
  ['duplicate round', f => { f.rows[27].round = 1; }],
  ['non-interleaved order', f => { [f.rows[0], f.rows[1]] = [f.rows[1], f.rows[0]]; }],
  ['output drift', f => { f.rows[1].worker.evidence.output.outputSha256 = 'c'.repeat(64); }],
  ['deck drift', f => { f.rows[1].worker.evidence.deckSha256 = 'c'.repeat(64); }],
  ['failed native', f => { f.rows[2].worker.evidence.native.code = 1; }],
  ['negative phase', f => { f.rows[1].boundaries.factor = -1; }],
  ['missing factor', f => { f.rows[1].boundaries.factor = null; }],
  ['factor outside simulation', f => { f.rows[1].boundaries.factor = 40; }],
  ['clock corruption', f => { f.rows[1].end.continuous += 1; }],
  ['missing clock', f => { delete f.rows[1].end.monotonic; }],
  ['budget clock corruption', f => { f.budget.end.realtime += 1; }],
  ['unreaped group', f => { f.rows[1].processGroupGone = false; }],
  ['uncertified budget', f => { f.budget.deadlineAndBudgetCertified = false; }],
  ['wrong native count', f => { f.budget.nativeAttempted = 89; }],
]) test(`fail closed on ${name}`, () => {
  const f = fixture(); mutate(f); assert.throws(() => verify(f.rows, f.prepared, f.budget));
});
test('overlapping IQRs reject a median-only improvement', () => {
  const f = fixture();
  for (const row of f.rows.filter(r => r.mode === 'candidate')) row.boundaries.factor = row.round % 2 ? 10 : 25;
  assert.equal(verify(f.rows, f.prepared, f.budget).thresholdMet, false);
});
test('a Mesh10k-only gain cannot clear the two-deck gate', () => {
  const f = fixture();
  for (const row of f.rows.filter(r => r.mode === 'candidate' && r.circuit === 'rc-ladder-tran' && r.size === 10000)) row.boundaries.factor = 20;
  assert.equal(verify(f.rows, f.prepared, f.budget).thresholdMet, false);
});
test('published 270 cold cells certify bit-identical outputs and reject the candidate', () => {
  const directory = new URL('./results/solver-growth-991/matrix/', import.meta.url);
  const read = name => JSON.parse(readFileSync(new URL(name, directory)));
  const rows = readFileSync(new URL('receipts.jsonl', directory), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const result = verify(rows, read('prepared.json'), read('budget.json'));
  assert.equal(result.samples, 270);
  assert.equal(result.thresholdMet, false);
  assert.equal(result.outputHashes['rc-ladder-tran-10000'].control, 'cfed768fddaa3d8f6f44396c0b98d1e1101231083774afcf4f993b888a787ede');
  assert.equal(result.outputHashes['resistor-mesh-op-10000'].control, '7fe66c8319033d70158a6b010fa0f98b7d9374c27dbd0a855515f8087f43628f');
});
