import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildClassicReport,
  runNativeSpiceTs,
  summarizeClassicReport,
  type ClassicCircuit,
  type ClassicFixtureReport,
  type ClassicManifest,
  type EngineExecution,
} from './report.js';
import type { SampleSeries } from '../../comparison-harness.js';

const realSeries = (grid: number[], values: number[]): SampleSeries => ({
  grid,
  signals: { 'v(out)': values.map(re => ({ re, im: 0 })) },
});

const circuit: ClassicCircuit = {
  id: 'fixture',
  category: 'passive',
  analyses: ['tran'],
  sourcePath: 'examples/fixture.cir',
  sourceUrl: 'https://example.test/fixture.cir',
  localPath: 'benchmarks/corpus/classic/fixtures/fixture.cir',
  sha256: createHash('sha256').update(Buffer.from('fixture bytes')).digest('hex'),
  ngspice: { expectedStatus: 'pass' },
  spiceTs: { expectedStatus: 'pass' },
};

const manifest: ClassicManifest = {
  schemaVersion: 1,
  source: { name: 'test corpus', revision: 'abc123', license: 'test' },
  circuits: [circuit],
};

function success(series: SampleSeries): EngineExecution {
  return {
    status: 'success',
    convergence: 'converged',
    analyses: [{ type: 'tran', plotName: 'Transient Analysis', series }],
  };
}

describe('classic corpus comparison report', () => {
  it('feeds the exact same fixture bytes to both engines and records matched-point errors', async () => {
    const fixtureBytes = Buffer.from('fixture bytes');
    const seen: Buffer[] = [];
    const report = await buildClassicReport(manifest, {
      readFixture: async () => fixtureBytes,
      runNgspice: async (input) => {
        seen.push(input);
        return success(realSeries([0, 1], [0, 2]));
      },
      runSpiceTs: async (input) => {
        seen.push(input);
        return success(realSeries([0, 0.5, 1], [0, 1.1, 2]));
      },
      tools: { ngspice: 'ngspice-test', spiceTs: 'spice-ts-test' },
    });

    assert.equal(seen.length, 2);
    assert.strictEqual(seen[0], seen[1]);
    assert.equal(report.fixtures[0]?.input.sha256, circuit.sha256);
    assert.equal(report.fixtures[0]?.input.identicalForBothEngines, true);
    assert.deepEqual(report.fixtures[0]?.comparisons[0]?.metrics.grid, {
      spiceTsPoints: 3,
      ngspicePoints: 2,
      alignedPoints: 3,
      excludedOutOfRange: 0,
    });
    const signal = report.fixtures[0]?.comparisons[0]?.metrics.signals['v(out)'];
    assert.equal(signal?.status, 'compared');
    if (!signal || signal.status !== 'compared') throw new Error('expected compared signal');
    assert.equal(signal.absoluteError.max, 0.10000000000000009);
  });

  it('keeps unsupported and failed losses visible in deterministic totals', async () => {
    const fixtureBytes = Buffer.from('fixture bytes');
    const report = await buildClassicReport(manifest, {
      readFixture: async () => fixtureBytes,
      runNgspice: async () => ({
        status: 'failed',
        convergence: 'failed',
        analyses: [],
        error: 'no raw analysis data produced',
      }),
      runSpiceTs: async () => ({
        status: 'unsupported',
        convergence: 'not-run',
        analyses: [],
        error: 'Unsupported device: T',
      }),
      tools: { ngspice: 'ngspice-test', spiceTs: 'spice-ts-test' },
    });

    assert.deepEqual(summarizeClassicReport(report.fixtures), {
      fixtures: 1,
      ngspice: { success: 0, failed: 1, unsupported: 0 },
      spiceTs: { success: 0, failed: 0, unsupported: 1 },
      comparedAnalyses: 0,
    });
    assert.equal(report.fixtures[0]?.ngspice.error, 'no raw analysis data produced');
    assert.equal(report.fixtures[0]?.spiceTs.error, 'Unsupported device: T');
  });

  it('rejects fixture bytes that differ from the licensed manifest hash', async () => {
    await assert.rejects(
      buildClassicReport(manifest, {
        readFixture: async () => Buffer.from('rewritten bytes'),
        runNgspice: async () => success(realSeries([0], [0])),
        runSpiceTs: async () => success(realSeries([0], [0])),
        tools: { ngspice: 'ngspice-test', spiceTs: 'spice-ts-test' },
      }),
      /fixture: SHA-256 mismatch/,
    );
  });

  it('emits native spice-ts pole-zero series for the unchanged classic fixtures', async () => {
    const classicManifest = JSON.parse(
      readFileSync(resolve('benchmarks/corpus/classic/manifest.json'), 'utf8'),
    ) as ClassicManifest;
    const expectedSignals = new Map([
      ['pole-zero-four-stage', ['v(pole(1))', 'v(pole(2))', 'v(pole(3))', 'v(pole(4))']],
      ['pole-zero-three-stage', ['v(pole(1))', 'v(pole(2))', 'v(pole(3))']],
      ['high-pass-pole-zero', ['v(pole(1))', 'v(zero(1))']],
    ]);

    for (const [id, signals] of expectedSignals) {
      const fixture = classicManifest.circuits.find(candidate => candidate.id === id);
      if (!fixture) throw new Error(`missing classic fixture ${id}`);

      const execution = await runNativeSpiceTs(
        readFileSync(resolve(fixture.localPath)),
        fixture,
      );

      assert.equal(execution.status, 'success');
      assert.equal(execution.convergence, 'converged');
      assert.deepEqual(execution.analyses.map(analysis => analysis.type), ['pz']);
      assert.deepEqual(execution.analyses[0]?.series.grid, [0]);
      assert.deepEqual(Object.keys(execution.analyses[0]?.series.signals ?? {}), signals);
      assert.equal(
        Object.values(execution.analyses[0]?.series.signals ?? {})
          .every(values => values.length === 1),
        true,
      );
    }
  });

  it('emits native spice-ts noise spectra and totals with ngspice-47 plot and vector names', async () => {
    const classicManifest = JSON.parse(
      readFileSync(resolve('benchmarks/corpus/classic/manifest.json'), 'utf8'),
    ) as ClassicManifest;
    const expected = new Map([
      ['bjt-noise', ['v(inoise_total)', 'v(onoise_total)']],
      ['resistor-noise', ['i(inoise_total)', 'v(onoise_total)']],
    ]);

    for (const [id, totals] of expected) {
      const fixture = classicManifest.circuits.find(candidate => candidate.id === id);
      if (!fixture) throw new Error(`missing classic fixture ${id}`);
      const input = readFileSync(resolve(fixture.localPath));
      assert.equal(createHash('sha256').update(input).digest('hex'), fixture.sha256);

      const execution = await runNativeSpiceTs(input, fixture);

      assert.equal(execution.status, 'success', execution.error);
      assert.equal(execution.convergence, 'converged');
      assert.deepEqual(
        execution.analyses.map(analysis => [analysis.type, analysis.plotName]),
        [['noise', 'Noise Spectral Density Curves'], ['noise', 'Integrated Noise']],
      );
      const [spectrum, integrated] = execution.analyses;
      assert.equal(spectrum?.series.grid.length, 41);
      assert.deepEqual(Object.keys(spectrum?.series.signals ?? {}), ['inoise_spectrum', 'onoise_spectrum']);
      assert.deepEqual(integrated?.series.grid, [0]);
      assert.deepEqual(Object.keys(integrated?.series.signals ?? {}), totals);
      assert.equal(
        Object.values(integrated?.series.signals ?? {}).every(values => values.length === 1 && values[0]!.re > 0),
        true,
      );
    }
  });

  it('emits native spice-ts distortion products with ngspice-47 plot and vector names (#391)', async () => {
    const classicManifest = JSON.parse(
      readFileSync(resolve('benchmarks/corpus/classic/manifest.json'), 'utf8'),
    ) as ClassicManifest;
    const fixture = classicManifest.circuits.find(candidate => candidate.id === 'diode-distortion');
    if (!fixture) throw new Error('missing classic fixture diode-distortion');
    const input = readFileSync(resolve(fixture.localPath));
    assert.equal(createHash('sha256').update(input).digest('hex'), fixture.sha256);

    const execution = await runNativeSpiceTs(input, fixture);

    assert.equal(execution.status, 'success', execution.error);
    assert.equal(execution.convergence, 'converged');
    // ngspice-47 emits one complex plot per two-tone product, in this order.
    assert.deepEqual(
      execution.analyses.map(analysis => [analysis.type, analysis.plotName]),
      [
        ['disto', 'DISTORTION - IM: f1+f2'],
        ['disto', 'DISTORTION - IM: f1-f2'],
        ['disto', 'DISTORTION - IM: 2f1-f2'],
      ],
    );
    for (const analysis of execution.analyses) {
      assert.equal(analysis.series.grid.length, 101);
      assert.equal(analysis.series.grid[0], 1e3);
      assert.deepEqual(Object.keys(analysis.series.signals), ['v(1)', 'v(2)', 'v(3)', 'i(vcc)', 'i(vcc2)']);
      assert.equal(Object.values(analysis.series.signals).every(values => values.length === 101), true);
    }
    // Rectangular components are carried through unchanged (not as magnitude/phase).
    const first = execution.analyses[0]?.series.signals['v(2)']?.[0];
    assert.ok(first && first.re > 0 && first.im < 0);
  });

  it('pairs each spice-ts distortion product with the same-named ngspice plot', async () => {
    const distoCircuit: ClassicCircuit = { ...circuit, analyses: ['disto'] };
    const plots = (scale: number): EngineExecution => ({
      status: 'success',
      convergence: 'converged',
      analyses: ['f1+f2', 'f1-f2', '2f1-f2'].map((product, index) => ({
        type: 'disto' as const,
        plotName: `DISTORTION - IM: ${product}`,
        series: { grid: [1e3, 1e4], signals: { 'v(2)': [{ re: (index + 1) * scale, im: 0 }, { re: 0, im: index + 1 }] } },
      })),
    });
    const ngspice = plots(1);
    const report = await buildClassicReport({ ...manifest, circuits: [distoCircuit] }, {
      readFixture: async () => Buffer.from('fixture bytes'),
      // Reversed plot order proves pairing is by name, not position.
      runNgspice: async () => ({ ...ngspice, analyses: [...ngspice.analyses].reverse() }),
      runSpiceTs: async () => plots(1.5),
      tools: { ngspice: 'ngspice-test', spiceTs: 'spice-ts-test' },
    });

    const comparisons = report.fixtures[0]?.comparisons ?? [];
    assert.equal(comparisons.length, 3);
    const maxima = comparisons.map(comparison => {
      const signal = comparison.metrics.signals['v(2)'];
      if (!signal || signal.status !== 'compared') throw new Error('expected compared v(2)');
      return signal.absoluteError.max;
    });
    assert.deepEqual(maxima, [0.5, 1, 1.5]);
  });

  it('pairs same-type plots by plot name so noise spectra and totals are both compared', async () => {
    const noiseCircuit: ClassicCircuit = { ...circuit, analyses: ['noise'] };
    const noisePlots = (spectrum: number[], total: number): EngineExecution => ({
      status: 'success',
      convergence: 'converged',
      analyses: [
        {
          type: 'noise',
          plotName: 'Noise Spectral Density Curves',
          series: { grid: [10, 100], signals: { onoise_spectrum: spectrum.map(re => ({ re, im: 0 })) } },
        },
        {
          type: 'noise',
          plotName: 'Integrated Noise',
          series: { grid: [0], signals: { 'v(onoise_total)': [{ re: total, im: 0 }] } },
        },
      ],
    });
    const report = await buildClassicReport({ ...manifest, circuits: [noiseCircuit] }, {
      readFixture: async () => Buffer.from('fixture bytes'),
      runNgspice: async () => noisePlots([4, 4], 2),
      runSpiceTs: async () => noisePlots([4, 4], 2.5),
      tools: { ngspice: 'ngspice-test', spiceTs: 'spice-ts-test' },
    });

    const comparisons = report.fixtures[0]?.comparisons ?? [];
    assert.deepEqual(comparisons.map(comparison => comparison.signals), [['onoise_spectrum'], ['v(onoise_total)']]);
    const total = comparisons[1]?.metrics.signals['v(onoise_total)'];
    if (!total || total.status !== 'compared') throw new Error('expected compared total');
    assert.equal(total.absoluteError.max, 0.5);
  });

  it('programmatically verifies the committed 20-fixture loss totals and input hashes', () => {
    const report = JSON.parse(
      readFileSync(resolve('benchmarks/corpus/classic/report.json'), 'utf8'),
    ) as { totals: ReturnType<typeof summarizeClassicReport>; fixtures: ClassicFixtureReport[] };
    const actual = summarizeClassicReport(report.fixtures);

    assert.deepEqual(report.totals, actual);
    assert.deepEqual(actual, {
      fixtures: 20,
      ngspice: { success: 19, failed: 1, unsupported: 0 },
      spiceTs: { success: 0, failed: 0, unsupported: 20 },
      comparedAnalyses: 0,
    });
    assert.equal(
      report.fixtures.every(fixture =>
        fixture.input.identicalForBothEngines
        && fixture.input.sha256 === fixture.ngspice.inputSha256
        && fixture.input.sha256 === fixture.spiceTs.inputSha256),
      true,
    );
  });
});
