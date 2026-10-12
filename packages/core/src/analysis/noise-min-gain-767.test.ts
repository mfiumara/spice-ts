import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * Issue #767: ngspice-47 noisean.c divides by MAX(|gain|^2, N_MINGAIN) with
 * N_MINGAIN = 1e-20 (noisedef.h), so input-referred noise stops growing once
 * the input-to-output gain falls below 1e-10. The deck's divider has a gain of
 * about 1e-11; ngspice-47 `ngspice -b` on these bytes printed the values below.
 */
const DECK = readFileSync(
  new URL('../../../../benchmarks/results/issue-767/decks/noise-min-gain.cir', import.meta.url),
  'utf8',
);

const relative = (actual: number, expected: number) => Math.abs(actual - expected) / Math.abs(expected);

describe('.noise floors |gain|^2 at ngspice-47 N_MINGAIN (#767)', () => {
  it('refers output noise to the input through a gain of at least 1e-10', async () => {
    const noise = (await simulate(DECK)).noise!;
    expect(noise.inputNoiseDensity.length).toBe(2);
    for (let index = 0; index < 2; index++) {
      expect(relative(noise.outputNoiseDensity[index], 1.287480723388e-10)).toBeLessThan(1e-6);
      expect(relative(noise.inputNoiseDensity[index], 1.287480723388e+00)).toBeLessThan(1e-6);
    }
    expect(relative(noise.integratedOutputNoise!, 1.221411458840e-08)).toBeLessThan(1e-6);
    expect(relative(noise.integratedInputNoise!, 1.221411458840e+02)).toBeLessThan(1e-6);
  });
});
