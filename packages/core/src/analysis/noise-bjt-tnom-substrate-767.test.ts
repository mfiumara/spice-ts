import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * Issue #767: ngspice-47 bjtnoise.c has no substrate-diode source, and its AC
 * matrix (bjtacld.c) has no gdsub, so ISS/NS and the substrate capacitance only
 * act through the operating point and the CJS small-signal capacitance. TNOM
 * only moves the bjttemp.c parameters the DC and AC solves already use; the
 * noise sources stay at the 27 C circuit temperature (.options TEMP is still
 * rejected with .noise). The deck forward-biases the substrate junction
 * (16 uA). Reference: ngspice-47 `ngspice -b` on these bytes, `set numdgt=12`.
 */
const DECK = readFileSync(
  new URL('../../../../benchmarks/results/issue-767/decks/bjt-noise-tnom-substrate.cir', import.meta.url),
  'utf8',
);

const ONOISE = [
  1.406731643609e-06, 3.820819489481e-07, 8.471997850590e-08, 3.460205212205e-08, 2.992295169659e-08,
  2.952267046501e-08, 2.946861170537e-08, 2.945732200561e-08, 2.945420481920e-08, 2.945245822742e-08,
  2.944378733096e-08, 2.936020018621e-08, 2.856248533351e-08, 2.304732413560e-08, 1.088912097879e-08,
];
const INOISE = [
  1.485166137163e-07, 2.738750827387e-08, 5.706600174580e-09, 2.315254411853e-09, 2.000827684676e-09,
  1.973929848427e-09, 1.970302214737e-09, 1.969546611621e-09, 1.969343676061e-09, 1.969283029839e-09,
  1.969264474581e-09, 1.969261400862e-09, 1.969288025728e-09, 1.969572329450e-09, 1.972416051932e-09,
];

const relative = (actual: number, expected: number) => Math.abs(actual - expected) / Math.abs(expected);

describe('.noise accepts BJT TNOM and substrate (ISS/NS/CJS/VJS/MJS) parameters like ngspice-47 (#767)', () => {
  it('matches the ngspice-47 operating point, spectra and totals', async () => {
    const result = await simulate(DECK);
    expect(relative(result.dc!.voltage('c'), 3.348098248914e+00)).toBeLessThan(1e-6);
    expect(relative(result.dc!.current('vs'), -1.62449400080e-05)).toBeLessThan(1e-5);
    const noise = result.noise!;
    expect(noise.outputNoiseDensity.length).toBe(ONOISE.length);
    ONOISE.forEach((expected, index) => {
      expect(relative(noise.outputNoiseDensity[index], expected), `onoise ${index}`).toBeLessThan(1e-4);
      expect(relative(noise.inputNoiseDensity[index], INOISE[index]), `inoise ${index}`).toBeLessThan(1e-4);
    });
    expect(relative(noise.integratedOutputNoise!, 1.963521584922e-04)).toBeLessThan(1e-4);
    expect(relative(noise.integratedInputNoise!, 2.599518569767e-05)).toBeLessThan(1e-4);
  });
});
