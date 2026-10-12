#!/usr/bin/env tsx
/**
 * Issue #715 residual diagnostics for the two MOS3 transient decks that stay
 * above the 1% corpus threshold (subckt_a0.cir, invert42_mos3.cir): the 2.5 V
 * crossing times of the output in ngspice-47 and spice-ts on the identical
 * deck. A model error would shift every edge the same way; step-control noise
 * scatters them around zero.
 *
 * Usage (repository root):  pnpm exec tsx benchmarks/results/issue-715/edges.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { simulate } from '../../../packages/core/src/index.js';

const DECKS = [
  ['benchmarks/corpus/corpus-g/fixtures/SUBCKT/subckt_a0.cir', 'OUT'],
  ['benchmarks/corpus/corpus-g/fixtures/MOS13_IC/invert42_mos3.cir', 'VOUT'],
] as const;

function deckText(path: string): string {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  return execFileSync('git', ['show', `origin/bench/711-corpus-g:${path}`], { encoding: 'utf8' });
}

function crossings(time: ArrayLike<number>, values: ArrayLike<number>, level: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < time.length; i++) {
    if ((values[i - 1] - level) * (values[i] - level) < 0) {
      out.push(time[i - 1] + (level - values[i - 1]) * (time[i] - time[i - 1]) / (values[i] - values[i - 1]));
    }
  }
  return out;
}

async function main(): Promise<void> {
  const scratch = mkdtempSync(resolve(tmpdir(), 'spice-ts-715-edges-'));
  try {
    for (const [path, node] of DECKS) {
      const text = deckText(path);
      const deck = resolve(scratch, 'deck.cir');
      const data = resolve(scratch, 'ng.txt');
      writeFileSync(deck, text.replace(/^\.end\s*$/im,
        `.control\nset wr_singlescale\nset numdgt=15\nrun\nwrdata ${data} v(${node})\n.endc\n.end`));
      execFileSync('ngspice', ['-b', deck], { stdio: 'ignore' });
      const rows = readFileSync(data, 'utf8').trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
      const reference = crossings(rows.map(row => row[0]), rows.map(row => row[1]), 2.5);
      const result = await simulate(text);
      const transient = result.transient!;
      const ours = crossings(transient.time, transient.voltage(node), 2.5);
      const deltas = reference.map((at, index) => (ours[index] - at) * 1e12);
      const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
      const worst = Math.max(...deltas.map(Math.abs));
      console.log(`${path} v(${node}): ${reference.length} ngspice / ${ours.length} spice-ts crossings of 2.5 V,`
        + ` timing delta mean ${mean.toFixed(1)} ps, worst |delta| ${worst.toFixed(1)} ps`);
      console.log(`  per edge (ps): ${deltas.map(value => value.toFixed(0)).join(' ')}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

void main();
