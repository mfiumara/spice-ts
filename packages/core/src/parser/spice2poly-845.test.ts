import { describe, expect, it } from 'vitest';
import { parse } from './index.js';
import { simulate } from '../simulate.js';
import { ParseError } from '../errors.js';
import { nextPowers } from './spice2poly.js';

/**
 * SPICE2 POLY(n) E/F/G/H sources (#845). ngspice-47 runs them as XSPICE
 * spice2poly instances (enhtrans.c ENHtranslate_poly); spice-ts runs the same
 * polynomial as a B-source. Every expected value below is ngspice-47
 * (`ngspice -b`, `set numdgt=15`, `print`) on the same deck with a `.control`
 * block in place of the dot analyses.
 */
const deck = (...lines: string[]) => ['poly test', ...lines, '.end'].join('\n');

/**
 * Values that come out of a Newton solve: ngspice-47 accepts an iterate within
 * reltol (1e-3) of the value plus vntol (1e-6), so it is only that accurate.
 */
const withinNewtonTolerance = (actual: number, reference: number) =>
  expect(Math.abs(actual - reference)).toBeLessThanOrEqual(1e-3 * Math.abs(reference) + 1e-6);

describe('spice2poly term order (SPICE 2G6 NXTPWR)', () => {
  const powers = (dimension: number, terms: number) => {
    const exp = new Int32Array(dimension);
    return Array.from({ length: terms }, () => {
      nextPowers(exp);
      return Array.from(exp);
    });
  };

  it('orders 2-D terms a, b, a^2, ab, b^2, a^3, a^2b, ab^2, b^3', () => {
    expect(powers(2, 9)).toEqual([
      [1, 0], [0, 1], [2, 0], [1, 1], [0, 2], [3, 0], [2, 1], [1, 2], [0, 3],
    ]);
  });

  it('orders 3-D terms a, b, c, a^2, ab, ac, b^2, bc, c^2, a^3, ...', () => {
    expect(powers(3, 13)).toEqual([
      [1, 0, 0], [0, 1, 0], [0, 0, 1],
      [2, 0, 0], [1, 1, 0], [1, 0, 1], [0, 2, 0], [0, 1, 1], [0, 0, 2],
      [3, 0, 0], [2, 1, 0], [2, 0, 1], [1, 2, 0],
    ]);
  });
});

describe('SPICE2 POLY(n) controlled sources like ngspice-47 spice2poly (#845)', () => {
  it('evaluates a 1-D E POLY and solves a self-dependent G POLY', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 1.5',
      'e1 2 0 poly(1) 1 0 0.5 2 0.3',
      'r2 2 0 1k',
      'i1 0 3 dc 1m',
      'g1 3 0 poly(1) 3 0 0 1m 0.5m',
      'r3 3 0 10k',
      '.op',
    ));
    // ngspice-47: v(2) = 4.175, v(3) = 6.916472867168917e-01. v(3) solves
    // 1m = v/10k + 1m*v + 0.5m*v^2, i.e. v = (sqrt(12.84) - 2.2) / 2.
    expect(result.dc!.voltage('2')).toBeCloseTo(4.175, 12);
    withinNewtonTolerance(result.dc!.voltage('3'), 6.916472867168917e-1);
    expect(result.dc!.voltage('3')).toBeCloseTo((Math.sqrt(12.84) - 2.2) / 2, 9);
  });

  it('sweeps a 1-D E POLY in .dc', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 1.5',
      'e1 2 0 poly(1) 1 0 0.5 2 0.3',
      'r2 2 0 1k',
      '.dc v1 -2 2 1',
    ));
    // ngspice-47 v(2) rows: its XSPICE DC sweep stops Newton within reltol of
    // the exact 0.5 + 2*v1 + 0.3*v1^2 (-2.3, -1.2, 0.5, 2.8, 5.7).
    const ngspice = [-2.3, -1.2, 4.999192504882813e-1, 2.799835205078125, 5.6993408203125];
    const sweep = result.dcSweep!.voltage('2');
    expect(sweep).toHaveLength(5);
    ngspice.forEach((reference, i) => withinNewtonTolerance(sweep[i], reference));
  });

  it('orders 2-D and 3-D coefficients like spice2poly, with (n,n) control pairs', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 0.7',
      'v2 2 0 dc -1.3',
      'v3 4 0 dc 0.4',
      'e1 3 0 poly(2) 1 0 2 0 0.1 1 2 0.5 0.25 0.125 0.0625',
      'r3 3 0 1k',
      'g1 0 5 poly(3) (1,0) (2,0) (4,0) 1m 2m -1m 0.5m 0.1m 0.2m 0.3m 0.4m 0.5m 0.6m 0.7m 0.8m 0.9m 1.1m',
      'r5 5 0 1k',
      '.op',
    ));
    // ngspice-47: v(3) = -1.54981250000000e+00, v(5) = 5.571200000000001e+00
    expect(result.dc!.voltage('3')).toBeCloseTo(-1.5498125, 12);
    expect(result.dc!.voltage('5')).toBeCloseTo(5.571200000000001, 12);
  });

  it('reads F and H POLY controls as voltage-source currents, with m= on F', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 2',
      'vs1 1 2 dc 0',
      'r1 2 0 1k',
      'v2 3 0 dc -1',
      'vs2 3 4 dc 0',
      'r2 4 0 500',
      'f1 0 5 poly(2) vs1 vs2 0.1m 2 3 100 50 25',
      'r5 5 0 1k',
      'h1 6 0 poly(1) vs1 0.5 1k 1e5',
      'r6 6 0 1k',
      'f2 0 7 poly(1) vs2 0 1 m=2',
      'r7 7 0 1k',
      '.op',
    ));
    // ngspice-47: v(5) = -1.6, v(6) = 2.9, v(7) = -4
    expect(result.dc!.voltage('5')).toBeCloseTo(-1.6, 12);
    expect(result.dc!.voltage('6')).toBeCloseTo(2.9, 12);
    expect(result.dc!.voltage('7')).toBeCloseTo(-4, 12);
  });

  const acTranDeck = (analysis: string) => deck(
    'v1 1 0 dc 0.5 ac 1 sin(0.5 0.4 1k)',
    'e1 2 0 poly(1) 1 0 0 2 1.5 -0.5',
    'r2 2 3 1k',
    'c3 3 0 100n',
    'g1 0 4 poly(2) 1 0 3 0 0 1m 0 0 0.5m 0',
    'r4 4 0 1k',
    analysis,
  );

  it('linearises POLY sources at the operating point for .ac', async () => {
    const result = await simulate(acTranDeck('.ac lin 3 100 10k'));
    // ngspice-47 op: v(2) = v(3) = 1.3125, v(4) = 0.828125
    const v3 = result.ac!.voltage('3');
    const v4 = result.ac!.voltage('4');
    const ngspice3 = [
      [3.118849701573891, -6.27493649693215e-2],
      [9.393247620397144e-1, -1.26549149529219],
      [4.911772671174683e-1, -1.41296513650674],
    ];
    const ngspice4 = [
      [2.434918837657627, -2.00818375449252e-2],
      [1.741300510483548, -1.28980443954024e-1],
      [1.679933067203141, -7.22490748406767e-2],
    ];
    ngspice3.forEach(([magnitude, phase], i) => {
      expect(v3[i].magnitude).toBeCloseTo(magnitude, 9);
      expect(v3[i].phase * Math.PI / 180).toBeCloseTo(phase, 9);
    });
    ngspice4.forEach(([magnitude, phase], i) => {
      expect(v4[i].magnitude).toBeCloseTo(magnitude, 9);
      expect(v4[i].phase * Math.PI / 180).toBeCloseTo(phase, 9);
    });
  });

  it('runs POLY sources in .tran on the ngspice-47 timesteps', async () => {
    const result = await simulate(acTranDeck('.tran 50u 2m'));
    const time = result.transient!.time;
    const v3 = result.transient!.voltage('3');
    const v4 = result.transient!.voltage('4');
    // ngspice-47 rows 0..9 and the last row of print v(3) v(4).
    const ngspice: [number, number, number][] = [
      [0, 1.3125, 8.28125e-1],
      [2e-7, 1.312503135321185, 8.289583056643863e-1],
      [4.000000000000001e-7, 1.312509400834676, 8.297923957128615e-1],
      [8.000000000000002e-7, 1.31252818084799, 8.314621382922794e-1],
      [1.6e-6, 1.312603098407157, 8.348109708181537e-1],
      [3.200000000000001e-6, 1.312901005859377, 8.415457203792047e-1],
      [6.400000000000001e-6, 1.314078354789015, 8.551610734435571e-1],
      [1.280000000000000e-5, 1.318680531516623, 8.829934306495014e-1],
      [2.560000000000001e-5, 1.336242161290558, 9.409249419972805e-1],
      [5.120000000000001e-5, 1.400000096852638, 1.065001709557237],
    ];
    expect(time).toHaveLength(59);
    ngspice.forEach(([t, a, b], i) => {
      expect(time[i]).toBeCloseTo(t, 15);
      withinNewtonTolerance(v3[i], a);
      withinNewtonTolerance(v4[i], b);
    });
    expect(time[58]).toBeCloseTo(2e-3, 15);
    withinNewtonTolerance(v3[58], 7.932722397143339e-1);
    withinNewtonTolerance(v4[58], 6.983180599285832e-1);
  });

  const boyle = (analysis: string) => deck(
    '.subckt boyle inp inn vcc vee out',
    'c1 11 12 5p', 'c2 6 7 30p',
    'dc out 53 dx', 'de 54 out dx', 'dlp 90 91 dx', 'dln 92 90 dx', 'dp vee vcc dx',
    'egnd 99 0 poly(2) (vcc,0) (vee,0) 0 0.5 0.5',
    'fb 7 99 poly(5) vb vc ve vlp vln 0 1e7 -1e7 1e7 1e7 -1e7',
    'ga 6 0 11 12 150u', 'gcm 0 6 10 99 3n', 'iee 10 vee dc 10u',
    'q1 11 inn 13 qx', 'q2 12 inp 14 qx',
    'r2 6 9 100k', 'rc1 vcc 11 8k', 'rc2 vcc 12 8k', 're1 13 10 2.5k', 're2 14 10 2.5k',
    'ree 10 99 20meg', 'ro1 8 out 100', 'ro2 7 99 200', 'rp vcc vee 20k',
    'vb 9 0 dc 0', 'vc vcc 53 dc 2', 've 54 vee dc 2', 'vlim 7 8 dc 0', 'vlp 91 0 dc 30', 'vln 0 92 dc 30',
    // After vlim: a linear H/F naming a later source is a separate spice-ts gap.
    'hlim 90 0 vlim 1k',
    '.model dx d(is=1e-15)',
    '.model qx npn(is=1e-15 bf=80)',
    '.ends',
    'vcc vcc 0 dc 15', 'vee vee 0 dc -15',
    'vin in 0 dc 0.1 ac 1 sin(0.1 0.5 1k)',
    'rin in inn 10k', 'rf inn out 47k',
    'xu1 0 inn vcc vee out boyle',
    'rl out 0 2k',
    // No .options trtol: the POLY sources lower it to 1 as in ngspice-47 (#862).
    analysis,
  );

  it('solves a Boyle op-amp macromodel with POLY(2) and POLY(5) sources', async () => {
    const result = await simulate(boyle('.op'));
    // ngspice-47: v(out) = -4.67032046139513e-01, v(inn) = 1.323690644200913e-05, v(xu1.6) = 2.714549671280526e-05
    expect(result.dc!.voltage('out')).toBeCloseTo(-4.67032046139513e-1, 9);
    expect(result.dc!.voltage('inn')).toBeCloseTo(1.323690644200913e-5, 12);
    expect(result.dc!.voltage('xu1.6')).toBeCloseTo(2.714549671280526e-5, 12);
    expect(result.dc!.voltage('xu1.99')).toBeCloseTo(0, 12);
  });

  it('runs the Boyle macromodel closed-loop response in .ac', async () => {
    const result = await simulate(boyle('.ac dec 2 10 1meg'));
    const out = result.ac!.voltage('out');
    // ngspice-47 vm(out), vp(out) at 10 Hz, 1 kHz, 100 kHz, 1 MHz
    const ngspice: [number, number, number][] = [
      [0, 4.69989831271237, 3.141518835161363],
      [4, 4.699787804337765, 3.1342109173032],
      [8, 3.874190354265915, 2.487449580268384],
      [10, 5.986704367221932e-1, 1.216339953165135],
    ];
    expect(out).toHaveLength(11);
    for (const [i, magnitude, phase] of ngspice) {
      expect(out[i].magnitude).toBeCloseTo(magnitude, 7);
      expect(out[i].phase * Math.PI / 180).toBeCloseTo(phase, 7);
    }
  });

  it('runs the Boyle macromodel in .tran on the ngspice-47 timesteps', async () => {
    const result = await simulate(boyle('.tran 20u 2m'));
    const time = result.transient!.time;
    const out = result.transient!.voltage('out');
    // ngspice-47 rows of print v(out)
    const ngspice: [number, number, number][] = [
      [1, 2e-7, -4.67351365943628e-1],
      [2, 2.324711939335175e-7, -4.67412554300033e-1],
      [10, 3.188993080683253e-6, -4.97654554419495e-1],
      [50, 6.882283062760422e-4, 1.701445916369954],
      [100, 1.688228306276045e-3, 1.701445930986119],
      [116, 2e-3, -4.49660733313056e-1],
    ];
    expect(time).toHaveLength(117);
    for (const [i, t, v] of ngspice) {
      expect(Math.abs(time[i] - t)).toBeLessThanOrEqual(1e-3 * t);
      withinNewtonTolerance(out[i], v);
    }
  });

  it('reads POLY cards in subcircuits with parameter coefficients and continuation lines', async () => {
    const result = await simulate(deck(
      '.subckt amp in out params: k=2',
      'e1 out 0 poly(1) in 0',
      '+ 0.25 {k} -0.5',
      'g1 0 m poly(2) in 0 out 0 +1u 1meg 0 0 2u',
      'rm m 0 1',
      '.ends',
      'v1 1 0 dc 0.8',
      'x1 1 2 amp k=3',
      'r2 2 0 1k',
      '.op',
    ));
    // ngspice-47: v(2) = 2.33, v(x1.m) = 8.000000000047279e+05
    expect(result.dc!.voltage('2')).toBeCloseTo(2.33, 12);
    expect(result.dc!.voltage('x1.m')).toBeCloseTo(8.000000000047279e5, 8);
  });

  it('rejects malformed POLY cards with a ParseError', () => {
    expect(() => parse(deck('v1 1 0 1', 'e1 2 0 poly(x) 1 0 0 1', 'r2 2 0 1k', '.op'))).toThrow(ParseError);
    expect(() => parse(deck('v1 1 0 1', 'e1 2 0 poly(2) 1 0 0 1', 'r2 2 0 1k', '.op'))).toThrow(
      /POLY source 'e1': POLY\(2\) needs 4 controls and at least 2 coefficients/,
    );
  });
});
