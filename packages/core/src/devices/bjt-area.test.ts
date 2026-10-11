import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * #641: ngspice-47 bjttemp.c scales the B-C saturation current by the base
 * area (SUBS = 1, vertical) or the collector area (SUBS = -1, lateral) on top
 * of tSatCur, which already carries AREA:
 *
 *   BCtSatCur = AREA*IS*exp(factlog) * (SUBS == 1 ? AREAB : AREAC)
 *
 * and bjtsetup.c defaults AREAB and AREAC to AREA, so a card with only area=2
 * has a B-C saturation current of 4*IS. tBCcap (CJC) takes the same area
 * factor and tSubcap (CJS) the other one.
 *
 * Every reference below is ngspice-47 `ngspice -b` on the identical deck with
 * `.control / set numdgt=12 / op / print v(c) v(b) / .endc` in place of `.op`.
 * Where default-tolerance ngspice stops its Newton loop within VNTOL (1 uV)
 * of the converged point (forward-biased B-C with a B-C current different
 * from the B-E one), the deck is also pinned against ngspice rerun with
 * `.options reltol=1e-9 vntol=1e-12 abstol=1e-18`, which agrees with spice-ts
 * to ~1e-11 V.
 */
const deck = (title: string, instance: string, model: string, extra = '') => `${title}
Vcc vcc 0 5
Rc vcc c 1k
Rb vcc b 10k
Q1 c b 0 ${instance}
.model ${model}
${extra}
.op
.end
`;

const operatingPoint = async (netlist: string) => {
  const { dc } = await simulate(netlist);
  return { vc: dc!.voltage('c'), vb: dc!.voltage('b') };
};

describe('BJT AREAB/AREAC B-C scaling matches ngspice-47 (#641)', () => {
  it('defaults AREAB to AREA, so area=2 has a B-C saturation current of IS*AREA^2', async () => {
    // Issue repro. Before #641 spice-ts gave v(c)=0.06868815 (B-C current IS*AREA).
    const { vc, vb } = await operatingPoint(deck('areab default', 'QN area=2', 'QN NPN IS=1e-14 BF=200'));
    expect(vc).toBeCloseTo(8.653048239187e-02, 9);
    expect(vb).toBeCloseTo(6.822964601181e-01, 9);
  });

  it('scales the B-C saturation current by an explicit areab=1 areac=1', async () => {
    const { vc, vb } = await operatingPoint(
      deck('areab explicit', 'QN area=2 areab=1 areac=1', 'QN NPN IS=1e-14 BF=200'),
    );
    expect(vc).toBeCloseTo(6.868815130751e-02, 9);
    expect(vb).toBeCloseTo(6.823761498275e-01, 9);
  });

  it('applies the temperature law to the B-C current in forward-active at TEMP=85 TNOM=-10', async () => {
    const { vc, vb } = await operatingPoint(deck(
      'forward active hot',
      'QN area=2',
      'QN NPN IS=1e-14 BF=200 BR=5 VAF=30 TNOM=-10',
      '.options TEMP=85',
    ).replace('Rb vcc b 10k', 'Rb vcc b 470k'));
    // Before #641: v(c)=2.856116873863.
    expect(vc).toBeCloseTo(2.855204732285e+00, 8);
    expect(vb).toBeCloseTo(3.521337269371e-01, 8);
  });

  it('applies the temperature law to the B-C current in saturation at TEMP=85 TNOM=-10', async () => {
    const { vc, vb } = await operatingPoint(deck(
      'saturated hot',
      'QN area=2',
      'QN NPN IS=1e-14 BF=200 BR=5 VAF=30 TNOM=-10',
      '.options TEMP=85',
    ));
    // Before #641: v(c)=0.03933344293663.
    expect(vc).toBeCloseTo(6.061522344659e-02, 9);
    expect(vb).toBeCloseTo(3.933970604902e-01, 9);
  });

  it('uses AREAC for the B-C junction of a lateral NPN (SUBS=-1)', async () => {
    const { vc, vb } = await operatingPoint(
      deck('lateral npn areac', 'QN area=2 areab=1 areac=3', 'QN NPN IS=1e-14 BF=200 SUBS=-1'),
    );
    // Default tolerances: 9.696781087195e-02 / 6.822501655948e-01 (within VNTOL).
    expect(Math.abs(vc - 9.696781087195e-02)).toBeLessThan(1e-6);
    expect(Math.abs(vb - 6.822501655948e-01)).toBeLessThan(1e-6);
    // Tight tolerances.
    expect(vc).toBeCloseTo(9.696746357285e-02, 9);
  });

  it('uses AREAC for the B-C junction of a PNP, which is lateral by default', async () => {
    const { vc, vb } = await operatingPoint(deck(
      'pnp lateral areac',
      'QP area=2 areab=3 areac=0.5',
      'QP PNP IS=1e-14 BF=100 BR=2',
    ).replace('Vcc vcc 0 5', 'Vee 0 vcc 5'));
    // Default tolerances: -3.64699638532e-02 / -6.83859373294e-01 (within VNTOL).
    expect(Math.abs(vc - -3.64699638532e-02)).toBeLessThan(1e-6);
    expect(Math.abs(vb - -6.83859373294e-01)).toBeLessThan(1e-6);
    // Tight tolerances.
    expect(vc).toBeCloseTo(-3.64699476995e-02, 9);
  });

  it('keeps an area=1 card bit-identical to one without instance parameters', async () => {
    const model = 'QN NPN IS=1e-14 BF=200 BR=5 VAF=30 CJC=2p CJS=1p TNOM=-10';
    const bare = await operatingPoint(deck('bare', 'QN', model, '.options TEMP=85'));
    const unit = await operatingPoint(deck('unit', 'QN area=1 areab=1 areac=1 m=1', model, '.options TEMP=85'));
    expect(unit.vc).toBe(bare.vc);
    expect(unit.vb).toBe(bare.vb);
  });

  it('scales CJC by AREAB and CJS by AREAC on a vertical NPN in AC', async () => {
    const result = await simulate(`ac junction caps areab areac
Vcc vcc 0 5
Vin in 0 dc 0 ac 1
Rs in b1 50
Cb b1 b 1u
Rb vcc b 470k
Rc vcc c 2k
Q1 c b 0 sub QN area=2 areab=3 areac=5
Vsub sub 0 -2
.model QN NPN IS=1e-15 BF=150 CJE=1p CJC=2p CJS=3p RB=0
.ac dec 1 1e6 1e9
.end
`);
    // ngspice-47 `print vm(c) vp(c)` (vp in radians); .op v(c)=2.258448502394.
    const reference = [
      [1e6, 9.740833553433e+01, 2.779395105562e+00],
      [1e7, 2.669065966269e+01, 1.812421636567e+00],
      [1e8, 2.741639814275e+00, 1.421133238903e+00],
      [1e9, 1.896061751229e-01, 2.100556143242e-01],
    ] as const;
    const output = result.ac!.voltage('c');
    reference.forEach(([frequency, magnitude, phase], index) => {
      expect(result.ac!.frequencies[index]).toBeCloseTo(frequency, 0);
      expect(Math.abs(output[index].magnitude - magnitude) / magnitude).toBeLessThan(1e-6);
      expect(Math.abs(output[index].phase * Math.PI / 180 - phase)).toBeLessThan(1e-6);
    });
  });
});
