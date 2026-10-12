#!/usr/bin/env tsx
/**
 * Record a spice-ts transient waveform for benchmarks/adder-timeout-611/compare.ts.
 *
 *   pnpm exec tsx benchmarks/bsim3-charge-626/adder-run.ts <deck.cir> <out.json> [--core <dist/index.js>]
 *
 * Runs the deck bytes unchanged through simulate() and writes { grid, signals }
 * with the adder outputs v(9)..v(13), the inputs v(1), v(2) and every branch
 * current (i(vcc), i(vin*)). Prints the point count, wall time and the
 * convergence statistics.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function main(): Promise<void> {
  const [deckPath, outPath] = process.argv.slice(2);
  if (!deckPath || !outPath) {
    console.error('usage: adder-run.ts <deck.cir> <out.json> [--core <dist/index.js>]');
    process.exit(2);
  }
  const coreIndex = process.argv.indexOf('--core');
  const corePath = resolve(coreIndex >= 0 ? process.argv[coreIndex + 1] : 'packages/core/dist/index.js');
  const core = await import(pathToFileURL(corePath).href) as typeof import('../../packages/core/src/index.js');
  const started = performance.now();
  const result = await core.simulate(readFileSync(deckPath, 'utf8'));
  const wallMs = performance.now() - started;
  const transient = result.transient!;
  const signals: Record<string, number[]> = {};
  for (const [node, values] of transient.voltages) {
    if (/^(1|2|9|10|11|12|13)$/.test(node)) signals[`v(${node.toLowerCase()})`] = values;
  }
  for (const [branch, values] of transient.currents) signals[`i(${branch.toLowerCase()})`] = values;
  writeFileSync(outPath, JSON.stringify({ grid: transient.time, signals }));
  console.log(JSON.stringify({ points: transient.time.length, wallMs: Math.round(wallMs), convergence: result.convergence }));
}

void main();
