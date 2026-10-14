import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareExecutions } from './aggregate-report.js';
import { buildClassicReport, type EngineAnalysis, type EngineExecution, type ClassicCircuit } from './corpus/classic/report.js';
import { createHash } from 'node:crypto';
import { compareInBatches, packExecution } from './corpus/corpus-f/packed.js';
import { normalizedSignalErrors, pairedReferenceSeries } from './corpus/corpus-f/lib.js';
import { declaredSecondaryGrid } from './sweep-coordinates.js';
const plot = (id: string, grid: number[], values: number[]): EngineAnalysis => ({ type: 'dc', plotName: id, series: { grid, signals: { 'v(out)': values.map(re => ({ re, im: 0 })) } } });
const execution = (...analyses: EngineAnalysis[]): EngineExecution => ({ status: 'success', convergence: 'converged', analyses });
test('repeated descriptive plots pair by occurrence without reference reuse', () => {
  const a = plot('DC transfer characteristic', [0, 1], [0, 1]);
  const b = plot('DC transfer characteristic', [0, 1], [0, 9]);
  const result = compareExecutions(execution(a, b), execution(a, b));
  assert.equal(result.length, 2);
  assert.equal(result[1].metrics.signals['v(out)'].status, 'compared');
  const metric = result[1].metrics.signals['v(out)'];
  assert.equal(metric.status, 'compared');
  if (metric.status === 'compared') assert.equal(metric.absoluteError.max, 0);
});
test('unmatched reference plots are explicit', () => {
  const a = plot('dc1', [0, 1], [0, 1]);
  const result = compareExecutions(execution(a), execution(a, plot('dc2', [0, 1], [0, 9])));
  assert.equal(result.length, 2);
  assert.equal(result[1].unmatched, 'spice-ts');
});
test('nested sweep resets align all points within separate outer groups', () => {
  const a = plot('dc1', [0, 1, 2, 0, 1, 2], [0, 1, 2, 10, 11, 12]);
  const result = compareExecutions(execution(a), execution(a));
  assert.equal(result[0].metrics.grid.alignedPoints, 6);
  const metric = result[0].metrics.signals['v(out)'];
  assert.equal(metric.status, 'compared');
  if (metric.status === 'compared') assert.equal(metric.absoluteError.max, 0);
});
test('descending nested primary sweep aligns all points', () => {
  const a = plot('dc1', [2, 1, 0, 2, 1, 0], [2, 1, 0, 12, 11, 10]);
  assert.equal(compareExecutions(execution(a), execution(a))[0].metrics.grid.alignedPoints, 6);
});
test('packed batching preserves repeated plot pairing', () => {
  const a = plot('DC transfer characteristic', [0, 1], [0, 1]);
  const b = plot('DC transfer characteristic', [0, 1], [0, 9]);
  assert.deepEqual(compareInBatches(packExecution(execution(a, b)), packExecution(execution(a, b)), 1), compareExecutions(execution(a, b), execution(a, b)));
});

test('secondary coordinates pair reordered groups rather than their ordinals', () => {
  const own = plot('dc1', [0, 1, 0, 1], [0, 1, 10, 11]);
  own.series.secondaryGrid = [0, 0, 10, 10];
  const reference = plot('dc1', [0, 1, 0, 1], [10, 11, 0, 1]);
  reference.series.secondaryGrid = [10, 10, 0, 0];
  const metric = compareExecutions(execution(own), execution(reference))[0].metrics;
  assert.equal(metric.grid.alignedPoints, 4);
  const signal = metric.signals['v(out)'];
  assert.equal(signal.status, 'compared');
  if (signal.status === 'compared') assert.equal(signal.absoluteError.max, 0);
  assert.deepEqual(metric.sweepGroups?.map(group => group.secondaryValue), [0, 10]);
  assert.deepEqual(compareInBatches(packExecution(execution(own)), packExecution(execution(reference)), 1), compareExecutions(execution(own), execution(reference)));
});

test('unmatched secondary groups cannot masquerade as a match', () => {
  const own = plot('dc1', [0, 1], [0, 1]);
  own.series.secondaryGrid = [0, 0];
  const reference = plot('dc1', [0, 1, 0, 1], [0, 1, 10, 11]);
  reference.series.secondaryGrid = [0, 0, 10, 10];
  const comparisons = compareExecutions(execution(own), execution(reference));
  assert.equal(comparisons[0].metrics.grid.alignedPoints, 2);
  assert.equal(normalizedSignalErrors(comparisons, pairedReferenceSeries(execution(own), execution(reference))).missing, 1);
});

test('nested sweep retains reset identity across the 25k chunk boundary', () => {
  const grid = Array.from({ length: 30000 }, (_, index) => index % 15000);
  const own = plot('dc1', grid, grid.map((value, index) => value + (index >= 15000 ? 100000 : 0)));
  const metrics = compareExecutions(execution(own), execution(own))[0].metrics;
  assert.equal(metrics.grid.alignedPoints, 30000);
  assert.equal(metrics.grid.excludedOutOfRange, 0);
});

test('straight-line literal DC metadata refuses dynamic scripts', () => {
  const text = 'title\n.control\ndc V1 0 1 1 TEMP -40 0 40\n.endc';
  assert.deepEqual(declaredSecondaryGrid(text, 'dc1', [0, 1, 0, 1]), [-40, -40, 0, 0]);
  assert.equal(declaredSecondaryGrid('title\n.control\nrepeat 2\ndc V1 0 1 1 TEMP -40 0 40\nend\n.endc', 'dc1', [0, 1, 0, 1]), undefined);
});

test('normalization reads each paired reference peak, not the first plot peak', () => {
  const a = plot('DC transfer characteristic', [0, 1], [1, 2]);
  const b = plot('DC transfer characteristic', [0, 1], [10, 20]);
  const own = execution(a, plot('DC transfer characteristic', [0, 1], [10, 21]));
  const reference = execution(a, b);
  const errors = normalizedSignalErrors(compareExecutions(own, reference), pairedReferenceSeries(own, reference));
  assert.equal(errors.errors[1].ngspicePeak, 20);
  assert.equal(errors.errors[1].normalized, 0.05);
});

test('classic report uses the same one-to-one pairing rather than reusing its first plot', async () => {
  const bytes = Buffer.from('authored adapter input');
  const circuit = { id: 'authored', localPath: 'authored', analyses: ['dc'], sha256: createHash('sha256').update(bytes).digest('hex'), category: 'passive', sourcePath: 'authored', sourceUrl: '', ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' } } as ClassicCircuit;
  const a = plot('DC transfer characteristic', [0, 1], [0, 1]);
  const b = plot('DC transfer characteristic', [0, 1], [0, 9]);
  const report = await buildClassicReport({ schemaVersion: 1, source: { name: 'authored', revision: 'authored', license: 'MIT' }, circuits: [circuit] }, {
    readFixture: async () => bytes, runNgspice: async () => execution(a, b), runSpiceTs: async () => execution(a, b), tools: { ngspice: 'synthetic', spiceTs: 'synthetic' },
  });
  const signal = report.fixtures[0].comparisons[1].metrics.signals['v(out)'];
  assert.equal(signal.status, 'compared');
  if (signal.status === 'compared') assert.equal(signal.absoluteError.max, 0);
});
