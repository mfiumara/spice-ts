// Offline reconciliation only: no simulations, extraction writes or archive edits.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const jsonl = text => text.trim().split('\n').filter(Boolean).map(JSON.parse);
export function reconcile(rows, readPhases) {
  const report = { processReceipts: rows.length, statuses: {}, observedIntervalTotalMs: 0, discrepancies: [] };
  for (const row of rows) {
    assert(['ok', 'timeout'].includes(row.status));
    assert(Number.isFinite(row.wallMs) && row.wallMs >= 0);
    report.statuses[row.status] = (report.statuses[row.status] ?? 0) + 1;
    report.observedIntervalTotalMs += row.wallMs;
    const key = `${row.mode}-${row.circuit}-${row.size}${row.repeat === undefined ? '' : `-r${row.repeat}`}`;
    const name = row.mode === 'simulate' ? `logs/${key}.jsonl` : row.mode === 'capture' ? `profiles/${key}.jsonl` : `profiles/capture-${row.circuit}-${row.size}-r${row.repeat}.jsonl`;
    const archived = readPhases(name);
    assert.equal(new Set(archived.map(s => s.phase)).size, archived.length);
    // The journal is a snapshot, never a license to discard later archived phases.
    assert.deepEqual(archived.slice(0, row.samples.length), row.samples);
    const extra = archived.slice(row.samples.length);
    if (row.status === 'ok') assert.deepEqual(extra, []);
    if (extra.length) {
      const archivedSimulateMs = archived.reduce((sum, s) => {
        assert(Number.isFinite(s.ms) && s.ms >= 0);
        return sum + s.ms;
      }, 0);
      report.discrepancies.push({ key, repeat: row.repeat, status: row.status, phaseFile: name, journalPhases: row.samples.map(s => s.phase), archivedPhases: archived.map(s => s.phase), completedAfterJournalSnapshot: extra.map(({ phase, ms, probeSha256 }) => ({ phase, ms, probeSha256 })), observedIntervalMs: row.wallMs, archivedSimulateMs, exceedsObservedInterval: archivedSimulateMs > row.wallMs, exceedsDeclaredNodeCap: archivedSimulateMs > 45000, warmIncludedInBudgetStatistics: false });
    }
  }
  return report;
}

export function preliminaryProvenance() {
  const archive = fileURLToPath(new URL('./preliminary-39.tar.gz', import.meta.url));
  const read = name => execFileSync('tar', ['-xOf', archive, name], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const report = reconcile(jsonl(read('samples.jsonl')), name => jsonl(read(name)));
  assert.equal(report.processReceipts, 39);
  return { archiveSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), ...report, actualNodeWallMs: null, actualNodeCapEnforced: false, survivorTails: 'unknown; completed archived simulate intervals are lower bounds, not Node wall measurements', sharedLoad: 'surviving Node children may have overlapped subsequent scheduled work' };
}
