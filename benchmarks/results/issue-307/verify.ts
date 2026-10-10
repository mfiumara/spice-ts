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

const TARGET_IDS = [
  'capacitor-rc-oscillator',
  'diode-level2-temperature-breakdown',
  'diode-transient',
  'rlc-transient',
] as const;

interface XyceManifest {
  circuits: Array<ClassicCircuit & {
    ngspice?: { failureKind?: string };
    spiceTs: { failureKind?: string };
  }>;
}

interface AuditReport {
  fixtures: Array<{
    key: string;
    spiceTs: {
      status: EngineExecution['status'];
      firstFailure: { evidence: string } | null;
    };
  }>;
}

interface ReceiptOutcome {
  status: EngineExecution['status'];
  convergence: EngineExecution['convergence'];
  analyses: Array<{ type: string; points: number; signals: string[] }>;
  error?: string;
}

function sha256(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function ngspiceVersion(): string {
  const result = spawnSync('ngspice', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 'unavailable';
  return `${result.stdout}\n${result.stderr}`.match(/ngspice-\d+(?:\.\d+)*/i)?.[0] ?? 'unknown';
}

function stableError(error: string): string {
  return error.replace(/\s+Total elapsed time \(seconds\).*$/s, '').trim();
}

function outcome(execution: EngineExecution): ReceiptOutcome {
  return {
    status: execution.status,
    convergence: execution.convergence,
    analyses: execution.analyses.map(analysis => ({
      type: analysis.type,
      points: analysis.series.grid.length,
      signals: Object.keys(analysis.series.signals).sort(),
    })),
    ...(execution.error ? { error: stableError(execution.error) } : {}),
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'),
  ) as XyceManifest;
  const audit = JSON.parse(
    await readFile(resolve('benchmarks/device-card-audit/report.json'), 'utf8'),
  ) as AuditReport;
  const circuits = TARGET_IDS.map((id) => {
    const circuit = manifest.circuits.find(candidate => candidate.id === id);
    if (!circuit) throw new Error(`missing Xyce fixture: ${id}`);
    return circuit;
  });

  const fixtures = [];
  for (const circuit of circuits) {
    const input = await readFile(resolve(circuit.localPath));
    const digest = sha256(input);
    if (digest !== circuit.sha256) throw new Error(`${circuit.id}: fixture SHA-256 mismatch`);
    const baseline = audit.fixtures.find(fixture => fixture.key === `xyce/${circuit.id}`);
    if (!baseline) throw new Error(`${circuit.id}: missing committed audit baseline`);
    const [ngspice, spiceTs] = await Promise.all([
      runNativeNgspice(input, circuit),
      runNativeSpiceTs(input, circuit),
    ]);
    if (/Unknown function ['"][VI]['"]/i.test(spiceTs.error ?? '')) {
      throw new Error(`${circuit.id}: V/I output expression remains unresolved`);
    }
    fixtures.push({
      id: circuit.id,
      input: {
        bytes: input.byteLength,
        sha256: digest,
        identicalForBothEngines: true,
      },
      before: {
        spiceTs: {
          status: baseline.spiceTs.status,
          error: baseline.spiceTs.firstFailure?.evidence,
        },
      },
      after: {
        ngspice: outcome(ngspice),
        spiceTs: outcome(spiceTs),
      },
    });
  }

  const report = {
    schemaVersion: 'spice-ts-issue-307/v1',
    issueUrl: 'https://github.com/mfiumara/spice-ts/issues/307',
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
    command: 'pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-307/verify.ts --output benchmarks/results/issue-307/report.json',
    fixtures,
    newlyExposedLosses: fixtures.flatMap(fixture =>
      fixture.after.spiceTs.status === 'success'
        ? []
        : [{ id: fixture.id, ...fixture.after.spiceTs }],
    ),
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
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
