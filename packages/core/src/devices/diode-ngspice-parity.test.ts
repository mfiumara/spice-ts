import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { Diode } from './diode.js';

// Reference values come from ngspice-47 (`ngspice -b`, `set numdgt=12`) run on
// the same decks. See issues #402 (thermal voltage) and #404 (model aliases).

// ngspice stops Newton once its reltol/vntol test passes, so its printed node
// voltages carry a few microvolts of residual; the old hardcoded VT=0.02585 was
// off by about 0.4 mV on these decks.
const NGSPICE_NEWTON_RESIDUAL = 1e-5;
// ngspice also ends its breakdown-knee iteration at reltol*IBV (diotemp.c),
// while spice-ts iterates to convergence; this leaves ~1e-5 V in breakdown.
const NGSPICE_BREAKDOWN_RESIDUAL = 2e-5;
// ngspice-47 const.h: CONSTboltz / CHARGE, and CONSTCtoK.
const K_OVER_Q = 1.38064852e-23 / 1.6021766208e-19;
const thermalVoltage = (celsius: number) => K_OVER_Q * (celsius + 273.15);

function expectNear(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

async function operatingPointOut(model: string, options: {
  source?: number;
  resistance?: string;
  instance?: string;
} = {}): Promise<number> {
  const result = await simulate(`diode parity
    V1 in 0 DC ${options.source ?? 5}
    R1 in out ${options.resistance ?? '1k'}
    D1 out 0 DM ${options.instance ?? ''}
    .model DM D ${model}
    .op
    .end
  `);
  return result.dc!.voltage('out');
}

async function acOut(model: string, bias: number): Promise<{ re: number; im: number }> {
  const result = await simulate(`diode ac parity
    V1 in 0 DC ${bias} AC 1
    R1 in out 1k
    D1 out 0 DM
    .model DM D ${model}
    .op
    .ac lin 1 1meg 1meg
    .end
  `);
  const point = result.ac!.voltage('out')[0]!;
  const phase = point.phase * Math.PI / 180;
  return { re: point.magnitude * Math.cos(phase), im: point.magnitude * Math.sin(phase) };
}

describe('diode thermal voltage is kT/q like ngspice (#402)', () => {
  it('matches the ngspice forward operating point at 27 C', async () => {
    const out = await operatingPointOut('IS=1e-14');
    // ngspice-47: v(out) = 6.928909752304e-01
    expectNear(out, 0.6928909752304, NGSPICE_NEWTON_RESIDUAL);
    // Exact KCL residual with VT = kT/q at 300.15 K and GMIN = 1e-12.
    const diodeCurrent = 1e-14 * Math.expm1(out / thermalVoltage(27)) + 1e-12 * out;
    expect(Math.abs((5 - out) / 1000 - diodeCurrent) / diodeCurrent).toBeLessThan(1e-9);
  });

  it('matches the ngspice forward operating point with N=1.8', async () => {
    // ngspice-47: v(out) = 7.972641721820e-01
    expectNear(
      await operatingPointOut('IS=1e-12 N=1.8', { source: 0.8, resistance: '100' }),
      0.797264172182,
      NGSPICE_NEWTON_RESIDUAL,
    );
  });

  it('matches the ngspice forward-bias AC response from the issue deck', async () => {
    // ngspice-47 ac_fwd: v(out) = 9.769781099517e-01, -1.11675027661e-01
    const out = await acOut('IS=1e-20 CJO=10p', 0.8);
    expect(Math.abs(out.re - 0.9769781099517) / 0.9769781099517).toBeLessThan(1e-7);
    expect(Math.abs(out.im + 0.111675027661) / 0.111675027661).toBeLessThan(1e-7);
  });

  it('evaluates kT/q at the device temperature', () => {
    // ngspice-47 `.temp 50` with TNOM=50, so IS is not temperature scaled:
    // v(out) = 7.456461874544e-01, i(V1) = -4.25435381255e-03.
    const voltage = 0.7456461874544;
    const diode = new Diode('D1', [0, -1], { IS: 1e-14, TNOM: 50 });
    diode.setTemperature(50);
    const { current } = diode.noiseOperatingPoint(new Float64Array([voltage]));
    const expected = 1e-14 * Math.expm1(voltage / thermalVoltage(50));
    expect(Math.abs(current - expected) / expected).toBeLessThan(1e-12);
    // Within ngspice's own Newton residual of the source current.
    expect(Math.abs(current - 4.25435381255e-3) / 4.25435381255e-3).toBeLessThan(5e-4);
  });
});

describe('ngspice diode model aliases (#404)', () => {
  it('maps CJ, PB and MJ onto CJO, VJ and M', async () => {
    // ngspice-47 gives the identical result for both decks:
    // v(out) = 9.983829561944e-01, -4.01799449549e-02
    for (const model of ['IS=1e-14 CJO=10p VJ=0.7 M=0.33', 'IS=1e-14 CJ=10p PB=0.7 MJ=0.33']) {
      const out = await acOut(model, -2);
      expect(Math.abs(out.re - 0.9983829561944) / 0.9983829561944).toBeLessThan(1e-8);
      expect(Math.abs(out.im + 0.0401799449549) / 0.0401799449549).toBeLessThan(1e-7);
    }
  });

  it.each(['IKF', 'IK'])('applies the forward knee current %s', async (name) => {
    // ngspice-47: v(out) = 6.768986060417e-01 for both IKF and IK
    // (6.530981302555e-01 without a knee current).
    expectNear(
      await operatingPointOut(`IS=1e-14 ${name}=1m`, { resistance: '4.7k' }),
      0.6768986060417,
      NGSPICE_NEWTON_RESIDUAL,
    );
  });

  it('scales IKF by area with series resistance', async () => {
    // ngspice-47: v(out) = 8.631970690703e-01
    expect(await operatingPointOut('IS=1e-14 IKF=1m RS=5', {
      resistance: '100',
      instance: 'AREA=3',
    })).toBeCloseTo(0.8631970690703, 7);
  });

  it('disables a zero IKF like ngspice', async () => {
    // ngspice-47 ignores IKF below CKTepsmin; the result equals the plain diode.
    expect(await operatingPointOut('IS=1e-14 IKF=0')).toBe(await operatingPointOut('IS=1e-14'));
  });

  it('maps JS onto IS', async () => {
    // ngspice-47: v(out) = 5.744794575794e-01
    expectNear(await operatingPointOut('JS=1e-12'), 0.5744794575794, NGSPICE_NEWTON_RESIDUAL);
  });

  it('maps ISW onto JSW', async () => {
    // ngspice-47: v(out) = 6.158517819818e-01
    expectNear(
      await operatingPointOut('IS=1e-16 ISW=1e-13', { instance: 'PJ=2' }),
      0.6158517819818,
      NGSPICE_NEWTON_RESIDUAL,
    );
  });

  it.each(['IBV', 'IB'])('maps %s onto the breakdown current', async (name) => {
    // ngspice-47: v(out) = -4.98217466360e+00 for both IBV and IB.
    expectNear(
      await operatingPointOut(`IS=1e-14 BV=5 ${name}=10m`, { source: -10 }),
      -4.9821746636,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it.each(['BV', 'VB', 'VRB', 'VAR'])('maps %s onto the breakdown voltage', async (name) => {
    // ngspice-47: v(out) = -5.04141988004e+00 for BV, VB, VRB and VAR.
    expectNear(
      await operatingPointOut(`IS=1e-14 ${name}=5`, { source: -10 }),
      -5.04141988004,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it('maps TREF onto TNOM', () => {
    const withTnom = new Diode('D1', [0, -1], { BV: 5, TBV1: 0.01, TNOM: 50 });
    const withTref = new Diode('D1', [0, -1], { BV: 5, TBV1: 0.01, TREF: 50 });
    expect(withTref.params.TNOM).toBe(50);
    withTnom.setTemperature(72);
    withTref.setTemperature(72);
    const solution = new Float64Array([-5.1]);
    expect(withTref.noiseOperatingPoint(solution).current)
      .toBe(withTnom.noiseOperatingPoint(solution).current);
  });

  it('accepts an alias that repeats the canonical value', async () => {
    expect(await operatingPointOut('IS=1e-14 BV=5 VB=5', { source: -10 }))
      .toBe(await operatingPointOut('IS=1e-14 BV=5', { source: -10 }));
  });

  it.each([
    ['VJ=0.7 PB=0.5', 'VJ', 'PB'],
    ['M=0.5 MJ=0.33', 'M', 'MJ'],
    ['CJO=10p CJ=5p', 'CJO', 'CJ'],
    ['IKF=1m IK=2m', 'IKF', 'IK'],
    ['IBV=1m IB=2m', 'IBV', 'IB'],
    ['BV=5 VB=6', 'BV', 'VB'],
    ['IS=1e-14 JS=1e-13', 'IS', 'JS'],
  ])('rejects conflicting aliases %s', (fields, canonical, alias) => {
    expect(() => parse(`conflicting diode aliases
      D1 out 0 DM
      .model DM D(${fields})
      .op
    `).compile()).toThrow(new RegExp(`${canonical}.*${alias}|${alias}.*${canonical}`));
  });

  it.each([
    ['NBV=1.6 NZ=2', 'NBV', 'NZ'],
    ['TBV1=0.01 TCV=0.02', 'TBV1', 'TCV'],
  ])('rejects conflicting breakdown aliases %s', (fields, canonical, alias) => {
    expect(() => parse(`conflicting diode aliases
      D1 out 0 DM
      .model DM D(BV=5 ${fields})
      .op
    `).compile()).toThrow(new RegExp(`${canonical}.*${alias}|${alias}.*${canonical}`));
  });
});

/**
 * Identical-netlist ngspice-47 references for the breakdown law. Each deck is
 * run verbatim by spice-ts; ngspice-47 ran the same lines with
 * `.control / set numdgt=13 / op / print v(out) / .endc`.
 */
async function breakdownDeck(model: string, options: {
  source: number;
  resistance: string;
  extra?: string;
}): Promise<number> {
  const result = await simulate(`diode breakdown parity
    V1 in 0 DC ${options.source}
    R1 in out ${options.resistance}
    D1 out 0 DZ
    .model DZ D ${model}
    .options reltol=1e-7 abstol=1e-15 vntol=1e-9
    ${options.extra ?? ''}
    .op
    .end
  `);
  return result.steps ? result.steps[0]!.dc!.voltage('out') : result.dc!.voltage('out');
}

describe('diode breakdown emission coefficient NBV like ngspice-47 (#438)', () => {
  // ngspice-47 diosetup.c:131-133 defaults NBV to N; dioload.c:109/322 use
  // vtebrk = NBV*vt in breakdown, and diotemp.c:231-237 fit the knee with it.
  it('defaults NBV to N in breakdown', async () => {
    // ngspice-47: v(out) = -5.307482141622 (spice-ts used NBV=1: -5.288653254).
    expectNear(
      await breakdownDeck('IS=1e-14 BV=5.1 IBV=1m N=1.1', { source: -20, resistance: '10' }),
      -5.307482141622,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it.each(['NBV', 'NZ'])('applies an explicit %s', async (name) => {
    // ngspice-47: v(out) = -5.401526463458 for NBV=1.6 and NZ=1.6.
    expectNear(
      await breakdownDeck(`IS=1e-14 BV=5.1 IBV=1m N=1.1 ${name}=1.6`, {
        source: -20,
        resistance: '10',
      }),
      -5.401526463458,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it('keeps NBV out of the forward junction', async () => {
    // NBV only shapes breakdown: the forward point equals the plain diode.
    expect(await breakdownDeck('IS=1e-14 BV=5.1 N=1.1 NBV=3', { source: 5, resistance: '1k' }))
      .toBe(await breakdownDeck('IS=1e-14 BV=5.1 N=1.1', { source: 5, resistance: '1k' }));
  });
});

describe('diode TBV1 is ngspice-47 TCV: BV(T) = BV - TCV*(T-TNOM) (#429)', () => {
  // ngspice-47 dio.c:120-121 makes tbv1 an alias of tcv; diotemp.c:210-212
  // applies BV - TCV*dt for TLEV=0. TNOM != 27 gives TEMP != TNOM in both
  // engines from the identical deck.
  it.each(['TBV1', 'TCV'])('lowers BV by %s*dT above TNOM', async (name) => {
    // ngspice-47: v(out) = -4.593649099182 for TBV1=0.01 and TCV=0.01
    // (BV(T) = 4.55 V; the PSpice law gave 7.25 V).
    expectNear(
      await breakdownDeck(`IS=1e-14 BV=5 IBV=1m ${name}=0.01 TNOM=-18`, {
        source: -10,
        resistance: '1k',
      }),
      -4.593649099182,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it('raises BV for a negative TBV1 below TNOM', async () => {
    // ngspice-47: v(out) = -4.842430502458 (BV(T) = 5 - (-0.004)*(27-77) = 4.8 V).
    expectNear(
      await breakdownDeck('IS=1e-14 BV=5 IBV=1m TBV1=-0.004 TNOM=77', {
        source: -10,
        resistance: '1k',
      }),
      -4.842430502458,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it('combines TBV1 with the NBV=N default', async () => {
    // ngspice-47: v(out) = -4.597991075358
    expectNear(
      await breakdownDeck('IS=1e-14 BV=5 IBV=1m TBV1=0.01 TNOM=-18 N=1.1', {
        source: -10,
        resistance: '1k',
      }),
      -4.597991075358,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it('applies TBV1 at a stepped TEMP', async () => {
    // ngspice-47 has no .step, so its deck sets `.temp 72` instead:
    // v(out) = -4.600157234640. ngspice also scales IS with EG/XTI, which moves
    // this point by only 1.6e-8 V (XTI=0 EG=0 gives -4.600157218617).
    expectNear(
      await breakdownDeck('IS=1e-14 BV=5 IBV=1m TBV1=0.01', {
        source: -10,
        resistance: '1k',
        extra: '.step TEMP LIST 72',
      }),
      -4.60015723464,
      NGSPICE_BREAKDOWN_RESIDUAL,
    );
  });

  it('rejects TBV2, which ngspice-47 does not have, outside LEVEL=2', () => {
    // ngspice-47 warns "unrecognized parameter (tbv2) - ignored"; silently
    // dropping a PSpice quadratic coefficient would hide the law change.
    expect(() => parse(`unsupported diode TBV2
      D1 out 0 DM
      .model DM D(BV=5 TBV1=0.01 TBV2=1e-4)
      .op
    `).compile()).toThrow("'TBV2'; ngspice-47 has no TBV2; LEVEL=2 selects the PSpice TBV1/TBV2 law");
  });

  it('keeps the PSpice TBV1 law under LEVEL=2, which ngspice-47 rejects', async () => {
    // ngspice-47 stops with "Diode model level 2 is not supported", so LEVEL=2
    // keeps the #319 PSpice/Xyce law: BV(T) = 5*(1 + 0.01*45) = 7.25 V.
    const level2 = await breakdownDeck('LEVEL=2 IS=1e-14 BV=5 IBV=1m TBV1=0.01 TNOM=-18', {
      source: -10,
      resistance: '1k',
    });
    const nominal = await breakdownDeck('IS=1e-14 BV=7.25 IBV=1m', {
      source: -10,
      resistance: '1k',
    });
    expect(level2).toBe(nominal);
  });
});
