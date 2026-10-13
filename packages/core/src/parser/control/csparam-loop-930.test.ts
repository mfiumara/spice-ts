import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

const receipt = new URL('../../../../../benchmarks/control-loop-scalars-20261013/minimal.cir', import.meta.url);

describe('.csparam control constants (#930)', () => {
  it('makes deck constants visible after selecting a new plot, like ngspice-47', async () => {
    const result = await simulate(readFileSync(receipt, 'utf8'));
    expect(result.control?.output).toEqual(['bounds 1000 100 -50']);
    expect(result.control?.runs).toHaveLength(1);
  });

  it('already preserves let constants across new plots without .csparam', async () => {
    const deck = readFileSync(receipt, 'utf8')
      .replace(/\.csparam[^\n]*\n/g, '')
      .replace('.control\n', '.control\nlet start = 1k\nlet end = 0.1k\nlet delta = 0.05k\n');
    const result = await simulate(deck);
    expect(result.control?.output).toEqual(['bounds 1000 100 -50']);
    expect(result.control?.runs).toHaveLength(1);
  });
});
