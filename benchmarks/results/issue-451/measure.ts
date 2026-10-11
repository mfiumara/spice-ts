#!/usr/bin/env tsx
/**
 * Issue #451 receipt: run every aggregate fixture that declares `.pz` through the same
 * adapters as benchmarks/aggregate-report.ts (runNativeNgspice, runBoundedSpiceTs,
 * compareExecutions) on byte-identical input and print the per-signal metrics as JSON.
 *
 * Usage (after `pnpm -C packages/core build`):
 *   pnpm exec tsx benchmarks/results/issue-451/measure.ts > out.json
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareExecutions, runBoundedSpiceTs, SPICE_TS_TIMEOUT_MS } from '../../aggregate-report.js';
import { runNativeNgspice, type ClassicCircuit } from '../../corpus/classic/report.js';

const CORPORA = ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e'];

void main();

async function main(): Promise<void> {
const rows = [];
for (const corpus of CORPORA) {
  const manifest = JSON.parse(await readFile(resolve(`benchmarks/corpus/${corpus}/manifest.json`), 'utf8')) as {
    circuits: Array<ClassicCircuit & { localPath: string; sha256: string; analyses: string[] }>;
  };
  for (const circuit of manifest.circuits) {
    if (!circuit.analyses.includes('pz')) continue;
    const input = await readFile(resolve(circuit.localPath));
    const sha256 = createHash('sha256').update(input).digest('hex');
    if (sha256 !== circuit.sha256) throw new Error(`${corpus}/${circuit.id}: fixture SHA-256 mismatch`);
    const ngspice = await runNativeNgspice(input, circuit);
    const spiceTs = (await runBoundedSpiceTs(input, circuit, SPICE_TS_TIMEOUT_MS)).execution;
    const comparisons = compareExecutions(spiceTs, ngspice);
    const pzCounts = (execution: typeof spiceTs) => {
      const pz = execution.analyses.find(analysis => analysis.type === 'pz');
      if (!pz) return null;
      const names = Object.keys(pz.series.signals);
      return {
        poles: names.filter(name => name.includes('pole(')).length,
        zeros: names.filter(name => name.includes('zero(')).length,
      };
    };
    rows.push({
      key: `${corpus}/${circuit.id}`,
      localPath: circuit.localPath,
      sha256,
      ngspice: { status: ngspice.status, counts: pzCounts(ngspice), error: ngspice.error },
      spiceTs: { status: spiceTs.status, counts: pzCounts(spiceTs), error: spiceTs.error },
      comparisons: comparisons.map(comparison => ({
        analysis: comparison.analysis,
        signals: Object.fromEntries(Object.entries(comparison.metrics.signals).map(([name, signal]) => [
          name,
          signal.status === 'compared'
            ? { max: signal.absoluteError.max, relMax: signal.relativeError.max }
            : { status: signal.status },
        ])),
      })),
    });
  }
}
console.log(JSON.stringify(rows, null, 2));
}
