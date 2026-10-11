#!/usr/bin/env tsx
/**
 * Runs ngspice and spice-ts on the identical translated corpus-e-spice3 bytes and prints a
 * per-fixture status/accuracy table (issue #524, lane 2). Descriptive only: it does not write or
 * register anything in the aggregate report (lane 4 does that).
 *
 * Usage (after `pnpm build`):
 *   pnpm exec tsx benchmarks/corpus/corpus-e-spice3/run-engines.ts [--json]
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareExecutions, runBoundedSpiceTs, SPICE_TS_TIMEOUT_MS } from '../../aggregate-report.js';
import { runNativeNgspice, type ClassicCircuit, type EngineExecution } from '../classic/report.js';

interface Manifest {
  circuits: ClassicCircuit[];
}

function summarize(execution: EngineExecution): string {
  if (execution.status === 'success') return `success (${execution.analyses.map(a => `${a.type}:${a.series.grid.length}`).join(' ')})`;
  return `${execution.status}: ${(execution.error ?? '').split('\n')[0].slice(0, 160)}`;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/corpus-e-spice3/manifest.json'), 'utf8'),
  ) as Manifest;
  const rows = [];
  for (const circuit of manifest.circuits) {
    const input = await readFile(resolve(circuit.localPath));
    const digest = createHash('sha256').update(input).digest('hex');
    if (digest !== circuit.sha256) throw new Error(`${circuit.id}: fixture SHA-256 mismatch`);
    const ngspice = await runNativeNgspice(input, circuit);
    const spiceTs = (await runBoundedSpiceTs(input, circuit, SPICE_TS_TIMEOUT_MS)).execution;
    const comparisons = compareExecutions(spiceTs, ngspice).map(comparison => {
      let worst = { signal: '', abs: 0 };
      for (const [signal, metric] of Object.entries(comparison.metrics.signals)) {
        if (metric.status === 'compared' && metric.absoluteError.max >= worst.abs) {
          worst = { signal, abs: metric.absoluteError.max };
        }
      }
      return { analysis: comparison.analysis, signals: comparison.signals.length, worstAbsMax: worst };
    });
    rows.push({ id: circuit.id, sha256: digest, ngspice: summarize(ngspice), spiceTs: summarize(spiceTs), comparisons });
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  for (const row of rows) {
    console.log(`${row.id}\n  ngspice:  ${row.ngspice}\n  spice-ts: ${row.spiceTs}`);
    for (const comparison of row.comparisons) {
      console.log(
        `  ${comparison.analysis}: ${comparison.signals} signals, worst abs max ${comparison.worstAbsMax.abs.toPrecision(4)} on ${comparison.worstAbsMax.signal}`,
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
