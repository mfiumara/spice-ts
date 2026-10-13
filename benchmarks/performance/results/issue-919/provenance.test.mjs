import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { reconcile, preliminaryProvenance } from './provenance.mjs';

test('immutable preliminary archive exposes both completed out-of-budget warm phases', () => {
  const report = preliminaryProvenance();
  assert.equal(report.archiveSha256, '6cfe8055852f7de65eb46e789631be2f060dafbf477341642455360593363a6b');
  assert.equal(report.processReceipts, 39);
  assert.deepEqual(report.statuses, { ok: 37, timeout: 2 });
  assert.equal(report.discrepancies.length, 2);
  for (const [i, expected] of [60245.006792, 45822.462375].entries()) {
    const row = report.discrepancies[i];
    assert.equal(row.repeat, i);
    assert.deepEqual(row.journalPhases, ['cold']);
    assert.deepEqual(row.archivedPhases, ['cold', 'warm']);
    assert.deepEqual(row.completedAfterJournalSnapshot.map(s => s.phase), ['warm']);
    assert.equal(row.warmIncludedInBudgetStatistics, false);
    assert(Math.abs(row.archivedSimulateMs - expected) < 1e-8);
    assert(row.archivedSimulateMs > row.observedIntervalMs);
    assert(row.archivedSimulateMs > 45000);
  }
  assert.equal(report.actualNodeWallMs, null);
});

test('reconciliation rejects altered/missing journal phases and unreported successful phases', () => {
  const cold = { phase: 'cold', ms: 10 };
  const warm = { phase: 'warm', ms: 20 };
  const row = { status: 'timeout', samples: [cold], wallMs: 15 };
  assert.throws(() => reconcile([row], () => []));
  assert.throws(() => reconcile([row], () => [{ ...cold, ms: 11 }]));
  assert.throws(() => reconcile([{ ...row, status: 'ok' }], () => [cold, warm]));
  assert.equal(reconcile([row], () => [cold, warm]).discrepancies.length, 1);
});

test('combined budget report does not mislabel wrapper intervals as actual Node wall', () => {
  const summary = JSON.parse(readFileSync(new URL('./summary.json', import.meta.url), 'utf8'));
  const budget = summary.budgetProvenance;
  assert.equal(budget.scheduledProcessReceipts, 81);
  assert(Math.abs(budget.observedWrapperDirectChildIntervalTotalMs - 360221.560127) < 1e-8);
  assert.equal(budget.actualCombinedNodeWallMs, null);
  assert.equal(budget.actualCombinedNodeWallBudgetVerified, false);
  assert.deepEqual(summary.preliminaryProvenance, preliminaryProvenance());
});

test('final direct-node journal agrees exactly with every archived phase file', () => {
  const out = new URL('./', import.meta.url);
  const rows = readFileSync(new URL('samples.jsonl', out), 'utf8').trim().split('\n').map(JSON.parse);
  const report = reconcile(rows, name => readFileSync(new URL(name, out), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
  assert.equal(report.processReceipts, 39);
  assert.deepEqual(report.statuses, { ok: 38, timeout: 1 });
  assert.deepEqual(report.discrepancies, []);
});
