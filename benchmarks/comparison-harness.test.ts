import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  INITIAL_STATE_FIXTURES,
  alignAndMeasure,
  compareFixture,
  parseNgspiceRaw,
  runNgspice,
  serializeReport,
  type ComparisonFixture,
  type EngineRun,
} from './comparison-harness.js';

const real = (values: number[]) => values.map(re => ({ re, im: 0 }));
const hasNgspice = spawnSync('ngspice', ['--version'], { encoding: 'utf8' }).status === 0;

function successfulRun(grid: number[], signals: Record<string, number[]>): EngineRun {
  return {
    status: 'success',
    convergence: 'converged',
    runtimeMs: 1,
    command: ['test-runner'],
    series: {
      grid,
      signals: Object.fromEntries(Object.entries(signals).map(([name, values]) => [name, real(values)])),
    },
  };
}

describe('comparison metrics', () => {
  it('aligns mismatched grids by interpolating the ngspice reference onto spice-ts points', () => {
    const result = alignAndMeasure(
      { grid: [0, 0.5, 1], signals: { 'v(out)': real([0, 1, 2]) } },
      { grid: [0, 1], signals: { 'v(out)': real([0, 2]) } },
      ['v(out)'],
    );

    assert.equal(result.grid.spiceTsPoints, 3);
    assert.equal(result.grid.ngspicePoints, 2);
    assert.equal(result.grid.alignedPoints, 3);
    const signal = result.signals['v(out)'];
    assert.equal(signal?.status, 'compared');
    if (!signal || signal.status !== 'compared') throw new Error('expected compared signal');
    assert.deepEqual(signal.absoluteError, { max: 0, rms: 0 });
  });

  it('reports zero-reference relative error as unavailable instead of Infinity', () => {
    const result = alignAndMeasure(
      { grid: [0, 1], signals: { 'v(out)': real([1, 2]) } },
      { grid: [0, 1], signals: { 'v(out)': real([0, 0]) } },
      ['v(out)'],
    );

    const signal = result.signals['v(out)'];
    assert.equal(signal?.status, 'compared');
    if (!signal || signal.status !== 'compared') throw new Error('expected compared signal');
    assert.deepEqual(signal.relativeError, {
      max: null,
      rms: null,
      sampleCount: 0,
      excludedZeroReferences: 2,
    });
  });

  it('preserves missing signals in the report', () => {
    const result = alignAndMeasure(
      { grid: [0], signals: {} },
      { grid: [0], signals: { 'v(out)': real([1]) } },
      ['v(out)'],
    );

    assert.deepEqual(result.signals['v(out)'], {
      status: 'missing',
      missingFrom: ['spice-ts'],
    });
  });

  it('compares a legal descending DC sweep when both engines succeed', async () => {
    const fixture: ComparisonFixture = {
      name: 'descending-dc',
      analysis: 'dc',
      netlist: '* descending DC sweep\nV1 in 0 0\nR1 in 0 1k\n.dc V1 5 0 -1\n.end',
      signals: ['v(in)'],
    };

    const result = await compareFixture(fixture, {
      runSpiceTs: async () => successfulRun([5, 4, 3, 2, 1, 0], { 'v(in)': [5, 4, 3, 2, 1, 0] }),
      runNgspice: async () => successfulRun([5, 3, 1, 0], { 'v(in)': [5, 3, 1, 0] }),
    });

    assert.equal(result.spiceTs.status, 'success');
    assert.equal(result.ngspice.status, 'success');
    assert.equal(result.status, 'compared');
    assert.deepEqual(result.metrics?.grid, {
      spiceTsPoints: 6,
      ngspicePoints: 4,
      alignedPoints: 6,
      excludedOutOfRange: 0,
    });
    const signal = result.metrics?.signals['v(in)'];
    assert.equal(signal?.status, 'compared');
    if (!signal || signal.status !== 'compared') throw new Error('expected compared signal');
    assert.deepEqual(signal.absoluteError, { max: 0, rms: 0 });
  });
});

describe('runner failure handling', () => {
  it('preserves failed engine runs without dropping the fixture', async () => {
    const fixture: ComparisonFixture = {
      name: 'failed-op',
      analysis: 'op',
      netlist: '* invalid\n.end',
      signals: ['v(out)'],
    };
    const failed: EngineRun = {
      status: 'failed',
      convergence: 'failed',
      runtimeMs: 2,
      command: ['ngspice', '-b'],
      error: 'convergence failed',
    };

    const result = await compareFixture(fixture, {
      runSpiceTs: async () => successfulRun([0], { 'v(out)': [1] }),
      runNgspice: async () => failed,
    });

    assert.equal(result.status, 'failed');
    assert.deepEqual(result.ngspice, failed);
    assert.equal(result.metrics, null);
  });

  it('turns a thrown runner error into a preserved failed run', async () => {
    const fixture: ComparisonFixture = {
      name: 'thrown-op',
      analysis: 'op',
      netlist: '* invalid\n.end',
      signals: ['v(out)'],
    };

    const result = await compareFixture(fixture, {
      runSpiceTs: async () => successfulRun([0], { 'v(out)': [1] }),
      runNgspice: async () => { throw new Error('raw parse failed'); },
    });

    assert.equal(result.status, 'failed');
    const ngspice = result.ngspice;
    if (ngspice.status === 'success') throw new Error('expected failed ngspice run');
    assert.equal(ngspice.status, 'failed');
    assert.equal(ngspice.convergence, 'failed');
    assert.equal(ngspice.error, 'raw parse failed');
  });
});

describe('ngspice raw parser', () => {
  it('parses real and complex plots without losing plot boundaries', () => {
    const raw = [
      'Title: fixture',
      'Plotname: Operating Point',
      'Flags: real',
      'No. Variables: 1',
      'No. Points: 1',
      'Variables:',
      '\t0\tv(out)\tvoltage',
      'Values:',
      '0\t\t2.000000e+00',
      'Title: fixture',
      'Plotname: AC Analysis',
      'Flags: complex',
      'No. Variables: 2',
      'No. Points: 1',
      'Variables:',
      '\t0\tfrequency\tfrequency',
      '\t1\tv(out)\tvoltage',
      'Values:',
      '0\t\t1.000000e+03,0.000000e+00',
      '\t5.000000e-01,-2.500000e-01',
    ].join('\n');

    const plots = parseNgspiceRaw(raw);
    assert.equal(plots.length, 2);
    assert.deepEqual(plots[0]?.signals['v(out)'], [{ re: 2, im: 0 }]);
    assert.deepEqual(plots[1]?.grid, [1000]);
    assert.deepEqual(plots[1]?.signals['v(out)'], [{ re: 0.5, im: -0.25 }]);
  });
});

describe('stable JSON schema', () => {
  it('serializes the v2 schema in a stable key order', () => {
    const json = serializeReport({
      schemaVersion: 'spice-ts-ngspice-comparison/v2',
      generatedAt: '2026-10-09T00:00:00.000Z',
      environment: { platform: 'linux', arch: 'x64', node: 'v22', cpu: 'test' },
      tools: {
        spiceTs: { version: '0.3.0', command: ['pnpm', 'bench:compare:v2'] },
        ngspice: { version: 'ngspice-47', command: ['ngspice', '-b', '-r', '<raw>', '<netlist>'] },
      },
      alignment: {
        targetGrid: 'spice-ts',
        interpolation: 'linear',
        relativeZeroThreshold: 1e-15,
      },
      fixtures: [],
    });

    assert.equal(
      json,
      '{\n  "schemaVersion": "spice-ts-ngspice-comparison/v2",\n  "generatedAt": "2026-10-09T00:00:00.000Z",\n  "environment": {\n    "platform": "linux",\n    "arch": "x64",\n    "node": "v22",\n    "cpu": "test"\n  },\n  "tools": {\n    "spiceTs": {\n      "version": "0.3.0",\n      "command": [\n        "pnpm",\n        "bench:compare:v2"\n      ]\n    },\n    "ngspice": {\n      "version": "ngspice-47",\n      "command": [\n        "ngspice",\n        "-b",\n        "-r",\n        "<raw>",\n        "<netlist>"\n      ]\n    }\n  },\n  "alignment": {\n    "targetGrid": "spice-ts",\n    "interpolation": "linear",\n    "relativeZeroThreshold": 1e-15\n  },\n  "fixtures": []\n}\n',
    );
  });
});

describe('ngspice initial-state semantics', () => {
  it('confirms .ic UIC/non-UIC and .nodeset reference behavior', { skip: !hasNgspice }, async () => {
    const runs = await Promise.all(INITIAL_STATE_FIXTURES.map(runNgspice));
    for (const run of runs) assert.equal(run.status, 'success');

    const firstVoltage = (runIndex: number): number => {
      const run = runs[runIndex];
      if (run.status !== 'success') throw new Error(run.error);
      return run.series.signals['v(out)'][0].re;
    };

    assert.equal(firstVoltage(0), 1);
    assert.ok(Math.abs(firstVoltage(1) - 3) < 1e-5);
    assert.equal(firstVoltage(2), 0.5);
  });
});
