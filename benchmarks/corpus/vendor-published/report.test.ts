import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluatePoint, summarize, type PublishedCase, type PublishedPoint } from './compare.js';
import type { SampleSeries } from '../../comparison-harness.js';

const directory = dirname(fileURLToPath(import.meta.url));
const cases = (JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as { cases: PublishedCase[] }).cases;
const point: PublishedPoint = {
  signal: 'v(1,2)', coordinate: 1, publishedToken: '3.000E+00', published: 3,
  roundingHalfWidth: 0.0005, digitizationUncertainty: 0, unit: 'V', quantity: 'real',
};
const series: SampleSeries = {
  grid: [0, 2], signals: {
    'v(1)': [{ re: 2, im: 0 }, { re: 8, im: 0 }],
    'v(2)': [{ re: 1, im: 0 }, { re: 3, im: 0 }],
  },
};

test('published manifest contains 20 distinct circuits and 270 observations', () => {
  assert.equal(cases.length, 20);
  assert.equal(new Set(cases.map(c => c.id)).size, 20);
  assert.equal(new Set(cases.map(c => c.netlistSha256)).size, 20);
  assert.equal(cases.reduce((n, c) => n + c.points.length, 0), 270);
  assert.equal(cases.filter(c => c.exclusion).length, 1);
  for (const c of cases) {
    assert.equal(createHash('sha256').update(readFileSync(join(directory, c.netlist))).digest('hex'), c.netlistSha256);
    assert.equal(c.referenceKind, 'published-simulation');
    assert.equal(c.measuredReference, null);
    assert.ok(c.source.url.startsWith('https://www.ibiblio.org/'));
    assert.ok(c.assumptions.length >= 3);
    for (const p of c.points) {
      assert.equal(Number(p.publishedToken), p.published);
      assert.ok(p.roundingHalfWidth > 0);
      assert.equal(p.digitizationUncertainty, 0);
    }
  }
});

test('differential voltage subtracts phasors before reducing quantity', () => {
  const result = evaluatePoint(series, point);
  assert.equal(result.status, 'compared');
  assert.equal(result.actual, 3);
  assert.equal(result.absoluteError, 0);
  const complex: SampleSeries = { grid: [1], signals: {
    'v(1)': [{ re: 3, im: 4 }], 'v(2)': [{ re: 3, im: 0 }],
  } };
  assert.equal(evaluatePoint(complex, { ...point, quantity: 'magnitude' }).actual, 4);
});

test('missing samples and extrapolation are losses, not zero error', () => {
  assert.equal(evaluatePoint(series, { ...point, coordinate: 3 }).status, 'missing');
  assert.equal(evaluatePoint(series, { ...point, signal: 'i(v)' }).status, 'missing');
  assert.equal(evaluatePoint({ grid: [1], signals: { 'v(1,2)': [{ re: NaN, im: 0 }] } }, point).status, 'missing');
});

test('phase errors use shortest angular distance and zero reference has null relative error', () => {
  const phase = evaluatePoint({ grid: [1], signals: { 'v(1)': [{ re: -1, im: -0.00001 }] } },
    { ...point, signal: 'vp(1)', quantity: 'phase', published: 179.999, unit: 'degree' });
  assert.ok(phase.absoluteError! < 0.002);
  const zero = evaluatePoint(series, { ...point, published: 0 });
  assert.equal(zero.relativeError, null);
  assert.equal(zero.withinPublishedRounding, false);
});

test('summaries preserve missing data and use normalized rather than mixed-unit errors', () => {
  const result = summarize([evaluatePoint(series, point), evaluatePoint(series, { ...point, coordinate: 3 })]);
  assert.equal(result.compared, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.outsidePublishedRounding, 0);
  assert.equal(result.maximumRoundingUnits, 0);
});

test('negative zero survives receipt JSON round-trip without a false regression', () => {
  const result = evaluatePoint({ grid: [1], signals: { 'v(1,2)': [{ re: -0, im: 0 }] } },
    { ...point, published: 0 });
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)));
});
