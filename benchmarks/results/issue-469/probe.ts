#!/usr/bin/env tsx
/**
 * Issue #469 probe: per-signal TRAN error of one unchanged corpus fixture,
 * spice-ts vs ngspice-47 on identical bytes, plus (with PROBE_VARIANT) both
 * engines at the fixture's default settings against ngspice-47 run to
 * convergence on the same deck with one identical edit.
 *
 * Usage (after `pnpm -C packages/core build`):
 *   npx tsx benchmarks/results/issue-469/probe.ts <corpus> <fixture-id>
 *   PROBE_VARIANT='.tran 5ns 200ns=>.options reltol=1e-6\n.tran 5ns 200ns 0 10ps' \
 *     npx tsx benchmarks/results/issue-469/probe.ts corpus-e bjt-rtl-inverter-chain
 * Metrics: abs max / abs RMS on the first engine's grid (aggregate harness).
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice, runNativeSpiceTs, type ClassicCircuit, type EngineExecution,
} from '../../corpus/classic/report.js';

type Series = EngineExecution['analyses'][number]['series'];

function tran(execution: EngineExecution, label: string): Series {
  const analysis = execution.analyses.find(entry => entry.type === 'tran');
  if (execution.status !== 'success' || !analysis) {
    throw new Error(`${label}: ${execution.status} ${execution.error ?? 'no TRAN'}`);
  }
  return analysis.series;
}

function report(label: string, series: Series, reference: Series): void {
  const signals = Object.keys(series.signals).filter(signal => reference.signals[signal]).sort();
  const metrics = alignAndMeasure(series, reference, signals);
  const parts: string[] = [];
  for (const [signal, metric] of Object.entries(metrics.signals)) {
    if (metric.status === 'compared') {
      parts.push(`${signal}=${metric.absoluteError.max.toExponential(3)}/${metric.absoluteError.rms.toExponential(3)}`);
    }
  }
  console.log(`${label}: points ${series.grid.length} vs ${reference.grid.length} :: ${parts.join(' ')}`);
}

async function main(): Promise<void> {
  const [corpus, id] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(resolve(`benchmarks/corpus/${corpus}/manifest.json`), 'utf8')) as {
    circuits: ClassicCircuit[];
  };
  const circuit = manifest.circuits.find(entry => entry.id === id);
  if (!circuit) throw new Error(`missing ${corpus}/${id}`);
  const input = await readFile(resolve(circuit.localPath));
  const spice = tran(await runNativeSpiceTs(input, circuit), 'spice-ts');
  const ngspice = tran(await runNativeNgspice(input, circuit), 'ngspice');
  report(`${id} spice-ts vs ngspice-47 (identical deck)`, spice, ngspice);
  const variant = process.env.PROBE_VARIANT;
  if (!variant) return;
  const [from, to] = variant.split('=>');
  const text = input.toString('utf8');
  if (!text.includes(from)) throw new Error(`variant anchor not found: ${from}`);
  const converged = Buffer.from(text.replace(from, to.replace(/\\n/g, '\n')));
  const reference = tran(await runNativeNgspice(converged, circuit), 'ngspice converged');
  report(`${id} spice-ts default vs ngspice-47 converged`, spice, reference);
  report(`${id} ngspice-47 default vs ngspice-47 converged`, ngspice, reference);
  if (process.env.PROBE_SPICE_CONVERGED) {
    const spiceConverged = tran(await runNativeSpiceTs(converged, circuit), 'spice-ts converged');
    report(`${id} spice-ts converged vs ngspice-47 converged`, spiceConverged, reference);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
