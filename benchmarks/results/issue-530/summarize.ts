#!/usr/bin/env tsx
/**
 * Print the issue #530 before/after table from before.json and after.json.
 * Only signals whose metrics changed are listed; every listed row is shown,
 * including regressions.
 *
 * Usage: pnpm exec tsx benchmarks/results/issue-530/summarize.ts
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Compared {
  status: 'compared';
  absoluteError: { max: number; rms: number };
  relativeError: { max: number | null; rms: number | null };
}
interface Fixture {
  key: string;
  engines: { spiceTs: { status: string }; ngspice: { status: string } };
  comparisons: Array<{ analysis: string; metrics: { signals: Record<string, Compared | { status: 'missing' }> } }>;
}

const directory = dirname(fileURLToPath(import.meta.url));
const load = async (label: string): Promise<{ measuredRevision: string; fixtures: Fixture[] }> =>
  JSON.parse(await readFile(resolve(directory, `${label}.json`), 'utf8'));

const format = (value: number | null): string => (value === null ? 'null' : value === 0 ? '0' : value.toPrecision(3));

async function main(): Promise<void> {
  const [before, after] = await Promise.all([load('before'), load('after')]);
  const beforeByKey = new Map(before.fixtures.map(fixture => [fixture.key, fixture]));
  const lines = [
    `before ${before.measuredRevision.slice(0, 7)} -> after ${after.measuredRevision.slice(0, 7)} (ngspice-47 reference)`,
    '',
    '| fixture | analysis | signal | before abs max | before abs RMS | before rel max | before rel RMS | after abs max | after abs RMS | after rel max | after rel RMS |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const fixture of after.fixtures) {
    const previous = beforeByKey.get(fixture.key);
    if (previous && previous.engines.spiceTs.status !== fixture.engines.spiceTs.status) {
      lines.push(`| ${fixture.key} | - | status | ${previous.engines.spiceTs.status} | | | | ${fixture.engines.spiceTs.status} | | | |`);
      // A fixture that no longer runs has no after metrics; publish what it used to measure.
      for (const comparison of fixture.comparisons.length === 0 ? previous.comparisons : []) {
        let worst: [string, Compared] | undefined;
        for (const [signal, metrics] of Object.entries(comparison.metrics.signals)) {
          if (metrics.status === 'compared' && (!worst || metrics.absoluteError.max > worst[1].absoluteError.max)) worst = [signal, metrics];
        }
        if (worst) {
          const [signal, metrics] = worst;
          lines.push(`| ${fixture.key} | ${comparison.analysis} | worst ${signal} | ${format(metrics.absoluteError.max)} | ${format(metrics.absoluteError.rms)} | ${format(metrics.relativeError.max)} | ${format(metrics.relativeError.rms)} | not run | | | |`);
        }
      }
    }
    for (const comparison of fixture.comparisons) {
      const old = previous?.comparisons.find(entry => entry.analysis === comparison.analysis);
      for (const [signal, metrics] of Object.entries(comparison.metrics.signals).sort()) {
        if (metrics.status !== 'compared') continue;
        const prior = old?.metrics.signals[signal];
        const priorCompared = prior?.status === 'compared' ? prior : undefined;
        if (priorCompared && JSON.stringify(priorCompared) === JSON.stringify(metrics)) continue;
        lines.push(`| ${fixture.key} | ${comparison.analysis} | ${signal} | ${format(priorCompared?.absoluteError.max ?? null)} | ${format(priorCompared?.absoluteError.rms ?? null)} | ${format(priorCompared?.relativeError.max ?? null)} | ${format(priorCompared?.relativeError.rms ?? null)} | ${format(metrics.absoluteError.max)} | ${format(metrics.absoluteError.rms)} | ${format(metrics.relativeError.max)} | ${format(metrics.relativeError.rms)} |`);
      }
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
