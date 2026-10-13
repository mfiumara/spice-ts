import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { alignAndMeasure } from '../comparison-harness.js';
import { loadCorpus, summarize } from './compare.js';
import { translateForXyce } from './xyce.js';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const report = (name: string) => JSON.parse(readFileSync(new URL(`./${name}-report.json`, import.meta.url), 'utf8'));

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
    if (f.series.spiceTs) assert.deepEqual(f.spiceTsVsXyce, alignAndMeasure(f.series.spiceTs, f.series.xyce, signals));
    if (f.series.ngspice) assert.deepEqual(f.ngspiceVsXyce, alignAndMeasure(f.series.ngspice, f.series.xyce, signals));
    // A successful MOS1 run is still an EKV coverage loss.
    assert.ok(Object.values(f.spiceTsVsXyce.signals).some((m: any) => m.absoluteError.max > 1e-5));
  }
});
