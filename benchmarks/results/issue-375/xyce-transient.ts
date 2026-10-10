#!/usr/bin/env tsx
/**
 * Issue #375 receipt: every transient fixture in the Xyce corpus, same bytes
 * through spice-ts (in-process) and ngspice. Run once on the base commit and
 * once on the fix to publish per-signal max/RMS absolute and relative errors.
 *
 *   pnpm -C packages/core build && pnpm exec tsx benchmarks/results/issue-375/xyce-transient.ts \
 *     --output <file.json> [--skip inductor-transient]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { alignAndMeasure } from '../../comparison-harness.js';
import {
  runNativeNgspice,
  runNativeSpiceTs,
  type ClassicCircuit,
} from '../../corpus/classic/report.js';

interface XyceManifest {
  circuits: ClassicCircuit[];
}

function ngspiceVersion(): string {
  try {
    const out = execFileSync('ngspice', ['-v'], { encoding: 'utf8' });
    return out.split('\n').find(line => line.includes('ngspice-'))?.replace(/\*/g, '').trim() ?? 'unknown';
  } catch {
    return 'unavailable';
  }
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(resolve('benchmarks/corpus/xyce/manifest.json'), 'utf8'),
  ) as XyceManifest;
  const skipIndex = process.argv.indexOf('--skip');
  const skipped = new Set(skipIndex >= 0 ? (process.argv[skipIndex + 1] ?? '').split(',') : []);
  const fixtures: Record<string, unknown> = {};

  for (const circuit of manifest.circuits.filter(candidate => candidate.analyses.includes('tran'))) {
    if (skipped.has(circuit.id)) {
      fixtures[circuit.id] = { skipped: 'excluded on this run (does not terminate on the base commit, issue #366)' };
      continue;
    }
    const input = await readFile(resolve(circuit.localPath));
    const sha256 = createHash('sha256').update(input).digest('hex');
    let started = performance.now();
    const spiceTs = await runNativeSpiceTs(input, circuit);
    const spiceTsMs = performance.now() - started;
    started = performance.now();
    const ngspice = await runNativeNgspice(input, circuit);
    const ngspiceMs = performance.now() - started;
    const ours = spiceTs.analyses.find(analysis => analysis.type === 'tran');
    const reference = ngspice.analyses.find(analysis => analysis.type === 'tran');
    if (!ours || !reference) {
      fixtures[circuit.id] = {
        sha256,
        spiceTs: spiceTs.status,
        ngspice: ngspice.status,
        error: spiceTs.error ?? ngspice.error ?? null,
      };
      continue;
    }
    const signals = Object.keys(ours.series.signals)
      .filter(signal => reference.series.signals[signal] !== undefined)
      .sort();
    const metrics = alignAndMeasure(ours.series, reference.series, signals);
    fixtures[circuit.id] = {
      path: circuit.localPath,
      sha256,
      spiceTs: spiceTs.status,
      ngspice: ngspice.status,
      spiceTsPoints: ours.series.grid.length,
      ngspicePoints: reference.series.grid.length,
      runtimeMs: { spiceTs: Number(spiceTsMs.toFixed(1)), ngspice: Number(ngspiceMs.toFixed(1)) },
      firstSample: Object.fromEntries(signals.map(signal => [signal, {
        spiceTs: ours.series.signals[signal][0],
        ngspice: reference.series.signals[signal][0],
      }])),
      signals: Object.fromEntries(Object.entries(metrics.signals).map(([signal, value]) => [
        signal,
        value.status === 'compared'
          ? {
              absMax: value.absoluteError.max,
              absRms: value.absoluteError.rms,
              relMax: value.relativeError.max,
              relRms: value.relativeError.rms,
            }
          : value,
      ])),
    };
  }

  const serialized = `${JSON.stringify({
    reference: ngspiceVersion(),
    comparisonGrid: 'spice-ts',
    interpolation: 'linear',
    fixtures,
  }, null, 2)}\n`;
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
