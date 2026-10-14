import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { ROOT } from './audit.js';

// Compare the reviewed inventory with a fresh same-raw replay, not new engine runs.
async function main() {
  const baselineSha = '523987e1d1764fc77032c7f1bf4e7da9dab00dbc';
  const before = JSON.parse(execFileSync('git', ['show', `${baselineSha}:${ROOT}/inventory.json`], { maxBuffer: 128 * 1024 * 1024 }).toString());
  const after = JSON.parse(await readFile(`${ROOT}/inventory.json`, 'utf8'));
  assert.equal(after.rows.length, 720);
  assert.deepEqual(after.rows.map((row: { key: string }) => row.key), before.rows.map((row: { key: string }) => row.key));
  const changed = [];
  for (let index = 0; index < after.rows.length; index += 1) {
    const left = before.rows[index];
    const right = after.rows[index];
    assert.equal(right.rawSha256, left.rawSha256, `${right.key}: raw execution changed`);
    assert.deepEqual(right.beforeComparisons, left.beforeComparisons, `${right.key}: historical baseline changed`);
    if (JSON.stringify(left.afterComparisons) === JSON.stringify(right.afterComparisons) && JSON.stringify(left.after) === JSON.stringify(right.after)) continue;
    changed.push({ key: right.key, bucketBefore: left.bucket, bucketAfter: right.bucket, before: left.after, after: right.after });
  }
  const report = {
    baselineSha, entries: after.rows.length, executionReceipts: after.rows.filter((row: { before: unknown }) => row.before !== null).length,
    changed: changed.length,
    regressions: changed.filter(row => row.before?.matched && !row.after?.matched).length,
    improvements: changed.filter(row => !row.before?.matched && row.after?.matched).length,
    countsBefore: before.counts, countsAfter: after.counts, rows: changed,
  };
  await writeFile(`${ROOT}/remediation-delta.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, rows: changed.map(row => row.key) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
