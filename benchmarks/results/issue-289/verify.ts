#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
  type EngineExecution,
} from '../../corpus/classic/report.js';

const TARGETS = new Set([
  'nmos-level1-dc',
  'pmos-level1-dc',
  'npn-dc',
  'pnp-dc',
]);

interface XyceManifest {
  circuits: Array<ClassicCircuit & {
    ngspice?: { failureKind?: string };
    spiceTs: { failureKind?: string };
  }>;
}

interface ReceiptOutcome {
  status: EngineExecution['status'];
  convergence: EngineExecution['convergence'];
  analyses: Array<{ type: string; points: number; signals: string[] }>;
  error?: string;
}

interface FixtureOutcome {
  id: string;
  target: boolean;
  input: { bytes: number; sha256: string; identicalForBothEngines: true };
  ngspice: ReceiptOutcome;
  spiceTs: ReceiptOutcome;
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return `${result.stdout}\n${result.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown';
}

function outcome(execution: EngineExecution, expected?: { failureKind?: string }): ReceiptOutcome {
  const status = execution.status === 'success'
    ? 'success'
    : execution.status === 'unsupported' || expected?.failureKind === 'unsupported'
      ? 'unsupported'
      : 'failed';
  return {
    status,
    convergence: execution.convergence,
    analyses: execution.analyses.map(analysis => ({
      type: analysis.type,
      points: analysis.series.grid.length,
      signals: Object.keys(analysis.series.signals).sort(),
    })),
    ...(execution.error ? { error: execution.error } : {}),
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'),
  ) as XyceManifest;
  const fixtures: FixtureOutcome[] = [];

  for (const circuit of manifest.circuits) {
    const input = await readFile(resolve(circuit.localPath));
    const digest = sha256(input);
    if (digest !== circuit.sha256) {
      throw new Error(`${circuit.id}: fixture SHA-256 mismatch`);
    }
    const [ngspice, spiceTs] = await Promise.all([
      runNativeNgspice(input, circuit),
      runNativeSpiceTs(input, circuit),
    ]);
    fixtures.push({
      id: circuit.id,
      target: TARGETS.has(circuit.id),
      input: {
        bytes: input.byteLength,
        sha256: digest,
        identicalForBothEngines: true,
      },
      ngspice: outcome(ngspice, circuit.ngspice),
      spiceTs: outcome(spiceTs, circuit.spiceTs),
    });
  }

  const targetFixtures = fixtures.filter(fixture => fixture.target);
  const failures = targetFixtures.filter(fixture =>
    fixture.ngspice.status !== 'success' || fixture.spiceTs.status !== 'success',
  );
  const statusCounts = (engine: 'ngspice' | 'spiceTs') => Object.fromEntries(
    ['success', 'failed', 'unsupported'].map(status => [
      status,
      fixtures.filter(fixture => fixture[engine].status === status).length,
    ]),
  );
  const report = {
    schemaVersion: 'spice-ts-issue-289/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/289',
    tools: {
      ngspice: ngspiceVersion(),
      spiceTs: JSON.parse(await readFile(resolve('packages/core/package.json'), 'utf8')).version,
      node: process.version,
    },
    policy: {
      fixtureAdaptation: 'none',
      perCircuitToleranceTuning: false,
      engineInput: 'the same immutable fixture Buffer',
    },
    totals: {
      fixtures: fixtures.length,
      targetFixtures: targetFixtures.length,
      ngspice: statusCounts('ngspice'),
      spiceTs: statusCounts('spiceTs'),
      targetSuccesses: targetFixtures.filter(fixture =>
        fixture.ngspice.status === 'success' && fixture.spiceTs.status === 'success',
      ).length,
    },
    targetFixtures,
    remainingSpiceTsLosses: fixtures
      .filter(fixture => fixture.spiceTs.status !== 'success')
      .map(fixture => ({ id: fixture.id, ...fixture.spiceTs })),
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--output requires a path');
    await writeFile(resolve(outputPath), serialized);
  } else {
    process.stdout.write(serialized);
  }

  if (failures.length > 0) {
    throw new Error(`target failures: ${failures.map(fixture => fixture.id).join(', ')}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
