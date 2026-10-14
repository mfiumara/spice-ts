import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { compareExecutions } from '../aggregate-report.js';
import { monotonicSegments } from '../comparison-harness.js';
import { summarize, type Raw } from '../plot-identity-970/audit.js';
import { declaredSecondaryGrid } from '../sweep-coordinates.js';

const indices = [0, 317, 320, 414, 419, 552, 554, 642];
const root = 'benchmarks/literal-dc-1008';
async function main() {
const inventory = JSON.parse(await readFile('benchmarks/plot-identity-970/inventory.json', 'utf8'));
const rows = [];
for (const index of indices) {
  const entry = inventory.rows[index];
  const bytes = await readFile(`${root}/raw/${index}.v8.gz`);
  const raw: Raw = deserialize(gunzipSync(bytes));
  assert.ok(!raw.packed, 'these eight saved receipts use object encoding');
  const input = await readFile(entry.localPath);
  const inputSha256 = createHash('sha256').update(input).digest('hex');
  assert.equal(inputSha256, entry.inputSha256);
  const own = raw.afterEngine;
  const reference = raw.afterReference;
  const afterReference = { ...reference, analyses: reference.analyses.map(plot => {
    const secondaryGrid = plot.type === 'dc' ? declaredSecondaryGrid(input.toString('utf8'), plot.plotId ?? plot.plotName, plot.series.grid) : undefined;
    return { ...plot, series: { ...plot.series, ...(secondaryGrid ? { secondaryGrid } : {}) } };
  }) };
  const beforeComparisons = compareExecutions(own, reference);
  const afterComparisons = compareExecutions(own, afterReference);
  const hypothesis = beforeComparisons.filter(c => c.analysis === 'dc').map(c => {
    assert.equal(own.analyses.filter(p => p.type === 'dc').length, 1);
    assert.equal(reference.analyses.filter(p => p.type === 'dc').length, 1);
    const left = own.analyses.find(p => p.type === 'dc');
    const right = reference.analyses.find(p => p.type === 'dc');
    assert.ok(left && right);
    return {
      ownSecondaryPresent: !!left.series.secondaryGrid,
      referenceSecondaryPresent: !!right.series.secondaryGrid,
      primarySamplesExactlyEqual: left.series.grid.length === right.series.grid.length && left.series.grid.every((value, i) => value === right.series.grid[i]),
      ownResets: monotonicSegments(left.series.grid).length,
      referenceResets: monotonicSegments(right.series.grid).length,
      alignment: c.metrics.sweepAlignment,
    };
  });
  rows.push({ key: entry.key, index, localPath: entry.localPath, inputSha256, rawSha256: createHash('sha256').update(bytes).digest('hex'), hypothesis,
    declaration: input.toString('utf8').split(/\r?\n/).filter(line => /^\s*\.?dc\s/i.test(line)),
    dynamicCommands: input.toString('utf8').split(/\r?\n/).filter(line => /^\s*(?:run|reset|source|foreach|while|repeat|dowhile|if|goto)\b/i.test(line)),
    before: summarize(beforeComparisons, own, reference), after: summarize(afterComparisons, own, afterReference), afterComparisons });
}
assert.equal(rows.length, 8);
assert.equal(new Set(rows.map(row => row.key)).size, 8);
const report = { policy: 'Same saved engine/reference samples on both sides; only reference secondary metadata changes. Strict reset-ordinal policy, normalization and tolerances unchanged. No live simulations.', baseline: 'e119f478428f15e34d5cd3d447607395a56ca6f8 (#993 merged)', node: process.version, rows };
if (process.argv.includes('--check')) {
  const saved = JSON.parse(await readFile(`${root}/results.json`, 'utf8'));
  assert.deepEqual(rows, saved.rows);
} else await writeFile(`${root}/results.json`, JSON.stringify(report, null, 2) + '\n');
console.table(rows.map(row => ({ fixture: row.key, beforePoints: row.before.alignedPoints, afterPoints: row.after.alignedPoints, beforeMismatch: row.before.normalizedMismatch, afterMismatch: row.after.normalizedMismatch, beforeUnmatched: row.before.groupsUnmatched, afterUnmatched: row.after.groupsUnmatched, matched: row.after.matched })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
