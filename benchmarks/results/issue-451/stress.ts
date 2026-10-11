#!/usr/bin/env tsx
/**
 * Issue #451 stress receipt: runs every `stress/*.cir` netlist through ngspice-47
 * (`ngspice -b`, printed `.print pz all` table) and through spice-ts `simulate()` on the
 * identical bytes, and prints `{ fixture: { sha256, ngspice, spiceTs } }` as JSON.
 *
 * Usage (from the repository root):
 *   pnpm exec tsx benchmarks/results/issue-451/stress.ts > stress-after.json
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { simulate } from '../../../packages/core/src/index.js';

type Root = [number, number];

function ngspicePz(path: string): Record<string, Root> {
  const output = execFileSync('ngspice', ['-b', path], { encoding: 'utf8', timeout: 30_000 });
  const values: Record<string, Root> = {};
  let names: string[] = [];
  for (const line of output.split('\n')) {
    if (line.startsWith('Index')) {
      names = line.trim().split(/\s+/).slice(1);
    } else if (names.length > 0 && /^0\t/.test(line)) {
      const numbers = line.split('\t').slice(1).map(part => part.trim().replace(/,$/, '')).filter(Boolean).map(Number);
      names.forEach((name, index) => { values[name] = [numbers[2 * index], numbers[2 * index + 1]]; });
      names = [];
    }
  }
  return values;
}

void main();

async function main(): Promise<void> {
  const directory = resolve('benchmarks/results/issue-451/stress');
  const result: Record<string, unknown> = {};
  for (const file of readdirSync(directory).filter(name => name.endsWith('.cir')).sort()) {
    const path = resolve(directory, file);
    const bytes = readFileSync(path);
    let spiceTs: unknown;
    try {
      const { poleZero } = await simulate(bytes.toString('utf8'));
      spiceTs = { poles: poleZero!.poles, zeros: poleZero!.zeros };
    } catch (error) {
      spiceTs = { error: (error as Error).message };
    }
    result[file] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ngspice: ngspicePz(path),
      spiceTs,
    };
  }
  console.log(JSON.stringify(result, null, 2));
}
