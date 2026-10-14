import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { alignAndMeasure } from '../comparison-harness.js';
import { loadCorpus, summarize } from './compare.js';
import { translateForXyce } from './xyce.js';
import { canonicalize, projectAnalysis } from './canonical.js';
import { sha256 } from './expanded.js';
import './subset.test.js';
import './investigations/990/receipt.test.js';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const report = (name: string) => JSON.parse(readFileSync(new URL(`./${name}-report.json`, import.meta.url), 'utf8'));

test('canonical transform Vitest cases run in the existing offline CI gate', () => {
  const run = spawnSync('pnpm', ['-C', 'packages/core', 'exec', 'vitest', 'run', '--config', '../../benchmarks/reference/vitest.config.ts'],
    { encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.status, 0, run.error?.message ?? run.stdout + run.stderr);
});

test('canonical evidence retains all 100 rows, exact shared inputs, outputs and losses', () => {
  const saved = JSON.parse(readFileSync('benchmarks/reference/adapter-948/report.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('benchmarks/reference/adapter-948/hash-manifest.json', 'utf8'));
  const originals = loadCorpus();
  assert.equal(saved.fixtures.length, 100);
  assert.equal(manifest.length, 100);
  assert.deepEqual(saved.totals, summarize(saved.fixtures));
  assert.deepEqual(saved.before, report('corpus').totals);
  assert.equal(saved.beforeReportSha256, sha256(readFileSync('benchmarks/reference/corpus-report.json')));
  // Preserve pre-#990 adapter provenance; do not relabel old results as reruns.
  for (const [file, digest] of Object.entries(saved.adapterSourceHashes)) assert.equal(digest, file === 'xyce.ts'
    ? '693517918cf1e5dadf653123e900bbeeb98a4d9a7e7bb23b9e895913166d0023'
    : sha256(readFileSync(`benchmarks/reference/${file}`)));
  assert.deepEqual(saved.fixtures.map((row: any) => row.key), originals.map(row => row.key));
  saved.fixtures.forEach((row: any, i: number) => {
    const plan = canonicalize(originals[i].input.toString('utf8'));
    assert.equal(row.originalSha256, sha256(originals[i].input));
    assert.equal(row.canonicalSha256, sha256(plan.netlist));
    assert.equal(row.canonicalSha256, sha256(readFileSync(row.canonicalPath)));
    assert.equal(manifest[i].canonicalSha256, row.canonicalSha256);
    assert.equal(manifest[i].originalSha256, row.originalSha256);
    assert.deepEqual(row.limitations, plan.limitations);
    assert.deepEqual(row.changes, plan.changes);
    if (row.limitations.length) {
      assert.equal(row.xyce.status, 'unsupported');
      assert.equal(row.canonicalSha256, row.originalSha256, 'Failed lowering must be atomic');
    }
    if (row.comparisons.length) {
      assert.equal(row.eligibility, 'comparable');
      assert.equal(row.ngspice.status, 'success');
      assert.equal(row.xyce.status, 'success');
      assert.equal(row.limitations.length + row.losses.length, 0);
      assert.equal(row.comparisons.length, plan.analyses.length);
    }
    for (const projection of row.projections) {
      const shared = readFileSync(projection.sharedInputPath, 'utf8');
      assert.equal(projection.sharedInputSha256, sha256(shared));
      if (projection.ordinal !== null) {
        assert.equal(shared, projectAnalysis(plan, projection.ordinal));
        if (projection.xyceInputPath) {
          const xyceInput = readFileSync(projection.xyceInputPath, 'utf8');
          assert.equal(projection.xyceInputSha256, sha256(xyceInput));
          assert.equal(xyceInput.replace(/^\.print .*\n/gm, ''), shared, 'Only output directives may differ');
        }
      }
      for (const receipt of [projection.ngspice, projection.xyce]) {
        if (receipt.outputPath) assert.equal(receipt.outputSha256, sha256(readFileSync(receipt.outputPath)));
        if (receipt.failureKind === 'export' || receipt.failureKind === 'parse') assert.equal(receipt.convergence, 'not-run');
      }
    }
  });
});

test('100 unique hash-pinned aggregate fixtures retain every attempted outcome', () => {
  const rows = loadCorpus();
  const saved = report('corpus');
  assert.equal(rows.length, 100);
  assert.equal(saved.fixtures.length, 100);
  assert.deepEqual(saved.totals, summarize(saved.fixtures));
  assert.deepEqual(saved.fixtures.map((f: any) => f.key), rows.map(r => r.key));
  assert.equal(saved.policy.identicalEngineInputBytes, false);
  assert.equal(saved.policy.parityClaim, false);
  saved.fixtures.forEach((f: any, i: number) => {
    assert.equal(f.inputSha256, hash(rows[i].input));
    assert.equal(f.reference, 'xyce-7.10.0');
    assert.ok(['success', 'failed', 'unsupported'].includes(f.xyce.status));
    if (f.comparisons.length) {
      assert.equal(f.ngspice.status, 'success');
      assert.equal(f.xyce.status, 'success');
      const comparison = f.comparisons[0];
      const translated = translateForXyce({ name: f.key, analysis: comparison.analysis,
        signals: comparison.signals, netlist: rows[i].input.toString('utf8') });
      assert.equal(f.translation.sha256, hash(translated.netlist));
      assert.deepEqual(f.translation.changes, translated.changes);
      assert.ok(comparison.metrics.grid.alignedPoints > 0);
      for (const metric of Object.values(comparison.metrics.signals) as any[]) {
        assert.equal(metric.status, 'compared');
        assert.ok(metric.sampleCount > 0);
        assert.ok(Number.isFinite(metric.absoluteError.max));
        assert.ok(Number.isFinite(metric.absoluteError.rms));
      }
    }
  });
});

test('EKV evidence uses published decks and never labels MOS1 fallback as parity', () => {
  const saved = report('ekv');
  const manifest = JSON.parse(readFileSync(new URL('./ekv/manifest.json', import.meta.url), 'utf8'));
  assert.equal(saved.fixtures.length, 3);
  assert.equal(saved.totals.ekvParityValidated, false);
  for (const f of saved.fixtures) {
    const source = readFileSync(new URL(`./ekv/fixtures/${f.key}.cir`, import.meta.url), 'utf8');
    assert.equal(hash(source), manifest.fixtures.find((row: any) => row.name === f.key).sha256);
    assert.equal(f.sourceSha256, hash(source));
    assert.equal(f.reference, 'xyce-7.10.0');
    assert.equal(f.spiceTsModel, 'MOS1 fallback, not EKV');
    assert.equal(f.xyce.status, 'success');
    assert.match(f.xyce.output, /M level 260 \(EKV MOSFET version 2\.6\)/);
    for (const [engine, series] of Object.entries(f.series) as Array<[string, any]>) {
      if (series === null) continue;
      const digest = hash(JSON.stringify(series));
      assert.equal(digest, engine === 'ngspice' ? f.ngspice.analyses[0].seriesSha256 : f[engine].seriesSha256);
    }
    const signals = f.xyce.signals;
    // Archived EKV losses used ordinal interpolation on unequal primary grids.
    // Keep those losses intact, but require the new policy to reject that pairing.
    const historicalMetrics = (metric: ReturnType<typeof alignAndMeasure>) => ({ grid: metric.grid, signals: metric.signals });
    const verify = (target: Parameters<typeof alignAndMeasure>[0], savedMetric: unknown) => {
      const current = alignAndMeasure(target, f.series.xyce, signals);
      if (current.sweepGroups?.some(group => group.unmatched)) {
        assert.equal(current.sweepAlignment, 'reset-ordinal');
        assert.ok(current.grid.excludedOutOfRange > 0);
      } else assert.deepEqual(savedMetric, historicalMetrics(current));
    };
    if (f.series.spiceTs) verify(f.series.spiceTs, f.spiceTsVsXyce);
    if (f.series.ngspice) verify(f.series.ngspice, f.ngspiceVsXyce);
    // A successful MOS1 run is still an EKV coverage loss.
    assert.ok(Object.values(f.spiceTsVsXyce.signals).some((m: any) => m.absoluteError.max > 1e-5));
  }
});
