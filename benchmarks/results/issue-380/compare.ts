#!/usr/bin/env tsx
/**
 * Issue #380 focused parity receipt: run the unchanged classic noise fixtures
 * through ngspice-47 and spice-ts via the same classic-corpus harness that
 * feeds the aggregate report, and record per-vector max/RMS abs+rel errors.
 *
 * Usage (from the repository root, after `pnpm -C packages/core build`):
 *   pnpm exec tsx benchmarks/results/issue-380/compare.ts [--output benchmarks/results/issue-380/report.json]
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildClassicReport,
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicManifest,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const FIXTURE_IDS = ['bjt-noise', 'resistor-noise'] as const;

function ngspiceVersion(): string {
  const run = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  return `${run.stdout ?? ''}${run.stderr ?? ''}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unavailable';
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/classic/manifest.json'), 'utf8'),
  ) as ClassicManifest;
  const circuits = FIXTURE_IDS.map(id => {
    const circuit = manifest.circuits.find(candidate => candidate.id === id);
    if (!circuit) throw new Error(`missing classic fixture ${id}`);
    return circuit;
  });

  // Vectors ngspice emits but spice-ts does not (per-generator contributions)
  // are listed explicitly so the receipt shows the uncompared surface.
  const ngspiceRuns = new Map<string, EngineExecution>();
  const report = await buildClassicReport({ ...manifest, circuits }, {
    readFixture: localPath => readFile(resolve(localPath)),
    runNgspice: async (input, circuit) => {
      const execution = await runNativeNgspice(input, circuit);
      ngspiceRuns.set(circuit.id, execution);
      return execution;
    },
    runSpiceTs: runNativeSpiceTs,
    tools: {
      ngspice: ngspiceVersion(),
      spiceTs: (JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')) as { version: string }).version,
    },
  });

  const receipt = {
    schemaVersion: 'spice-ts-issue-380-noise-parity/v1',
    issue: 'https://github.com/mfiumara/spice-ts/issues/380',
    tools: report.tools,
    policy: report.policy,
    fixtures: report.fixtures.map(fixture => {
      const compared = new Set(fixture.comparisons.flatMap(comparison => comparison.signals));
      const ngspiceOnly = (ngspiceRuns.get(fixture.id)?.analyses ?? [])
        .flatMap(analysis => Object.keys(analysis.series.signals).map(signal => `${analysis.plotName}: ${signal}`))
        .filter(entry => !compared.has(entry.slice(entry.indexOf(': ') + 2)))
        .sort();
      return {
        id: fixture.id,
        localPath: fixture.localPath,
        inputSha256: fixture.input.sha256,
        ngspice: fixture.ngspice,
        spiceTs: fixture.spiceTs,
        comparisons: fixture.comparisons,
        notComparedNgspiceVectors: ngspiceOnly,
      };
    }),
  };

  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--output requires a path');
    await writeFile(resolve(outputPath), json);
  }

  for (const fixture of receipt.fixtures) {
    process.stdout.write(`${fixture.id} sha256=${fixture.inputSha256} ngspice=${fixture.ngspice.status} spice-ts=${fixture.spiceTs.status}\n`);
    for (const comparison of fixture.comparisons) {
      for (const [signal, metrics] of Object.entries(comparison.metrics.signals)) {
        if (metrics.status !== 'compared') {
          process.stdout.write(`  ${signal}: missing from ${metrics.missingFrom.join(', ')}\n`);
          continue;
        }
        process.stdout.write(
          `  ${signal}: n=${metrics.sampleCount} abs max=${metrics.absoluteError.max.toExponential(3)} `
            + `rms=${metrics.absoluteError.rms.toExponential(3)} rel max=${metrics.relativeError.max?.toExponential(3) ?? 'n/a'} `
            + `rms=${metrics.relativeError.rms?.toExponential(3) ?? 'n/a'}\n`,
        );
      }
    }
    process.stdout.write(`  not compared (ngspice-only): ${fixture.notComparedNgspiceVectors.length}\n`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
