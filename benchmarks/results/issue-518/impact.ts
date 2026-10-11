/**
 * #518 receipt: runs all 100 aggregate fixtures against ngspice-47 and writes, per compared
 * signal, the absolute and relative max error. Run it once on a core build of main and once on
 * the branch build, then diff the two files with `--diff`. It does not refresh the aggregate
 * artifacts (benchmarks/AGGREGATE_PARITY.md, benchmarks/aggregate-report.json).
 *
 *   pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-518/impact.ts <out.json>
 *   pnpm exec tsx benchmarks/results/issue-518/impact.ts --diff <before.json> <after.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { compareExecutions, runBoundedSpiceTs, SPICE_TS_TIMEOUT_MS } from '../../aggregate-report.js';
import { runNativeNgspice, type ClassicCircuit } from '../../corpus/classic/report.js';

interface SignalRow { absMax: number; relMax: number | null; points: number }
type Snapshot = Record<string, { ngspice: string; spiceTs: string; signals: Record<string, SignalRow> }>;

async function snapshot(): Promise<Snapshot> {
  const result: Snapshot = {};
  for (const corpus of ['ngspice', 'classic', 'xyce', 'corpus-d', 'corpus-e']) {
    const manifest = JSON.parse(readFileSync(`benchmarks/corpus/${corpus}/manifest.json`, 'utf8')) as { circuits: ClassicCircuit[] };
    for (const circuit of manifest.circuits) {
      const input = readFileSync(circuit.localPath);
      const ngspice = await runNativeNgspice(input, circuit);
      const spiceTs = await runBoundedSpiceTs(input, circuit, SPICE_TS_TIMEOUT_MS);
      const signals: Record<string, SignalRow> = {};
      for (const comparison of compareExecutions(spiceTs.execution, ngspice)) {
        for (const [signal, metric] of Object.entries(comparison.metrics.signals)) {
          if (metric.status !== 'compared') continue;
          signals[`${comparison.analysis}:${signal}`] = {
            absMax: metric.absoluteError.max,
            relMax: metric.relativeError.max,
            points: comparison.metrics.grid.alignedPoints,
          };
        }
      }
      const key = `${corpus}/${circuit.id}`;
      result[key] = { ngspice: ngspice.status, spiceTs: spiceTs.execution.status, signals };
      process.stderr.write(`${key} ${ngspice.status}/${spiceTs.execution.status}\n`);
    }
  }
  return result;
}

function diff(beforePath: string, afterPath: string): void {
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Snapshot;
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Snapshot;
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (!a || a.spiceTs !== b.spiceTs) console.log(`${key}: status ${a?.spiceTs} -> ${b.spiceTs}`);
    const changed = Object.keys(b.signals).filter(signal => {
      const x = a?.signals[signal];
      const y = b.signals[signal];
      return !x || x.absMax !== y.absMax || x.relMax !== y.relMax;
    });
    if (changed.length === 0) continue;
    const worst = (s: Snapshot[string]) => Object.entries(s.signals).reduce(
      (w, [name, row]) => (row.absMax > w[1] ? [name, row.absMax] as [string, number] : w), ['', 0] as [string, number]);
    const [wa, va] = worst(a);
    const [wb, vb] = worst(b);
    console.log(`${key}: ${changed.length}/${Object.keys(b.signals).length} signals changed; worst abs max ${va.toPrecision(4)} (${wa}) -> ${vb.toPrecision(4)} (${wb})`);
    for (const signal of changed) {
      const x = a?.signals[signal];
      const y = b.signals[signal];
      console.log(`  ${signal}: abs ${x?.absMax.toPrecision(4)} -> ${y.absMax.toPrecision(4)}, rel ${x?.relMax?.toPrecision(4)} -> ${y.relMax?.toPrecision(4)}`);
    }
  }
}

if (process.argv[2] === '--diff') {
  diff(process.argv[3], process.argv[4]);
} else {
  void snapshot().then(result => writeFileSync(process.argv[2] ?? 'impact.json', JSON.stringify(result, null, 2)));
}
