import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Data shape: paired first-two-step source currents in amperes from ngspice-47.
const input = readFileSync(new URL('../../../../benchmarks/results/issue-1059-gm17/storage-write.cir', import.meta.url), 'utf8');
const stock = {
  vdi: [-7.368067749650213e-12, -5.695999017856642e-12],
  vwr: [-5.597917265347728e-12, -3.505559294432208e-12],
};
const noRetainedShunt = {
  vdi: [5.48235377968058e-15, 6.197059851806609e-15],
  vwr: [-4.431203949439875e-15, -5.950723982174462e-15],
};
const parity = process.env.ISSUE1059_GM17_RED === '1' ? it : it.fails;

describe('gm17 constrained startup #1059 (evidence only)', () => {
  parity('reproduces stock ngspice source-stepping startup current loss', async () => {
    const result = (await simulate(input)).transient!;
    expect(result.time[1]).toBeCloseTo(1.6e-12, 24);
    expect(result.time[2]).toBeCloseTo(3.2e-12, 24);
    // Uniform corpus threshold: 1% of the 1e-10 A current floor, not a tuned floor.
    for (const source of ['vdi', 'vwr'] as const) {
      for (let point = 1; point <= 2; point++) {
        expect(Math.abs(result.current(source)[point] - stock[source][point - 1])).toBeLessThanOrEqual(1e-12);
      }
    }
  });

  it('agrees with the native-only retained-diagonal-shunt control at both steps', async () => {
    const result = (await simulate(input)).transient!;
    for (const source of ['vdi', 'vwr'] as const) {
      for (let point = 1; point <= 2; point++) {
        expect(Math.abs(result.current(source)[point] - noRetainedShunt[source][point - 1])).toBeLessThanOrEqual(1e-12);
      }
    }
  });
});
