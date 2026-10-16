import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

const stage = [
  'OTA finite resistances',
  'vin source 0 DC 0.2 AC 1',
  'rs source inp 1k',
  'a1 inp 0 out amp',
  '.model amp ota (gm=2m rin=9k rout=4k)',
  'rl out 0 4k',
];

describe('ngspice-47 OTA (#1223)', () => {
  it('loads rin/rout and produces the analytic negative gm * R gain in DC', async () => {
    const dc = (await simulate([...stage, '.op', '.end'].join('\n'))).dc!;
    expect(dc.voltage('inp')).toBeCloseTo(0.18, 12);
    expect(dc.voltage('out')).toBeCloseTo(-0.72, 12);
    expect(dc.current('vin')).toBeCloseTo(-0.00002, 12);
  });

  it('uses the same conductance matrix in AC', async () => {
    const ac = (await simulate([...stage, '.ac dec 1 10 1k', '.end'].join('\n'))).ac!;
    for (const point of ac.voltage('out')) {
      expect(point.magnitude).toBeCloseTo(3.6, 12);
      expect(Math.abs(point.phase)).toBeCloseTo(180, 12);
    }
  });

  it('runs the byte-unchanged corpus-f programmatic noise deck', async () => {
    const deck = readFileSync(new URL('../../../../../benchmarks/corpus/corpus-f/fixtures/examples/xspice/noise/ota_noise_test1.cir', import.meta.url), 'utf8');
    const result = await simulate(deck);
    expect(result.noise).toBeDefined();
    // ngspice-47, identical bytes via corpus-f runControlReference (71 frequencies).
    expect(result.noise!.frequencies).toHaveLength(71);
    expect(result.noise!.inputNoiseDensity[0]).toBeCloseTo(8.952993182831182e-6, 13);
    expect(result.noise!.outputNoiseDensity[0]).toBeCloseTo(8.864349685962606e-9, 16);
    expect(result.noise!.integratedInputNoise).toBeCloseTo(7.627871183340022e-4, 10);
    expect(result.noise!.integratedOutputNoise).toBeCloseTo(7.552347706269699e-7, 13);
  });

  it.each([
    ['en=2n enk=100', 2e-9 * 2],
    ['in_noise=3p ink=100', 3e-12 * (9000 * 2000 / 11000) * 2],
    ['incm=4p incmk=100', Math.sqrt(2) * 4e-12 * (9000 / 11000) * 1000 * 2],
    ['en=2n in_noise=3p incm=4p noise_programmatic=false', 0],
  ])('stamps independent white/flicker sources: %s', async (params, whiteOutput) => {
    const noise = (await simulate([
      'differential OTA noise',
      'vp p 0 DC 0 AC 1', 'vn n 0 0',
      'rp p inp 1k noisy=0', 'rn n inn 1k noisy=0',
      'a1 inp inn out amp',
      `.model amp ota (gm=2m rin=9k rout=2k ${params})`,
      'rl out 0 2k noisy=0',
      '.noise v(out) vp dec 1 10 1k', '.end',
    ].join('\n'))).noise!;
    noise.frequencies.forEach((frequency, i) => {
      const expected = whiteOutput * Math.sqrt(1 + 100 / frequency);
      expect(noise.outputNoiseDensity[i]).toBeCloseTo(expected, 18);
    });
  });

  it('defaults to gm=1m and effectively infinite rin/rout without clipping', async () => {
    const dc = (await simulate('default OTA\nvin inp 0 100\na1 inp 0 out amp\n.model amp ota\nrl out 0 1k\n.op\n.end')).dc!;
    expect(dc.voltage('out')).toBeCloseTo(-100 / (1 + 1e-9), 9);
  });
});
