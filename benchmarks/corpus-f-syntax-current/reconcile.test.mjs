import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bounded, nextCap, select, validateReceipt, MAIN_SHA, BUCKET } from './reconcile.mjs';

const root = 'benchmarks/corpus/corpus-f/';
const historical = JSON.parse(readFileSync(`${root}outcomes.json`));
const manifest = JSON.parse(readFileSync(`${root}manifest.json`));

test('selects all 59 historical other-syntax fixtures, including all 54 historical reference successes', () => {
  const selected = select(historical, manifest);
  assert.equal(selected.length, 59);
  assert.equal(selected.filter(row => row.historical.ngspice.status === 'success').length, 54);
  assert.deepEqual(selected.map(row => row.id), historical.fixtures.filter(row => row.gapBucket === BUCKET).map(row => row.id));
  assert.equal(new Set(selected.map(row => row.id)).size, 59);
  for (const row of selected) {
    assert.equal(row.licence, 'BSD-3-Clause');
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert.ok(row.sourceUrl.includes(manifest.source.revision));
  }
  assert.match(MAIN_SHA, /^[a-f0-9]{40}$/);
});

test('rejects missing, duplicate, or changed historical fixture identity', () => {
  assert.throws(() => select(historical, { ...manifest, circuits: [] }));
  assert.throws(() => select({ ...historical, fixtures: [...historical.fixtures, historical.fixtures.find(row => row.gapBucket === BUCKET)] }, manifest));
  assert.throws(() => select(historical, { ...manifest, circuits: manifest.circuits.map(row => ({ ...row, sha256: '0'.repeat(64) })) }));
});

const sample = () => ({
  simulatorSha: MAIN_SHA,
  limits: { parseMs: 8000, simulateMs: 12000, totalMs: 600000 },
  fixtures: select(historical, manifest).map(row => ({
    ...row, parse: { status: 'unsupported', firstError: 'unsupported test' },
    simulation: { status: 'not-run', reason: 'parse did not succeed' },
    currentOutcome: 'spice-ts-loss',
    reference: { provenance: 'historical-only', freshStatus: 'not-run' },
    comparedAnalyses: null, comparedSignals: null, worstNormalizedError: null,
  })),
});

test('validates historical-only receipts and rejects invented match/mismatch or computed metrics', () => {
  assert.doesNotThrow(() => validateReceipt(sample(), select(historical, manifest)));
  for (const value of ['matched', 'mismatch']) {
    const receipt = sample();
    receipt.fixtures[0].currentOutcome = value;
    assert.throws(() => validateReceipt(receipt, select(historical, manifest)));
  }
  for (const key of ['comparedAnalyses', 'comparedSignals', 'worstNormalizedError']) {
    const receipt = sample();
    receipt.fixtures[0][key] = 0;
    assert.throws(() => validateReceipt(receipt, select(historical, manifest)));
  }
});

test('rejects omitted/reordered rows, changed SHA, hidden parse errors, and simulated parse failures', () => {
  for (const mutate of [
    r => r.fixtures.pop(),
    r => r.fixtures.reverse(),
    r => { r.simulatorSha = 'main'; },
    r => { r.fixtures[0].parse.firstError = null; },
    r => { r.fixtures[0].simulation.status = 'success'; },
    r => { r.fixtures[0].reference.provenance = 'fresh'; },
  ]) {
    const receipt = sample();
    mutate(receipt);
    assert.throws(() => validateReceipt(receipt, select(historical, manifest)));
  }
});

test('committed receipt accounts for the complete selection with honest null comparisons', () => {
  const receipt = JSON.parse(readFileSync('benchmarks/corpus-f-syntax-current/receipt.json'));
  validateReceipt(receipt, select(historical, manifest));
});

test('kills only its own runaway child and publishes timeout instead of success', () => {
  const result = bounded(process.execPath, ['-e', 'while (true) {}'], 200);
  assert.equal(result.status, 'timeout');
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.childCapMs, 200);
  assert.match(result.firstError, /exceeded 200 ms/);
});

test('records child failure and never promotes missing child output to success', () => {
  for (const args of [['-e', 'process.exit(7)'], ['-e', 'console.log("no result")']]) {
    const result = bounded(process.execPath, args, 1000);
    assert.equal(result.status, 'failed');
    assert.match(result.firstError, /child failed/);
  }
});

test('publishes malformed child transport as a failure, not an omitted fixture', () => {
  for (const output of ['RECEIPT invalid', 'RECEIPT {}']) {
    const result = bounded(process.execPath, ['-e', `console.log(${JSON.stringify(output)})`], 1000);
    assert.equal(result.status, 'failed');
    assert.match(result.firstError, /invalid child receipt/);
  }
});

test('total budget clamps both child phases and never requests unbounded timeout zero', () => {
  assert.equal(nextCap(8000, 0), 8000);
  assert.equal(nextCap(12000, 599500), 500);
  assert.equal(nextCap(8000, 599999.5), 0);
  assert.equal(nextCap(12000, 600000), 0);
  assert.equal(nextCap(8000, 700000), 0);
});

test('summary ranks every fixture exactly once using only historical reference successes', () => {
  const receipt = JSON.parse(readFileSync('benchmarks/corpus-f-syntax-current/receipt.json'));
  const summary = JSON.parse(readFileSync('benchmarks/corpus-f-syntax-current/summary.json'));
  assert.equal(summary.selected, 59);
  assert.deepEqual(summary.ranked.flatMap(row => row.ids).sort(), receipt.fixtures.map(row => row.id).sort());
  for (const row of summary.ranked) {
    const fixtures = receipt.fixtures.filter(fixture => row.ids.includes(fixture.id));
    assert.equal(row.fixtures, fixtures.length);
    assert.equal(row.historicalNgspiceSuccess, fixtures.filter(fixture => fixture.historical.ngspice.status === 'success').length);
  }
  assert.deepEqual(summary.current.parse, { success: 15, unsupported: 44 });
  assert.deepEqual(summary.current.outcomes, { 'spice-ts-loss': 58, 'not-compared': 1 });
  assert.equal(summary.freshReferenceRuns, 0);
  assert.equal(summary.freshMatches, 0);
  assert.equal(summary.freshMismatches, 0);
});
