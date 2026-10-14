import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { alignAndMeasure } from '../../comparison-harness.js';
import { translateForXyce } from '../xyce.js';

const report = (phase: string) => JSON.parse(gunzipSync(readFileSync(new URL(`${phase}-identical.json.gz`, import.meta.url))).toString());
const hash = (source: string) => createHash('sha256').update(source).digest('hex');
function close(actual: any, expected: any): void {
  if (typeof actual === 'number' && typeof expected === 'number') {
    assert.ok(Math.abs(actual - expected) <= 1e-18 + 1e-12 * Math.max(Math.abs(actual), Math.abs(expected)), `${actual} != ${expected}`);
  } else if (actual && typeof actual === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const key of Object.keys(actual)) close(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

test('four fixture receipts preserve identical engine bytes and the MOS1 baseline', () => {
  const before = report('before'), after = report('after');
  assert.equal(before.fixtures.length, 4);
  assert.equal(after.fixtures.length, 4);
  assert.equal(new Set(after.fixtures.map((f: any) => f.key)).size, 4);
  assert.equal(after.policy.parityClaim, false);
  assert.match(before.coreHead, /^ead0642d/);
  for (let i = 0; i < after.fixtures.length; i++) {
    const b = before.fixtures[i], a = after.fixtures[i];
    assert.equal(a.key, b.key);
    assert.equal(a.reference, 'xyce-7.10');
    assert.equal(a.spiceTsInputSha256, a.xyceInputSha256);
    assert.equal(a.spiceTsInputSha256, b.spiceTsInputSha256);
    assert.equal(a.ngspiceModel, 'ngspice-lacks-model (MOS1 fallback)');
    assert.equal(a.spiceTsModel, 'EKV26 static DC');
    assert.equal(b.spiceTsModel, 'MOS1 fallback');
    const source = readFileSync(new URL(`../../../${a.path}`, import.meta.url), 'utf8');
    assert.equal(a.sourceSha256, hash(source));
    const netlist = /^\s*\.end\s*$/im.test(source) ? source : source.trimEnd() + '\n.end\n';
    const spec = { name: a.key, analysis: i < 2 ? 'dc' : 'tran', signals: Object.keys(a.xyce.series.signals), netlist } as const;
    assert.equal(a.xyceInputSha256, hash(translateForXyce(spec).netlist));
    assert.match(a.xyce.output, /M level 260 \(EKV MOSFET version 2\.6\)/);
    assert.ok(a.spiceTs.warnings.some((w: any) => w.message.includes('static-only')));
  }
});

test('all aggregate and per-sweep metrics recompute from retained engine series', () => {
  const verify = (savedMetric: unknown, current: ReturnType<typeof alignAndMeasure>) => {
    // Historical receipts predate reset-aware sweep pairing metadata.
    // Preserve their losses, but explicitly verify rejected unequal-grid pairings.
    if (current.sweepGroups?.some(group => group.unmatched)) {
      assert.equal(current.sweepAlignment, 'reset-ordinal');
      assert.ok(current.grid.excludedOutOfRange > 0);
    } else close(savedMetric, { grid: current.grid, signals: current.signals });
  };
  for (const phase of ['before', 'after']) for (const f of report(phase).fixtures) {
    const signals = Object.keys(f.xyce.series.signals);
    const native = f.ngspice.analyses[0].series;
    verify(f.spiceTsVsXyce, alignAndMeasure(f.spiceTs.series, f.xyce.series, signals));
    verify(f.spiceTsVsNgspice, alignAndMeasure(f.spiceTs.series, native, signals));
    verify(f.ngspiceVsXyce, alignAndMeasure(native, f.xyce.series, signals));
    const slices = (s: any) => {
      const starts = [0];
      const direction = Math.sign(s.grid[1] - s.grid[0]);
      assert.notEqual(direction, 0);
      for (let i = 1; i < s.grid.length; i++) if (direction * (s.grid[i] - s.grid[i - 1]) < 0) starts.push(i);
      starts.push(s.grid.length);
      return starts.slice(0, -1).map((start, i) => ({ grid: s.grid.slice(start, starts[i + 1]),
        signals: Object.fromEntries(signals.map(key => [key, s.signals[key].slice(start, starts[i + 1])])) }));
    };
    const targets = slices(f.spiceTs.series), references = slices(f.xyce.series);
    assert.equal(f.perSweep.length, f.key.startsWith('test_') ? 6 : 1);
    f.perSweep.forEach((s: any, i: number) => verify(s.spiceTsVsXyce, alignAndMeasure(targets[i], references[i], signals)));
  }
});

test('material absolute improvements retain relative losses and expected ngspice divergence', () => {
  const before = report('before'), after = report('after');
  for (let i = 0; i < 3; i++) {
    const signal = i < 2 ? 'i(vdmon)' : 'v(1)';
    const b = before.fixtures[i].spiceTsVsXyce.signals[signal];
    const a = after.fixtures[i].spiceTsVsXyce.signals[signal];
    assert.ok(a.absoluteError.max < b.absoluteError.max / 100);
  }
  assert.equal(after.fixtures[0].spiceTsVsXyce.signals['i(vdmon)'].relativeError.max, 1);
  assert.ok(after.fixtures[2].spiceTsVsXyce.signals['i(vdd)'].relativeError.max > 0.3);
  assert.ok(after.fixtures[3].spiceTsVsNgspice.signals['v(1)'].absoluteError.max > 2);
});
