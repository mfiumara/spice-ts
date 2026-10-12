#!/usr/bin/env tsx
/** Identical-input ngspice-47 option probes. No fixture adaptation or tolerance tuning. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { compareExecutions } from '../aggregate-report.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit, type EngineExecution } from '../corpus/classic/report.js';
import { normalizedSignalErrors, pairedReferenceSeries } from '../corpus/corpus-f/lib.js';

async function main(): Promise<void> {
  const rows = [];
  for (const [id, analysis] of [['ramptime', 'tran'], ['bypass', 'dc']] as const) {
    const path = `benchmarks/options-494/${id}.cir`;
    const input = await readFile(path);
    const circuit: ClassicCircuit = {
      id, category: 'options', analyses: [analysis], localPath: path, sourcePath: path,
      sourceUrl: 'https://github.com/mfiumara/spice-ts/issues/494',
      sha256: createHash('sha256').update(input).digest('hex'),
      ngspice: { expectedStatus: 'pass' }, spiceTs: { expectedStatus: 'pass' },
    };
    const start = performance.now();
    const ngspice = await runNativeNgspice(input, circuit);
    const middle = performance.now();
    const spiceTs = await runNativeSpiceTs(input, circuit);
    const end = performance.now();
    const comparisons = compareExecutions(spiceTs, ngspice);
    const normalized = normalizedSignalErrors(comparisons, pairedReferenceSeries(spiceTs, ngspice));
    const summarize = (execution: EngineExecution) => ({
      status: execution.status, convergence: execution.convergence, error: execution.error,
      analyses: execution.analyses.map(a => ({
        type: a.type, points: a.series.grid.length,
        signals: Object.fromEntries(Object.entries(a.series.signals).map(([name, values]) => [name, {
          initial: values[0], final: values.at(-1),
        }])),
      })),
    });
    rows.push({ id, path, sha256: circuit.sha256, ngspice: summarize(ngspice), spiceTs: summarize(spiceTs),
      runtimeMs: { ngspiceProcess: middle - start, spiceTsAdapter: end - middle }, comparisons, normalized });
  }
  const report = {
    command: 'pnpm exec tsx benchmarks/options-494/compare.ts',
    ngspice: execFileSync('ngspice', ['--version'], { encoding: 'utf8' }).match(/ngspice-\d+/)?.[0],
    machine: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
    policy: { identicalInput: true, fixtureAdaptation: 'none', perCircuitToleranceTuning: false,
      timing: 'Single runs; ngspice process startup and spice-ts dynamic import included. Not a speed claim.' },
    rows,
  };
  await writeFile('benchmarks/options-494/report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (rows.some(row => row.ngspice.status !== 'success' || row.spiceTs.status !== 'success' || row.comparisons.length === 0)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
