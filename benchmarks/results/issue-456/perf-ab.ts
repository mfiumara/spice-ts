#!/usr/bin/env tsx
/**
 * Issue #456 interleaved A/B transient timing. Loads two built @spice-ts/core
 * dist trees in one process and alternates them round by round, so host load
 * affects both sides equally (the vitest bench files run one side at a time).
 *
 * Usage: npx tsx benchmarks/results/issue-456/perf-ab.ts <base-checkout> <change-checkout> [rounds]
 * Each checkout must have `packages/core/dist` built. Prints median wall time
 * per circuit and side, plus the transient point count of each side.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cmosInverterChain, cmosRingOscillator, lcLadder, rcChain } from '../../circuits/generators.js';
import { cmosInverterSingle } from '../../circuits/spice3-reference.js';

type Simulate = (netlist: string, options?: Record<string, unknown>) => Promise<{
  transient?: { time: ArrayLike<number> };
}>;

interface Case {
  name: string;
  netlist: string;
  options?: Record<string, unknown>;
}

const [baseRoot, changeRoot, roundsArg] = process.argv.slice(2);
if (!baseRoot || !changeRoot) throw new Error('usage: perf-ab.ts <base-checkout> <change-checkout> [rounds]');
const rounds = Number(roundsArg ?? 7);

async function load(root: string): Promise<Simulate> {
  const core = await import(pathToFileURL(resolve(root, 'packages/core/dist/index.js')).href);
  return core.simulate as Simulate;
}

async function corpus(name: string, path: string): Promise<Case> {
  return { name, netlist: await readFile(resolve(path), 'utf8') };
}

async function main(): Promise<void> {
  const euler = { integrationMethod: 'euler' };
  const cases: Case[] = [
    // packages/core/src/benchmarks/{transient,nonlinear,spice3}.bench.ts transient cases.
    { name: 'bench RC chain 10', netlist: rcChain(10) },
    { name: 'bench RC chain 100', netlist: rcChain(100) },
    { name: 'bench LC ladder 50 (euler)', netlist: lcLadder(50), options: euler },
    { name: 'bench CMOS inverter chain 10 (euler)', netlist: cmosInverterChain(10), options: euler },
    { name: 'bench ring oscillator 5 (euler)', netlist: cmosRingOscillator(5), options: euler },
    { name: 'bench ring oscillator 11 (euler)', netlist: cmosRingOscillator(11), options: euler },
    { name: 'bench CMOS inverter single (euler)', netlist: cmosInverterSingle(), options: euler },
    // Aggregate TRAN fixtures whose devices now integrate their own charge.
    await corpus('corpus bjt-differential-pair', 'benchmarks/corpus/classic/fixtures/spice3f5/diffpair.cir'),
    await corpus('corpus rtl-inverter-chain', 'benchmarks/corpus/corpus-e/fixtures/tests/d_bjt-rtlinv.ckt'),
    await corpus('corpus mos6-inverter-transient', 'benchmarks/corpus/ngspice/fixtures/tests/mos6/mos6inv.cir'),
    await corpus('corpus hfet-inverter', 'benchmarks/corpus/ngspice/fixtures/tests/hfet/inverter.cir'),
    await corpus('corpus mesa-oscillator', 'benchmarks/corpus/ngspice/fixtures/tests/mesa/mesosc.cir'),
  ];

  const sides: Array<[string, Simulate]> = [['base', await load(baseRoot)], ['change', await load(changeRoot)]];
  const samples = new Map<string, number[]>();
  const points = new Map<string, number>();

  async function runOnce(label: string, simulate: Simulate, item: Case): Promise<void> {
    const start = performance.now();
    let count = -1;
    try {
      const result = await simulate(item.netlist, item.options);
      count = result.transient?.time.length ?? -1;
    } catch {
      count = -2; // same failure handling as the bench files: time the attempt
    }
    const elapsed = performance.now() - start;
    const key = `${item.name}|${label}`;
    samples.set(key, [...(samples.get(key) ?? []), elapsed]);
    points.set(key, count);
  }

  for (const item of cases) {
    // Warm-up both sides once (JIT), then alternate the order every round.
    for (const [label, simulate] of sides) await runOnce(`${label}-warmup`, simulate, item);
    for (let round = 0; round < rounds; round++) {
      const order = round % 2 === 0 ? sides : [...sides].reverse();
      for (const [label, simulate] of order) await runOnce(label, simulate, item);
    }
  }

  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  const rows = cases.map(item => {
    const base = median(samples.get(`${item.name}|base`)!);
    const change = median(samples.get(`${item.name}|change`)!);
    return {
      circuit: item.name,
      baseMedianMs: Number(base.toFixed(2)),
      changeMedianMs: Number(change.toFixed(2)),
      deltaPercent: Number(((change / base - 1) * 100).toFixed(1)),
      basePoints: points.get(`${item.name}|base`),
      changePoints: points.get(`${item.name}|change`),
    };
  });
  process.stdout.write(`${JSON.stringify({ rounds, rows }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
