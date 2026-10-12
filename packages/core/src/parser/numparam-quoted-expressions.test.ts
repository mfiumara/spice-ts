import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * #493: quoted/brace numparam expressions, TEMPER and v() in resistor values.
 *
 * The deck is built only from card lines of the corpus-f ngspice decks named in
 * #493 (minus-minus.cir, log-functions-1.cir, xpressn-2.cir, alterparam.sp,
 * asrc-tc-2.cir, tmp-noise.cir, dc_loop.sp, temper-1/2/3.cir,
 * todo-temper-3.cir), with their .control blocks replaced by `.op`. Expected
 * values are the ngspice-47 operating point of this identical deck:
 *   HOME=<tmp with .spiceinit "set filetype=ascii"> ngspice -b -r derived.raw derived.cir
 */
const DECK = `derived deck: minimal lines from corpus-f fixtures in issue #493
.param vv = 1
.param rr = 'vv + 1'
R1 1 0 {rr + 1}
v1 1 0 '2--3'
vn1 n1 0 'ln(2.7)'
vn2 n2 0 'log(2.7)'
vn3 n3 0 'log10(2.7)'
vs1 s1 0 'sin(1.0e-1)'
vs30 s30 0 'acosh(1.2e+0)'
vs33 s33 0 'atanh(7.0e-1)'
v9 9 0 dc=0 ac=0
r3 1 3 r = {1k + v(9)}  tc1=0.001
v3 3 0 dc=0 ac=0
v200 200 0 dc=1
R10 1 20 1k
R20 20 0 '1k*v(200)' tc1=0.001 ; tc2=1e-5
vr2 r2 0 1
Rt r2 0 r = {5k + 50*TEMPER}
.model dplain d is={temper >= 25 ? 1e-10 : (temper+1)*1e-11}
.model rtest r r='1000 + temper'
vt t 0 1
r_test t 0 rtest
Iin d1 0 dc = -1mA
D2 d1 0 dplain
.model dq d is='1e-12 * temper'
Iq dq 0 dc = -1mA
Dq dq 0 dq
.subckt subr in out rint1 = 6
  R1 in out 'rint1'
  R2 in out 'rint1 * 2'
.ends
Xr 2 0 subr rint1 = 9
v2 2 0 1
.op
.end
`;

// ngspice-47 operating point of DECK.
const NGSPICE_VOLTAGES: Record<string, number> = {
  '1': 5,
  n1: 9.932517730102833e-01,
  n2: 9.932517730102833e-01,
  n3: 4.313637641589874e-01,
  s1: 9.983341664682817e-02,
  s30: 6.223625037147786e-01,
  s33: 8.673005276940532e-01,
  '20': 2.5,
};
// Diode junctions: ngspice and spice-ts stop Newton at slightly different
// iterates (|dv| ~1.4e-7 V, inside VNTOL = 1e-6 V); spice-ts gives the same
// voltages for literal `is=1e-10` / `is=27e-12`, so the expression values match.
const NGSPICE_JUNCTION_VOLTAGES: Record<string, number> = {
  d1: 4.168933466470672e-01,
  dq: 4.507591424142309e-01,
};
const NGSPICE_CURRENTS: Record<string, number> = {
  v1: -1.674166666666666e+00,
  v2: -1.666666666666667e-01,
  vt: -9.737098344693282e-04,
  vr2: -1.574803149606299e-04,
  v3: 5.000000000000000e-03,
  v200: 0,
};

describe('quoted/brace numparam expressions against ngspice-47 (#493)', () => {
  it('matches the ngspice operating point of the derived corpus-f deck', async () => {
    const result = await simulate(DECK);
    const op = result.dc!;
    for (const [node, expected] of Object.entries(NGSPICE_VOLTAGES)) {
      expect(op.voltage(node), `v(${node})`).toBeCloseTo(expected, 9);
    }
    for (const [node, expected] of Object.entries(NGSPICE_JUNCTION_VOLTAGES)) {
      expect(Math.abs(op.voltage(node) - expected), `v(${node})`).toBeLessThan(1e-6);
    }
    for (const [source, expected] of Object.entries(NGSPICE_CURRENTS)) {
      expect(op.current(source), `i(${source})`).toBeCloseTo(expected, 12);
    }
  });
});

/**
 * PR #587 review: `^`/`**` precedence and associativity. Expected values are
 * the ngspice-47 operating point of this identical deck:
 *   HOME=<tmp with .spiceinit "set filetype=ascii"> ngspice -b -r power.raw power.cir
 */
const POWER_DECK = `power precedence and associativity (#493 review)
.param x = 2
.param pa = {2^3^2}
.param pb = '-3**2+1'
vp1 p1 0 {pa}
vp2 p2 0 {2**3**2}
vp3 p3 0 {-2^2}
vp4 p4 0 {pb}
vp5 p5 0 {-x^2}
vp6 p6 0 {3*-2^2}
vp7 p7 0 {1+-2^2}
vp8 p8 0 {4^0.5^2}
vp9 p9 0 {(-2)^3}
vp10 p10 0 {-2^-2}
.op
.end
`;

const NGSPICE_POWER_VOLTAGES: Record<string, number> = {
  p1: 64,
  p2: 64,
  p3: -4,
  p4: -8,
  p5: -4,
  p6: 12,
  p7: 5,
  p8: 4,
  p9: 8,
  p10: -0.25,
};

describe('numparam ^ and ** precedence against ngspice-47 (#493)', () => {
  it('matches the ngspice operating point of the power deck', async () => {
    const result = await simulate(POWER_DECK);
    const op = result.dc!;
    for (const [node, expected] of Object.entries(NGSPICE_POWER_VOLTAGES)) {
      expect(op.voltage(node), `v(${node})`).toBeCloseTo(expected, 12);
    }
  });
});

/**
 * #578: a minus after a binary operator negates the next number literal of
 * its (sub-)formula (ngspice-47 xpressn.c formula()). Expected values are the
 * ngspice-47 operating point of this identical deck:
 *   HOME=<tmp with .spiceinit "set filetype=ascii"> ngspice -b -r neg.raw neg.cir
 */
const NEGATION_DECK = `minus after an operator negates the next number literal (#578)
.param x = 2
.param pa = '3*-x^2'
.func f(a) = {1+-a^2}
vn1 n1 0 {pa}
vn2 n2 0 {3*-x*2}
vn3 n3 0 {2*-(x)^2}
vn4 n4 0 {f(x)}
vn5 n5 0 '1?-x^2:3'
vn6 n6 0 {x*-2k}
.op
.end
`;

const NGSPICE_NEGATION_VOLTAGES: Record<string, number> = {
  n1: 0.75,
  n2: -12,
  n3: 0.5,
  n4: 1.25,
  n5: 0.25,
  n6: -4000,
};

describe('numparam minus after an operator against ngspice-47 (#578)', () => {
  it('matches the ngspice operating point of the negation deck', async () => {
    const result = await simulate(NEGATION_DECK);
    const op = result.dc!;
    for (const [node, expected] of Object.entries(NGSPICE_NEGATION_VOLTAGES)) {
      expect(op.voltage(node), `v(${node})`).toBeCloseTo(expected, 12);
    }
  });

  it('rejects {3*-x} like ngspice ("wrongly determined negation")', async () => {
    const deck = 'reject\n.param x = 2\nv1 1 0 {3*-x}\nr1 1 0 1\n.op\n.end\n';
    await expect(simulate(deck)).rejects.toThrow(/wrongly determined negation/);
  });
});
