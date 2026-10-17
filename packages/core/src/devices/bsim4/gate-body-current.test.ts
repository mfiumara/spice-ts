import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';
import { parse } from '../../parser/index.js';
import { BSIM4 } from './device.js';

const base = new URL('../../../../../benchmarks/bsim4-igb/', import.meta.url);

describe('BSIM4 IGBMOD=1 gate-body tunneling', () => {
  for (const deck of ['n-acc.cir', 'n-inv.cir', 'p-acc.cir', 'p-inv.cir']) {
    it(`${deck}: accepts IGBMOD=1 and stamps nonzero gate-body current`, async () => {
      const result = (await simulate(readFileSync(new URL(deck, base), 'utf8'))).dcSweep!;
      expect(Math.max(...result.current('Vg').map(Math.abs))).toBeGreaterThan(1e-9);
    });
  }
});
