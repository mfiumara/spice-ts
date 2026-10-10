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
