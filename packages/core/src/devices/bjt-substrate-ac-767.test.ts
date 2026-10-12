import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * Issue #767: ngspice-47 bjtacld.c (and bjtpzld.c) build the AC matrix from
 * the bjtload.c state without the substrate diode conductance gdsub, so the
 * substrate terminal of a BJT only sees the substrate capacitance in AC, noise
 * and pole-zero, even when the ISS junction conducts at the operating point.
 * The DC operating point keeps the diode (bjtload.c).
 *
 * The deck makes the lateral PNP substrate junction forward biased (vsub =
 * +0.85 V); ngspice-47 `ngspice -b` on these bytes printed the values below.
 */
const DECK = readFileSync(
  new URL('../../../../benchmarks/results/issue-767/decks/lateral-pnp-substrate-ac.cir', import.meta.url),
  'utf8',
);

function rectangular(point: { magnitude: number; phase: number }): [number, number] {
  const radians = point.phase * Math.PI / 180;
  return [point.magnitude * Math.cos(radians), point.magnitude * Math.sin(radians)];
}

describe('BJT AC matrix omits the substrate diode conductance like ngspice-47 bjtacld.c (#767)', () => {
  it('keeps the forward-biased ISS diode in the operating point', async () => {
    const result = await simulate(DECK);
    expect(result.dc!.current('vs')).toBeCloseTo(-8.98424298426e-03, 9);
    expect(result.dc!.current('vb')).toBeCloseTo(9.003395439937e-03, 9);
  });

  it('stamps only the substrate capacitance in AC', async () => {
    const result = await simulate(DECK);
    const frequencies = [1e6, 1e7, 1e8, 1e9];
    expect(result.ac!.frequencies.length).toBe(frequencies.length);
    frequencies.forEach((frequency, index) => {
      expect(result.ac!.frequencies[index]).toBeCloseTo(frequency, -1);
    });
    const substrate = result.ac!.current('vs');
    const base = result.ac!.current('vb');
    frequencies.forEach((frequency, index) => {
      const capacitive = 1.979203371762e-06 * frequency / 1e6;
      const [sRe, sIm] = rectangular(substrate[index]);
      // ngspice: 0 + j*omega*CJS. With gdsub stamped, Re was about -0.35 S.
      expect(Math.abs(sRe), `Re i(vs) @ ${frequency}`).toBeLessThan(1e-12);
      expect(Math.abs(sIm - capacitive), `Im i(vs) @ ${frequency}`).toBeLessThan(1e-9 * capacitive);
      const [bRe, bIm] = rectangular(base[index]);
      expect(Math.abs(bRe - -7.40480088099e-04), `Re i(vb) @ ${frequency}`).toBeLessThan(1e-6 * 7.40480088099e-04);
      expect(Math.abs(bIm + capacitive), `Im i(vb) @ ${frequency}`).toBeLessThan(1e-6 * capacitive);
    });
  });
});
