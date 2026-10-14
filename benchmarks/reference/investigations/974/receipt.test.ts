import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

const dir = 'benchmarks/reference/investigations/974';
const report = JSON.parse(readFileSync(`${dir}/report.json`, 'utf8'));
const grid = JSON.parse(readFileSync(`${dir}/grid-report.json`, 'utf8'));
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const get = (key: string, variant: string) => report.cases.find((c: any) => c.key === key && c.variant === variant);

test('saved baseline bytes match both immutable hash sources and native decks', () => {
  const original = JSON.parse(readFileSync('benchmarks/reference/mutual-948/report.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('benchmarks/reference/mutual-948/hash-manifest.json', 'utf8'));
  for (const c of report.cases.filter((c: any) => c.variant === 'baseline')) {
    const p = original.fixtures.find((r: any) => r.key === c.key).projections[0];
    const m = manifest.find((r: any) => r.key === c.key).projections[0];
    assert.equal(sha(readFileSync(p.sharedInputPath)), p.sharedInputSha256);
    assert.equal(c.sharedSha256, m.sharedInputSha256);
    assert.equal(c.savedXyceSha256, m.xyceInputSha256);
    assert.equal(sha(readFileSync(p.xyceInputPath)), p.xyceInputSha256);
    const name = `${c.key.split('/').at(-1)}-baseline`;
    assert.equal(sha(readFileSync(`${dir}/${name}-shared.cir`)), p.sharedInputSha256);
    assert.equal(sha(readFileSync(`${dir}/${name}-xyce.cir`)), p.xyceInputSha256);
  }
  assert.equal(report.cases.filter((c: any) => c.variant === 'baseline').length, 2);
});

test('all diagnostic receipts retain failures and complete per-signal pairwise metrics', () => {
  assert.equal(report.cases.length, 16);
  assert.equal(new Set(report.cases.map((c: any) => c.key + ':' + c.variant)).size, 16);
  for (const c of report.cases) {
    const name = `${c.key.split('/').at(-1)}-${c.variant}`;
    assert.equal(sha(readFileSync(`${dir}/${name}-shared.cir`)), c.sharedSha256);
    for (const [engine, receipt] of Object.entries(c.receipts) as Array<[string, any]>) {
      if (receipt.status !== 'success') {
        assert.equal(engine, 'xyce');
        assert.ok(['gear-0.01', 'sin-no-device-ic-trap'].includes(c.variant));
        assert.equal(receipt.failureKind, 'execution');
        assert.ok(receipt.error);
      } else {
        assert.ok(receipt.points > 0);
        assert.ok(receipt.firstTime <= receipt.lastTime);
      }
    }
    for (const comparison of Object.values(c.comparisons) as any[]) {
      assert.equal(Object.keys(comparison.signals).length, Object.keys(c.receipts.ngspice.signals).length);
      for (const s of Object.values(comparison.signals) as any[]) {
        assert.equal(s.status, 'compared');
        assert.ok(Number.isFinite(s.absoluteError.max));
        assert.ok(Number.isFinite(s.absoluteError.rms));
        assert.equal(s.relativeError.sampleCount + s.relativeError.excludedZeroReferences, s.sampleCount);
      }
    }
  }
});

test('Jimi receipt separates missing waveform from startup capacitor constraints', () => {
  const key = 'ngspice/jimi-fuzz';
  const b = get(key, 'baseline'), sin = get(key, 'sin-spelling'), noic = get(key, 'no-device-ic');
  assert.equal(b.receipts.xyce.signals['v(10)'].max, 0);
  assert.ok(sin.receipts.xyce.signals['v(10)'].max > .29);
  assert.ok(b.receipts.xyce.signals['v(3)'].first.re > 8);
  assert.ok(Math.abs(noic.receipts.xyce.signals['v(3)'].first.re) < 1e-20);
  assert.equal(get(key, 'op').receipts.ngspice.signals['v(3)'].first.re, 0);
  assert.ok(get(key, 'sin-no-device-ic').comparisons.ngspiceVsxyce.signals['v(3)'].absoluteError.max < .1);
});

test('LC uniform-grid and analytic controls retain default-grid phase loss', () => {
  assert.equal(grid.grid.points, 20001);
  assert.deepEqual(grid.results.map((r: any) => r.maxstep), [null, .01, .005]);
  const [baseline, fine, finer] = grid.results;
  assert.ok(baseline.uniformNgspiceVsXyce.signals['v(1)'].absoluteError.max > 8);
  assert.ok(fine.uniformNgspiceVsXyce.signals['v(1)'].absoluteError.max < .001);
  const error = (r: any) => r.receipts.ngspice.analyticNativeGrid.signals['v(1)'].absoluteError.max;
  assert.ok(error(finer) < error(fine) / 3);
  assert.ok(baseline.receipts.ngspice.maxDt > .49);
  assert.ok(baseline.receipts.xyce.maxDt < .05);
});
