import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { sha256 } from './expanded.js';
import { canonicalize, projectAnalysis } from './canonical.js';
import { loadCandidates, selectSubset, bucketMetrics } from './subset.js';
import { hashSeries } from './subset-runner.js';

test('bounded series hashing matches JSON serialization without dropping samples', () => {
  const series = { grid: Array.from({ length: 10000 }, (_, i) => i / 3), signals: { 'v(quoted"name)': Array.from({ length: 10000 }, (_, i) => ({ re: i / 7, im: -i / 5 })) } };
  assert.equal(hashSeries(series), sha256(JSON.stringify(series)));
  assert.equal(hashSeries({ grid: [], signals: {} }), sha256(JSON.stringify({ grid: [], signals: {} })));
});

test('candidate order starts with all 100 originals and grows through original F..J manifests', () => {
  const rows = loadCandidates();
  assert.equal(rows[0].key, 'ngspice/vbic-fo');
  assert.equal(rows[99].key.startsWith('corpus-e/'), true);
  assert.equal(rows[100].key, 'corpus-f/examples-cider-bjt-astable-cir');
  assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  assert.equal(rows.some(row => row.key.includes('-spice3/')), false);
});

test('selection uses reference eligibility only, retains exclusions and stops accepting at target', () => {
  const rows = [
    { key: 'a', eligibility: 'native-failure', spiceTs: { status: 'success' } },
    { key: 'b', eligibility: 'comparable', spiceTs: { status: 'failed' } },
    { key: 'c', eligibility: 'transformed-with-loss' },
    { key: 'd', eligibility: 'comparable' },
  ];
  assert.deepEqual(selectSubset(rows, 1).map(row => row.key), ['b']);
  assert.deepEqual(selectSubset(rows, 100).map(row => row.key), ['b', 'd']);
});

test('buckets do not call empty or missing comparisons agreement', () => {
  assert.equal(bucketMetrics([]), 'no-aligned-numeric-comparison');
  const metric = (absolute: number, relative: number | null) => ({ grid: { spiceTsPoints: 1, ngspicePoints: 1, alignedPoints: 1, excludedOutOfRange: 0 }, signals: { 'v(1)': { status: 'compared' as const, sampleCount: 1, absoluteError: { max: absolute, rms: absolute }, relativeError: { max: relative, rms: relative, sampleCount: relative === null ? 0 : 1, excludedZeroReferences: relative === null ? 1 : 0 } } } });
  assert.equal(bucketMetrics([metric(1e-12, 1)]), 'absolute-at-most-1e-9');
  assert.equal(bucketMetrics([metric(1, 1e-4)]), 'relative-at-most-1e-3');
  assert.equal(bucketMetrics([metric(1, 1e-2)]), 'relative-above-1e-3');
  assert.equal(bucketMetrics([metric(1, null)]), 'absolute-only-disagreement');
  assert.equal(bucketMetrics([{ grid: { spiceTsPoints: 1, ngspicePoints: 1, alignedPoints: 1, excludedOutOfRange: 0 }, signals: { 'v(1)': { status: 'missing', missingFrom: ['ngspice'] } } }]), 'no-aligned-numeric-comparison');
  const empty = metric(0, null);
  empty.signals['v(1)'].sampleCount = 0;
  assert.equal(bucketMetrics([empty]), 'no-aligned-numeric-comparison');
});

test('published mutual subset retains every outcome, hash, warning and deterministic choice', () => {
  const directory = 'benchmarks/reference/mutual-948';
  const bytes = readFileSync(`${directory}/report.json`);
  const report = JSON.parse(bytes.toString());
  const manifest = JSON.parse(readFileSync(`${directory}/subset-manifest.json`, 'utf8'));
  const candidates = loadCandidates();
  assert.deepEqual(report.fixtures.map((r: any) => r.key), candidates.map(r => r.key));
  assert.equal(manifest.reportSha256, sha256(bytes));
  assert.equal(manifest.count, manifest.fixtures.length);
  assert.deepEqual(manifest.fixtures.map((r: any) => r.key), selectSubset(report.fixtures).map((r: any) => r.key));
  assert.equal(manifest.fixtures.length + manifest.exclusions.length, candidates.length);
  const summary = JSON.parse(readFileSync(`${directory}/summary.json`, 'utf8'));
  assert.equal(summary.attempted, candidates.length);
  assert.equal(summary.finalAccepted, manifest.count);
  assert.equal(Object.values(summary.selectedBuckets).reduce((n: number, count) => n + Number(count), 0), manifest.count);
  assert.equal(Object.values(summary.buckets).reduce((n: number, count) => n + Number(count), 0), candidates.length);
  for (const [file, hash] of Object.entries(report.adapterSourceHashes)) assert.equal(hash, sha256(readFileSync(`benchmarks/reference/${file}`)));
  for (const [corpus, hash] of Object.entries(report.manifestHashes)) assert.equal(hash, sha256(readFileSync(`benchmarks/corpus/${corpus}/manifest.json`)));
  report.fixtures.forEach((row: any, i: number) => {
    const plan = canonicalize(candidates[i].input.toString('utf8'));
    assert.equal(row.originalSha256, sha256(candidates[i].input));
    assert.equal(row.canonicalSha256, sha256(plan.netlist));
    assert.equal(row.canonicalSha256, sha256(readFileSync(row.canonicalPath)));
    assert.deepEqual(row.limitations, plan.limitations);
    if (row.eligibility === 'comparable') {
      assert.equal(row.limitations.length + row.losses.length, 0);
      assert.equal(row.comparisons.length, plan.analyses.length);
      assert.equal(row.ngspice.status, 'success');
      assert.equal(row.xyce.status, 'success');
    }
    for (const p of row.projections) {
      const shared = readFileSync(p.sharedInputPath, 'utf8');
      assert.equal(p.sharedInputSha256, sha256(shared));
      if (p.ordinal !== null) assert.equal(shared, projectAnalysis(plan, p.ordinal));
      if (p.xyceInputPath) {
        const xy = readFileSync(p.xyceInputPath, 'utf8');
        assert.equal(p.xyceInputSha256, sha256(xy));
        assert.equal(xy.replace(/^\.print .*\n/gm, ''), shared);
      }
      for (const receipt of [p.ngspice, p.xyce]) {
        if (receipt.outputPath) assert.equal(receipt.outputSha256, sha256(readFileSync(receipt.outputPath)));
        if (receipt.failureKind === 'export' || receipt.failureKind === 'parse') assert.equal(receipt.convergence, 'not-run');
      }
    }
  });
  const before = JSON.parse(readFileSync('benchmarks/reference/adapter-948/report.json', 'utf8'));
  const interrupted = JSON.parse(gunzipSync(readFileSync('benchmarks/reference/interrupted-632-report.json.gz')).toString());
  assert.equal(interrupted.fixtures.length, 632);
  assert.deepEqual(report.fixtures.slice(0, 632), interrupted.fixtures, 'Resume preserves every saved numeric outcome');
  assert.equal(report.executionSegments.length, 2);
  assert.deepEqual(report.executionSegments.map((s: any) => [s.startOrdinal, s.endOrdinal]), [[0, 632], [632, candidates.length]]);
  assert.deepEqual(report.executionSegments[0].adapterSourceHashes, interrupted.adapterSourceHashes);
  assert.deepEqual(report.executionSegments[1].adapterSourceHashes, report.adapterSourceHashes);
  for (const segment of report.executionSegments) for (const file of ['canonical.ts', 'xyce.ts', 'expanded.ts', 'compare.ts']) assert.equal(segment.adapterSourceHashes[file], report.adapterSourceHashes[file]);
  assert.deepEqual(report.fixtures.slice(0, 100).map((r: any) => [r.key, r.eligibility, r.ngspice.status, r.xyce.status]), before.fixtures.map((r: any) => [r.key, r.eligibility, r.ngspice.status, r.xyce.status]));
});
