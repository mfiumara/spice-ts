import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parseBehavioralExpression } from './behavioral-expression.js';

/**
 * #879: PSpice `IF()`, `LIMIT()`, `PWRS()`, `STP()` and `INT()` in B-source
 * expressions (ngspice-bugs #784 AD620 `bE1 ... IF(...)`, #738 opa818
 * `bG1 ... LIMIT(...)`).
 *
 * ngspice-47 PSpice compatibility (frontend/inpcompat.c pspice_compat)
 * prepends these `.func` definitions, expanded textually into every card:
 *   .func limit(x, a, b) { ternary_fcn(a > b, max(min(x, a), b), max(min(x, b), a)) }
 *   .func pwrs(x, a) { sgn(x) * pow(x, a) }
 *   .func stp(x) { u(x) }
 *   .func if(a, b, c) {ternary_fcn( a , b , c )}
 *   .func int(x) { sgn(x)*floor(abs(x)) }
 * Expected values are the ngspice-47 results of these identical decks, run as
 *   HOME=<tmp with .spiceinit "set ngbehavior=psa" + "set filetype=ascii">
 *   ngspice -b -r out.raw deck.cir
 * (default mode rejects them: "no such function 'if'").
 */
const FUNCTIONS_DECK = `PSpice B-source functions (issue 879)
V1 in 0 0
B1 n1 0 V = IF(V(in) > 0.3, 2*V(in), -V(in))
B2 n2 0 V = LIMIT(3*V(in), 1, -0.5)
B3 n3 0 V = limit(3*V(in), -0.5, 1)
B4 n4 0 V = PWRS(V(in), 1.5)
B5 n5 0 V = PWRS(V(in), 2)
B6 n6 0 V = STP(V(in))
B7 n7 0 V = INT(3.7*V(in))
B8 n8 0 I = if(v(in) >= 0, limit(1m*v(in), 0, 0.4m), -2m*v(in))
R8 n8 0 1k
.dc V1 -1 1 0.25
.end
`;

/** ngspice-47 psa raw-file columns for the sweep V1 = -1 .. 1 step 0.25. */
const FUNCTIONS_EXPECTED: Record<string, number[]> = {
  n1: [1.0, 0.75, 0.5, 0.25, 0.0, -0.25, 1.0, 1.5, 2.0],
  n2: [-0.4999999999999999, -0.4999999999999999, -0.4999999999999999, -0.4999999999999999, 0.0, 0.75, 1.0, 1.0, 1.0],
  n3: [-0.4999999999999999, -0.4999999999999999, -0.4999999999999999, -0.4999999999999999, 0.0, 0.75, 1.0, 1.0, 1.0],
  n4: [0.0, 0.0, 0.0, 0.0, 0.0, 0.125, 0.3535533905932738, 0.649519052838329, 1.0],
  n5: [-1.0, -0.5625, -0.25, -0.0625, 0.0, 0.0625, 0.25, 0.5625, 1.0],
  n6: [0.0, 0.0, 0.0, 0.0, 0.5, 1.0, 1.0, 1.0, 1.0],
  n7: [-3.0, -2.0, -1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0],
  n8: [-2.0, -1.5, -1.0, -0.5, 0.0, -0.25, -0.4, -0.4, -0.4],
};

/**
 * The vendor-library shapes of ngspice-bugs #738 (`bG1 ... LIMIT(gm*V(a,b),
 * (-lim), lim)`) and #784 (`bE1 ... (IF(V(x)<V(y)-0.3, V(z), V(x)))`) inside
 * a Newton feedback loop with a diode, so the derivatives of the expanded
 * ternary/min/max tree drive convergence.
 */
const LOOP_DECK = `PSpice LIMIT in a Newton feedback loop (issue 879)
V1 in 0 2
R1 in a 1k
BG1 0 out I = LIMIT(10m*V(a,out), (-0.5m), 0.5m)
R2 out 0 2k
D1 out 0 dd
.model dd d is=1e-14
BE1 b 0 V = (IF(V(out) < V(a)-0.3, V(in), V(out)))
R3 b 0 1k
R4 a 0 10k
.dc V1 -3 3 0.5
.end
`;

/** ngspice-47 psa raw-file columns for the sweep V1 = -3 .. 3 step 0.5. */
const LOOP_EXPECTED: Record<string, number[]> = {
  a: [
    -2.727272727272727, -2.272727272727272, -1.818181818181818, -1.363636363636364, -0.9090909090909091,
    -0.4545454545454545, 0.0, 0.4545454545454545, 0.9090909090909091, 1.363636363636364, 1.818181818181818,
    2.272727272727272, 2.727272727272727,
  ],
  out: [
    -0.9999999979800005, -0.9999999979800005, -0.9999999979800005, -0.9999999979800005, -0.8658008657174562,
    -0.4329004328582521, -3.171207541232129e-17, 0.4328827607201801, 0.612719084645427, 0.612671584950047,
    0.6126582008021745, 0.6126581829664007, 0.6126581797300246,
  ],
  b: [
    -0.9999999979800005, -0.9999999979800005, -0.9999999979800005, -0.9999999979800005, -0.8658008657174562,
    -0.4329004328582521, -3.171207541232129e-17, 0.4328827607201801, 0.612719084645427, 1.5, 2.0, 2.5, 3.0,
  ],
};

function expectSweep(
  sweep: { voltage(node: string): ArrayLike<number> },
  expected: Record<string, number[]>,
  tolerance: { abs: number; rel: number },
): void {
  for (const [node, values] of Object.entries(expected)) {
    const actual = Array.from(sweep.voltage(node));
    expect(actual.length, node).toBe(values.length);
    values.forEach((value, index) => {
      expect(Math.abs(actual[index] - value), `${node}[${index}] = ${actual[index]}, ngspice ${value}`)
        .toBeLessThanOrEqual(tolerance.abs + tolerance.rel * Math.abs(value));
    });
  }
}

describe('PSpice IF/LIMIT/PWRS/STP/INT in B-source expressions (#879)', () => {
  it('evaluates each inpcompat.c function like ngspice-47 ngbehavior=psa', async () => {
    const result = await simulate(FUNCTIONS_DECK);
    expectSweep(result.dcSweep!, FUNCTIONS_EXPECTED, { abs: 1e-12, rel: 1e-12 });
  });

  it('converges a LIMIT/IF feedback loop to the ngspice-47 ngbehavior=psa solution', async () => {
    const result = await simulate(LOOP_DECK);
    // Within ngspice's own Newton convergence test (reltol 1e-3, vntol 1e-6).
    // Observed: |out - ngspice| <= 6.1e-5 V at V1 = 1 (1.0e-4 relative); the
    // same deviation appears with the hand-expanded ternary_fcn/min/max
    // expression in default mode, and spice-ts lands closer to the saturated
    // fixed point 0.61265817973 that ngspice itself reaches at V1 = 3.
    expectSweep(result.dcSweep!, LOOP_EXPECTED, { abs: 1e-6, rel: 1e-3 });
  });

  it('expands LIMIT/IF into the ternary_fcn/min/max tree ngspice builds', () => {
    expect(parseBehavioralExpression('limit(v(a), 1, 2)')).toEqual(
      parseBehavioralExpression('ternary_fcn(1 > 2, max(min(v(a), 1), 2), max(min(v(a), 2), 1))'),
    );
    expect(parseBehavioralExpression('IF(v(a) < 1, 2, 3)')).toEqual(
      parseBehavioralExpression('ternary_fcn(v(a) < 1, 2, 3)'),
    );
    expect(parseBehavioralExpression('pwrs(v(a), 2)')).toEqual(parseBehavioralExpression('sgn(v(a)) * pow(v(a), 2)'));
    expect(parseBehavioralExpression('stp(v(a))')).toEqual(parseBehavioralExpression('u(v(a))'));
    expect(parseBehavioralExpression('int(v(a))')).toEqual(parseBehavioralExpression('sgn(v(a)) * floor(abs(v(a)))'));
  });

  it('reports a wrong argument count and keeps genuinely unknown functions a structured error', async () => {
    expect(() => parseBehavioralExpression('limit(v(a), 1)')).toThrow('limit() takes three arguments');
    expect(() => parseBehavioralExpression('if(v(a), 1)')).toThrow('if() takes three arguments');
    expect(() => parseBehavioralExpression('stp(v(a), 1)')).toThrow('stp() takes one argument');
    await expect(simulate('t\nV1 a 0 1\nB1 b 0 V = frobnicate(V(a))\nR1 b 0 1k\n.op\n.end\n'))
      .rejects.toThrow("Unsupported behavioral expression function 'frobnicate'");
  });
});
