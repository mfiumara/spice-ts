#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTransientSim, simulate } from '../packages/core/dist/index.js';

const fixturePath = resolve('benchmarks/corpus/ngspice/fixtures/examples/wave/jimi_fuzz.cir');
const fixtureBytes = readFileSync(fixturePath);
const fixture = fixtureBytes.toString('utf8');
const identity = {
  bytes: fixtureBytes.byteLength,
  sha256: createHash('sha256').update(fixtureBytes).digest('hex'),
};
if (
  identity.bytes !== 1_009
  || identity.sha256 !== '0607c7f358628d0ce60eff584b329a4d685ae215894c466622a19357c7163b0e'
) {
  throw new Error(`jimi-fuzz fixture identity changed: ${JSON.stringify(identity)}`);
}

function memory(): { heapUsedMiB: number; rssMiB: number; maxRssMiB: number } {
  const current = process.memoryUsage();
  return {
    heapUsedMiB: current.heapUsed / 2 ** 20,
    rssMiB: current.rss / 2 ** 20,
    maxRssMiB: process.resourceUsage().maxRSS / 1024,
  };
}

async function streamProfile(): Promise<void> {
  const maximumPoints = Number(process.env.MAX_POINTS ?? 1_000_000);
  const sim = await createTransientSim(fixture);
  let points = 1;
  const started = performance.now();
  try {
    while (!sim.isDone && points < maximumPoints) {
      sim.advance();
      points++;
    }
    process.stdout.write(`${JSON.stringify({
      mode: 'stream',
      input: identity,
      completed: sim.isDone,
      points,
      stopTimeSeconds: sim.simTime,
      wallTimeMs: performance.now() - started,
      memory: memory(),
      convergence: sim.convergence,
    }, null, 2)}\n`);
  } finally {
    sim.dispose();
  }
}

async function oneShotProfile(): Promise<void> {
  const started = performance.now();
  const result = await simulate(fixture);
  process.stdout.write(`${JSON.stringify({
    mode: 'one-shot',
    input: identity,
    completed: result.transient?.time.at(-1) === 5,
    points: result.transient?.time.length,
    stopTimeSeconds: result.transient?.time.at(-1),
    wallTimeMs: performance.now() - started,
    memory: memory(),
    convergence: result.convergence,
  }, null, 2)}\n`);
}

if (process.argv.includes('--stream')) {
  void streamProfile();
} else if (process.argv.includes('--one-shot')) {
  void oneShotProfile();
} else {
  throw new Error('use --stream or --one-shot');
}
