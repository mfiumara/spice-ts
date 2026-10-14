import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const base = new URL('.', import.meta.url).pathname;
const check = join(base, 'check.mjs');
const run = join(base, 'run');
test('committed matrix and archived bundles/raw output verify offline', () => {
  const result = JSON.parse(execFileSync(process.execPath, [check, run], { encoding: 'utf8' }));
  assert.equal(result.verified, true);
  assert.equal(result.samples, 82);
  assert.deepEqual(result, JSON.parse(readFileSync(join(base, 'summary.json'))));
});
for (const mutation of ['missing-row', 'wrong-native-hash']) test('rejects ' + mutation, () => {
  const temp = mkdtempSync(join(base, '.check-'));
  try {
    for (const name of readdirSync(run)) if (name !== 'receipts.jsonl') symlinkSync(join(run, name), join(temp, name));
    const rows = readFileSync(join(run, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    if (mutation === 'missing-row') rows.pop();
    else rows.find(r => r.worker.mode === 'ngspice').worker.output.outputSha256 = '0'.repeat(64);
    writeFileSync(join(temp, 'receipts.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    const result = spawnSync(process.execPath, [check, temp], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AssertionError/);
  } finally { rmSync(temp, { recursive: true }); }
});
