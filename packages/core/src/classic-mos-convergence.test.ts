import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

const classicFixtureRoot = new URL('../../../benchmarks/corpus/classic/fixtures/spice3f5/', import.meta.url);

const fixtures = [
  ['mos6inv.cir', 3_616, '60f1f49e2f9ac1eccf6bbf717b3c177de885e1e2438b175db4a4360bfe080434', 150e-9],
  ['mosamp2.cir', 1_371, 'd8b0e627f7742490ac6e841ffb176c9b02ffe6de1246bb57d1db793f58027469', 10e-6],
  ['mosmem.cir', 750, 'f63d832e7e63dd866e528d6e41eb653859243fdbfed48a83e55d9274e111859d', 2e-6],
] as const;

describe('classic MOS transient convergence (issue #302)', () => {
  for (const [filename, expectedBytes, expectedSha256, stopTime] of fixtures) {
    it(`completes the unchanged ${filename} fixture`, { timeout: 30_000 }, async () => {
      const bytes = readFileSync(new URL(filename, classicFixtureRoot));
      expect(bytes.byteLength).toBe(expectedBytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedSha256);

      const result = await simulate(bytes.toString('utf8'));

      expect(result.transient).toBeDefined();
      expect(result.transient!.time.at(-1)).toBeCloseTo(stopTime, 12);
      expect(result.convergence!.transient.failure).toBeNull();
    });
  }
});
