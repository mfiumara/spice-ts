import { readFile, writeFile } from 'node:fs/promises';
import { ROOT, bucket, metricDigest } from './audit.js';

async function main() {
  const report = JSON.parse(await readFile(`${ROOT}/inventory.json`, 'utf8'));
  // Rebuild digests/classification from the saved, measured comparison metrics,
  // including the retained linear metric. This never runs or guesses an engine.
  for (const row of report.rows) if (row.before && row.after) {
    row.before.metricSha256 = metricDigest(row.beforeComparisons);
    row.after.metricSha256 = metricDigest(row.afterComparisons);
    row.bucket = bucket(row.before, row.after);
  }
  const counts = (rows: typeof report.rows) => rows.reduce((acc: Record<string, number>, row: typeof report.rows[number]) => { acc[row.bucket] = (acc[row.bucket] ?? 0) + 1; return acc; }, {});
  const changed = report.rows.filter((row: typeof report.rows[number]) => row.bucket.startsWith('changed-'));
  report.counts = counts(report.rows);
  await writeFile(`${ROOT}/inventory.json`, JSON.stringify(report, null, 2) + '\n');
  const unavailable = report.rows.filter((row: typeof report.rows[number]) => row.before === null);
  const table = ['| Fixture | Bucket / numeric direction | Paired plots before → after | Unmatched plots | Aligned points | Excluded points | Worst normalized mismatch | Unmatched groups |', '|---|---|---:|---:|---:|---:|---:|---:|'];
  for (const row of changed) {
    const pair = (field: string) => `${row.before[field]} → ${row.after[field]}`;
    table.push(`| ${row.key} | ${row.bucket} / ${row.direction} | ${pair('plotsPaired')} | ${pair('plotsUnmatched')} | ${pair('alignedPoints')} | ${pair('excludedPoints')} | ${pair('normalizedMismatch')} | ${pair('groupsUnmatched')} |`);
  }
  const text = [
    '# #970 exhaustive adapter delta audit', '',
    `Merge-base adapter: \`${report.baseSha}\`. Implementation head: \`${report.implementationHead}\`.`,
    `All 700 original manifest entries, plus 20 subsequently landed corpus-k entries, are inventoried (${report.rows.length} total). Original bucket counts: \`${JSON.stringify(counts(report.rows.filter((r: typeof report.rows[number]) => r.corpus !== 'corpus-k')))}\`. K counts: \`${JSON.stringify(counts(report.rows.filter((r: typeof report.rows[number]) => r.corpus === 'corpus-k')))}\`. Total counts: \`${JSON.stringify(report.counts)}\`.`, '',
    'The 700-entry denominator includes original A..J (661) and D/E/Xyce translated-manifest entries (39), including unsupported translations with no runnable deck. Actual control blocks: 247. The requested 248 substring census also counted classic/resistor-noise’s commented `*.control`; that row is still executed and inventoried.', '',
    '## Method and limitations', '',
    `Node ${report.node}; ngspice-47; spice-ts core tree \`${report.core}\`. Every new measurement supplies identical original bytes to both engines. Both adapters share a memoized simulate() Promise: a single live spice-ts execution is mapped by the exact merge-base adapter and the implementation adapter. Reference execution is captured once; the before control exporter admits only the first plot of each declared type, as the merge-base exporter did. Raw mapped executions are compressed in the ignored raw/ cache and replayable. The parent’s committed j14-raw.json.gz is reused at its published historical core tree; it reproduces the acceptance numbers exactly. No deck, threshold, tolerance, simulator, source catalogue, or aggregate artifact changes.`, '',
    'Comparison includes every signal metric, not merely the worst metric. Identity labels alone do not count as numeric changes. “changed-improved” / “changed-regressed” mean crossing the unchanged 0.01 match threshold or loss/gain of complete matching coverage. Metric changes without a match-state transition are “changed-neutral”; lower-error/higher-error/same-error direction is separately shown even for neutral rows. Thus neutral is not a claim that higher errors are harmless. Unsupported engines, absent translated decks and no scored numeric overlap are not-comparable, with explicit reasons in inventory.json. They are not inferred unchanged. The corpus-f sp/sens plot extensions are mapped by both historical and current adapters. When neither adapter produces a successful execution, a native reference cannot make the row scorable and may be explicitly not-run (never represented as a real failed native run).', '',
    'Unknown secondary coordinates use reset-ordinal pairing, equal group counts and exactly equal primary samples per group in acquisition order. Unequal grids or counts report unmatched groups, prevent a match, and never interpolate across resets. This conservative policy retains floating-grid/coverage losses rather than widening any tolerance. Each comparison using this fallback has the ordinal-aligned fixture tag (including rejected groups). Explicit secondary coordinates still permit within-group interpolation.', '',
    `Initial capture used uniform 180 s / 4 GiB bounds. Three large missing receipts were retried using packed columns, streamed reference input, and uniform 600 s / 12 GiB bounds. Packed wrapper equivalence is tested against the original wrapper. ${unavailable.length} rows have no comparison execution receipt; they are listed below, never called unchanged. Absent translated decks remain explicit exclusions. Any unresolved execution-bound failure keeps the acceptance gate open.`, '',
    '## Every changed fixture', '', ...table, '',
    '## Entries without execution receipts', '', ...unavailable.map((row: typeof report.rows[number]) => `- ${row.key}: ${row.reason}`), '',
    '## Reproduce', '',
    '```sh', 'pnpm install --frozen-lockfile', 'pnpm build', 'python3 benchmarks/plot-identity-970/prepare.py', 'AUDIT_PACKED=1 AUDIT_CHILD_MS=600000 AUDIT_HEAP_MB=12288 AUDIT_CORE_SHA=$(git rev-parse HEAD:packages/core) spice-heavy pnpm exec tsx benchmarks/plot-identity-970/audit.ts', 'AUDIT_CHILD_MS=600000 AUDIT_HEAP_MB=12288 AUDIT_CORE_SHA=$(git rev-parse HEAD:packages/core) spice-heavy pnpm exec tsx benchmarks/plot-identity-970/audit.ts --replay', 'pnpm exec tsx benchmarks/plot-identity-970/render.ts', 'pnpm exec tsx --test benchmarks/plot-alignment.test.ts benchmarks/plot-identity-970/audit.test.ts', 'AUDIT_NATIVE_TEST=1 spice-heavy pnpm exec tsx --test benchmarks/plot-identity-970/packed-control.test.ts', '```', '',
    'Resume reuses completed rows and raw cache; to rerun a particular manifest ordinal in an owned child use `spice-heavy pnpm exec tsx benchmarks/plot-identity-970/audit.ts --child N` (the committed catalogue order determines N). Raw cache is deliberately not a hundreds-of-MB git payload. inventory.json retains full per-signal before/after comparison metrics and execution-receipt hashes, so the published comparisons can be checked without the cache. The lightweight tests assert all manifest entries and bucket totals and the exact j-14 receipt.', '',
  ].join('\n');
  await writeFile(`${ROOT}/README.md`, text);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
