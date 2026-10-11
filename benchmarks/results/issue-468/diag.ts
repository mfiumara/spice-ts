#!/usr/bin/env tsx
/**
 * Issue #468 diagnostic (not a published fixture result): run a deck through
 * both engines with its .TRAN card replaced and, optionally, extra .OPTIONS
 * fields, then print per-signal abs max / RMS error against ngspice-47. Both
 * engines always see the identical modified bytes.
 *
 * Usage:
 *   npx tsx benchmarks/results/issue-468/diag.ts <deck> "<.TRAN card>" <signals,comma,separated> [options]
 * e.g.
 *   npx tsx benchmarks/results/issue-468/diag.ts benchmarks/corpus/ngspice/fixtures/tests/mos6/mos6inv.cir \
 *     ".TRAN 0.5N 150N" "v(5),i(vin)" "RELTOL=1e-4"
 */
import { readFile } from 'node:fs/promises';
import { alignAndMeasure } from '../../comparison-harness.js';
import { runNativeNgspice, runNativeSpiceTs, type ClassicCircuit } from '../../corpus/classic/report.js';

async function main(): Promise<void> {
  const [file, tranCard, signalList, options] = process.argv.slice(2);
  if (!file || !tranCard || !signalList) throw new Error('usage: diag.ts <deck> "<.TRAN card>" <signals> [options]');
  let text = (await readFile(file, 'utf8')).replace(/^\.TRAN.*$/im, tranCard);
  if (options) text = text.replace(/^\.END\s*$/im, `.OPTIONS ${options}\n.END`);
  const input = Buffer.from(text);
  const circuit = {
    id: 'issue-468-diagnostic',
    category: 'digital',
    analyses: ['tran'],
    localPath: file,
    sha256: '',
    ngspice: { expectedStatus: 'pass' },
    spiceTs: { expectedStatus: 'pass' },
  } as unknown as ClassicCircuit;
  const [spice, ngspice] = await Promise.all([runNativeSpiceTs(input, circuit), runNativeNgspice(input, circuit)]);
  const spiceAnalysis = spice.analyses[0];
  const ngAnalysis = ngspice.analyses[0];
  if (spice.status !== 'success' || ngspice.status !== 'success' || !spiceAnalysis || !ngAnalysis) {
    throw new Error(`run failed: spice-ts ${spice.status} ${spice.error ?? ''}; ngspice ${ngspice.status} ${ngspice.error ?? ''}`);
  }
  const metrics = alignAndMeasure(spiceAnalysis.series, ngAnalysis.series, signalList.split(','));
  console.log(`${tranCard}${options ? ` .OPTIONS ${options}` : ''}: points spice-ts ${spiceAnalysis.series.grid.length}, ngspice ${ngAnalysis.series.grid.length}`);
  for (const [signal, metric] of Object.entries(metrics.signals)) {
    if (metric.status !== 'compared') {
      console.log(`  ${signal} ${metric.status}`);
      continue;
    }
    console.log(`  ${signal} max ${metric.absoluteError.max.toExponential(3)} rms ${metric.absoluteError.rms.toExponential(3)}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
