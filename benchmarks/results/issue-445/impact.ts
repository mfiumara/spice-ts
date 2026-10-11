/**
 * #445 receipt: runs all 100 aggregate fixtures and lists every compared signal whose primary
 * (breakpoint-aligned) metric differs from the retained plain-linear metric. Writes nothing
 * else and does not refresh the aggregate artifacts.
 *
 *   pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-445/impact.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { compareExecutions, runBoundedSpiceTs, SPICE_TS_TIMEOUT_MS } from '../../aggregate-report.js';
import { runNativeNgspice, type ClassicCircuit } from '../../corpus/classic/report.js';

// Same per-fixture loop as buildAggregateReport, minus the (stale-on-main) provenance pins.
async function buildFixtures() {
  const fixtures = [];
  for (const corpus of ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e']) {
    const manifest = JSON.parse(readFileSync(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8')) as { circuits: ClassicCircuit[] };
    for (const circuit of manifest.circuits) {
      const input = readFileSync(circuit.localPath);
      const ngspice = await runNativeNgspice(input, circuit);
      const spiceTs = await runBoundedSpiceTs(input, circuit, SPICE_TS_TIMEOUT_MS);
      fixtures.push({ key: `${corpus}/${circuit.id}`, comparisons: compareExecutions(spiceTs.execution, ngspice) });
      process.stderr.write(`${corpus}/${circuit.id} ${ngspice.status}/${spiceTs.execution.status}\n`);
    }
  }
  return { fixtures };
}

async function main(): Promise<void> {
  const report = await buildFixtures();
  const rows: unknown[] = [];
  for (const fixture of report.fixtures) {
    for (const comparison of fixture.comparisons) {
      for (const [signal, primary] of Object.entries(comparison.metrics.signals)) {
        const linear = comparison.linearMetrics?.signals[signal];
        if (primary.status !== 'compared' || linear?.status !== 'compared') continue;
        if (
          primary.absoluteError.max !== linear.absoluteError.max
          || primary.absoluteError.rms !== linear.absoluteError.rms
          || primary.relativeError.max !== linear.relativeError.max
          || primary.relativeError.rms !== linear.relativeError.rms
          || primary.relativeError.excludedZeroReferences !== linear.relativeError.excludedZeroReferences
        ) {
          rows.push({
            fixture: fixture.key,
            analysis: comparison.analysis,
            signal,
            primary: { abs: primary.absoluteError, rel: { max: primary.relativeError.max, rms: primary.relativeError.rms } },
            linear: { abs: linear.absoluteError, rel: { max: linear.relativeError.max, rms: linear.relativeError.rms } },
          });
        }
      }
    }
  }
  writeFileSync(process.argv[2] ?? 'benchmarks/results/issue-445/impact.json', JSON.stringify({
    comparedAnalyses: report.fixtures.reduce((n, f) => n + f.comparisons.length, 0),
    tranComparisons: report.fixtures.flatMap(f => f.comparisons.filter(c => c.analysis === 'tran').map(() => f.key)),
    changed: rows,
  }, null, 2));
  console.log('changed signals', rows.length);
}

void main();
