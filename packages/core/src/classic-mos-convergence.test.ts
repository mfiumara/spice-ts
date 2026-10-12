import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

const classicFixtureRoot = new URL('../../../benchmarks/corpus/classic/fixtures/spice3f5/', import.meta.url);

const fixtures = [
  ['mos6inv.cir', 3_616, '60f1f49e2f9ac1eccf6bbf717b3c177de885e1e2438b175db4a4360bfe080434', 150e-9, 120_000],
  ['mosmem.cir', 750, 'f63d832e7e63dd866e528d6e41eb653859243fdbfed48a83e55d9274e111859d', 2e-6, 30_000],
] as const;

describe('classic MOS transient convergence (issue #302)', () => {
  for (const [filename, expectedBytes, expectedSha256, stopTime, timeout] of fixtures) {
    it(`completes the unchanged ${filename} fixture`, { timeout }, async () => {
      const bytes = readFileSync(new URL(filename, classicFixtureRoot));
      expect(bytes.byteLength).toBe(expectedBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedSha256);

      const result = await simulate(bytes.toString('utf8'));

      expect(result.transient).toBeDefined();
      expect(result.transient!.time.at(-1)).toBeCloseTo(stopTime, 12);
      expect(result.convergence!.transient.failure).toBeNull();
    });
  }

  // mosamp2.cir uses LEVEL=2 (MOS2) cards: rejected since #530, run by the
  // ngspice-47 mos2 port since #565.
  it('completes the unchanged LEVEL=2 mosamp2.cir fixture with MOS2 and settles at the ngspice-47 v(5)', { timeout: 60_000 }, async () => {
    const bytes = readFileSync(new URL('mosamp2.cir', classicFixtureRoot));
    expect(bytes.byteLength).toBe(1_371);
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('d8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469');
    const result = await simulate(bytes.toString('utf8'));
    expect(result.convergence!.transient.failure).toBeNull();
    const transient = result.transient!;
    expect(transient.time.at(-1)).toBeCloseTo(10e-6, 12);
    // ngspice-47 v(5) at 10 us (settled after the 5 us edge) is 9.463960706.
    expect(transient.voltage('5').at(-1)).toBeCloseTo(9.463960706, 6);
  });
});
