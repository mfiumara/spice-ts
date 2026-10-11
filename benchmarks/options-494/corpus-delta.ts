#!/usr/bin/env tsx
/**
 * Summarize the full corpus-f rerun receipt against the committed pre-change snapshot.
 *
 * The rerun is evidence only: it lives in benchmarks/options-494/corpus-f-rerun-outcomes.json
 * and is never copied over benchmarks/corpus/corpus-f/outcomes.json, because it was taken on
 * a loaded host where 13 ngspice reference runs hit their time bound.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import type { CorpusFReport } from '../corpus/corpus-f/outcomes.js';

const beforeRevision = 'bf2e4169d8c903d7e35f5de6886d5aaa127d9cf8';
const path = 'benchmarks/corpus/corpus-f/outcomes.json';
const rerunPath = 'benchmarks/options-494/corpus-f-rerun-outcomes.json';
const before: CorpusFReport = JSON.parse(execFileSync('git', ['show', `${beforeRevision}:${path}`], { encoding: 'utf8' }));
const after: CorpusFReport = JSON.parse(readFileSync(rerunPath, 'utf8'));
if (after.fixtures.length !== before.fixtures.length) throw new Error('Unexpected corpus membership change');
const bucket = before.gapBuckets.find(row => row.issue?.endsWith('/494'));
if (!bucket) throw new Error('Missing baseline options bucket');
const ids = new Set(bucket.ids);
const originalPaths = new Set([
  'examples/cider/mos/charge.cir', 'examples/cider/mos/pass.cir',
  'examples/cider/serial/charge.cir', 'examples/cider/serial/pass.cir',
  'examples/digital/compare/adder_bip.cir', 'examples/digital/compare/adder_mos.cir',
  'examples/Monte_Carlo/rand_numb_test.cir', 'examples/mos/adder_mos.cir',
  'examples/plot/inv-chain-pyplot.cir', 'examples/vdmos/soa_chk.sp',
  'examples/xspice/original-examples/supply_ramping.deck', 'examples/xspice/various/ro_nand_digi.cir',
]);
const rows = before.fixtures.filter(row => ids.has(row.id)).map(old => {
  const current = after.fixtures.find(row => row.id === old.id);
  if (!current || old.sha256 !== current.sha256) throw new Error(`Missing/changed fixture ${old.id}`);
  return { originalIssueFixture: originalPaths.has(old.sourcePath), before: old, after: current };
});
if (rows.filter(row => row.originalIssueFixture).length !== 12) throw new Error('Expected all 12 original issue fixtures');
for (const row of rows) {
  if (/Unsupported \.options field: '(?:noinit|bypass|warn|maxwarns|ramptime|seedinfo)'/i.test(row.after.spiceTs.firstErrorLine ?? '')) {
    throw new Error(`Option rejection remains in ${row.after.id}; regenerate the corpus before summarizing`);
  }
}
const aggregate = JSON.parse(readFileSync('benchmarks/aggregate-report.json', 'utf8')) as {
  fixtures: Array<{ key: string; input: { sha256: string } }>;
};
const affectedHashes = new Set(rows.map(row => row.before.sha256));
const report = {
  beforeRevision,
  beforeKind: 'Committed pre-change snapshot, not a contemporaneous full rerun; unrelated drift and host timeouts are not attributed to this patch.',
  afterPath: rerunPath,
  afterKind: 'Evidence-only rerun receipt on a loaded shared host. It does not replace the committed corpus-f outcomes.json/README.md.',
  command: 'pnpm exec tsx benchmarks/corpus/corpus-f/outcomes.ts --jobs 4 && cp benchmarks/corpus/corpus-f/outcomes.json benchmarks/options-494/corpus-f-rerun-outcomes.json && git checkout -- benchmarks/corpus/corpus-f && pnpm exec tsx benchmarks/options-494/corpus-delta.ts',
  hostReferenceTimeouts: before.fixtures.filter(old => {
    const current = after.fixtures.find(row => row.id === old.id);
    return old.ngspice.status === 'success' && current?.ngspice.status === 'failed';
  }).map(row => row.sourcePath),
  beforeTotals: before.totals, afterTotals: after.totals,
  baselineBucketCount: rows.length, originalIssueCount: originalPaths.size,
  originalIssueSuccessesAfter: rows.filter(row => row.originalIssueFixture && row.after.spiceTs.status === 'success').length,
  originalIssueComparedAfter: rows.filter(row => row.originalIssueFixture && row.after.comparedAnalyses > 0).length,
  aggregateRowsWithIdenticalAffectedInput: aggregate.fixtures.filter(row => affectedHashes.has(row.input.sha256)).map(row => row.key),
  aggregateVerification: 'Blocked before simulation by pre-existing stale fixture-tree provenance pin; tracked by #598. This patch also adds its own probe provenance to SOURCES.md. No aggregate parity claim.',
  otherChangedFixtureIds: before.fixtures.filter(old => {
    const current = after.fixtures.find(row => row.id === old.id);
    return !ids.has(old.id) && JSON.stringify(old) !== JSON.stringify(current);
  }).map(row => row.id),
  rows,
};
writeFileSync('benchmarks/options-494/corpus-delta.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ before: report.beforeTotals, after: report.afterTotals,
  originalIssueSuccessesAfter: report.originalIssueSuccessesAfter, originalIssueComparedAfter: report.originalIssueComparedAfter,
  aggregateRows: report.aggregateRowsWithIdenticalAffectedInput }, null, 2));
