import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { simulate } from '../simulate.js';

it('selects the ngspice-47 DFF operating point without nodesets (#1309)', async () => {
  const reference = JSON.parse(readFileSync('../../benchmarks/vbic-op/ngspice-47.json', 'utf8')) as {
    version: string; deck: string; sha256: string; signals: Record<string, { re: number }[]>;
  };
  expect(reference.version).toBe('ngspice-47');
  expect(createHash('sha256').update(reference.deck).digest('hex')).toBe(reference.sha256);
  const result = (await simulate(reference.deck)).dc!;
  for (const node of ['q', 'net10', 'net6', 'net11']) {
    const expected = reference.signals[`v(${node})`][0].re;
    expect(Math.abs(result.voltage(node) - expected), node).toBeLessThan(1e-3 * Math.abs(expected) + 1e-6);
  }
});
