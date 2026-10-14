import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { simulate } from '../../../packages/core/src/simulate.js';

interface Complex { re: number; im: number }
interface Evidence {
  sha256: string;
  operatingPoint: Array<{ quantity: string; ngspice: number; spiceTs: number; absoluteError: number }>;
  ac: Array<{ frequency: number; referenceFrequency: number; signals: Record<string, { ngspice: Complex; spiceTs: Complex }> }>;
  rerun: { outcome: string; worstSignal: string; worstNormalizedError: number; comparedSignals: number };
}
const deck = readFileSync(new URL('./gain-stage6.cir', import.meta.url), 'utf8');
const report: Evidence = JSON.parse(readFileSync(new URL('./report.json', import.meta.url), 'utf8'));

test('retains the exact l-10 bytes and 71-point published mismatch', () => {
  assert.equal(createHash('sha256').update(deck).digest('hex'), '1a8f881f5687036ab790a47ea24e56a8a1afc6dd42c1966eab92a4a36d657b3d');
  assert.equal(report.sha256, '1a8f881f5687036ab790a47ea24e56a8a1afc6dd42c1966eab92a4a36d657b3d');
  assert.equal(report.ac.length, 71);
  assert.equal(report.rerun.outcome, 'mismatch');
  assert.equal(report.rerun.worstSignal, 'ac i(vdd1)');
  assert.equal(report.rerun.comparedSignals, 6);
  assert.equal(report.rerun.worstNormalizedError, 41400);
});

test('OP matches ngspice-47 instead of explaining the zero AC oracle', () => {
  for (const row of report.operatingPoint) {
    const tolerance = row.quantity.startsWith('v(') ? 1e-6
      : row.quantity.startsWith('@m1[c') ? 1e-22 : 1e-11;
    assert.ok(row.absoluteError < tolerance, `${row.quantity}: ${row.absoluteError}`);
  }
  const gm = report.operatingPoint.find(row => row.quantity === '@m1[gm]')!;
  assert.ok(Math.abs(gm.ngspice - 4.143772559628e-5) < 1e-16);
});

test('native AC follows OP gm/Cgs, while the MOS6-less oracle stays exactly zero', async () => {
  const actual = (await simulate(deck)).ac!;
  const output = actual.voltage('3');
  const supply = actual.current('vdd1');
  const gm = 4.143772559628e-5;
  const cgs = 9.208383465839999e-16;
  for (const [index, point] of report.ac.entries()) {
    assert.ok(Math.abs(actual.frequencies[index] - point.frequency) <= point.frequency * 1e-12);
    assert.ok(Math.abs(point.referenceFrequency - point.frequency) <= point.frequency * 1e-12);
    for (const name of ['v(3)', 'i(vdd1)', 'i(vin)']) {
      assert.equal(point.signals[name].ngspice.re, 0);
      assert.equal(point.signals[name].ngspice.im, 0);
    }
    // Independent common-source small-signal equation, not an ngspice AC
    // golden. The drain-body junction adds 1e-12 S (a <1e-7 perturbation).
    const x = 2 * Math.PI * point.frequency * 100_000 * cgs;
    const scale = -0.1 * gm * 25_000 / (1 + x * x);
    const expected = { re: scale, im: -scale * x };
    const native = point.signals['v(3)'].spiceTs;
    assert.ok(Math.hypot(native.re - expected.re, native.im - expected.im) < 2e-8);
    assert.ok(Math.abs(output[index].magnitude - Math.hypot(native.re, native.im)) < 1e-14);
    assert.ok(Math.abs(supply[index].magnitude - output[index].magnitude / 25_000) < 1e-16);
  }
});

test('the metric reports microamps of real disagreement, not roundoff', () => {
  const maxCurrent = Math.max(...report.ac.map(point => {
    const { ngspice, spiceTs } = point.signals['i(vdd1)'];
    return Math.hypot(spiceTs.re - ngspice.re, spiceTs.im - ngspice.im);
  }));
  assert.ok(Math.abs(maxCurrent - 4.143772456033682e-6) < 1e-15);
  assert.ok(maxCurrent > 1e-12);
  assert.ok(Math.abs(maxCurrent / 1e-10 - report.rerun.worstNormalizedError) < 50);
});
