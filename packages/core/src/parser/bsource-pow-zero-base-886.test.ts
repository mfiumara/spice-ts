import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * #886: `pow(x, c)`, `x^c` and `x**c` with c < 1 differentiate to
 * c*pwr(x, c-1), a pole at x = 0. Newton's first iterate has every node at
 * 0, so the B-source Jacobian entry was +Infinity and the LU factorisation
 * reported a singular matrix for every V1.
 *
 * Expected values are ngspice-47 -b results of these identical decks:
 *   - default mode for pow/^/** (V1 = 0 aborts the ngspice-47 .op: its
 *     slope stays +Infinity, the solution NaN; spice-ts converges to the
 *     0 that ngspice-47 `ngbehavior=psa` returns for the same decks);
 *   - `set ngbehavior=psa` for PSpice `pwrs()` (ngspice rejects it in
 *     default mode), where PTpwr's fudged zero base keeps the slope finite.
 */
const deck = (expression: string, v1: string, analysis = '.op') =>
  `pow at zero (issue 886)\nV1 in 0 ${v1}\nB2 n2 0 V = ${expression}\nR2 n2 0 1k\n${analysis}\n.end\n`;

/** ngspice-47 v(n2) for V1 = 1, 0, -1 (null: ngspice-47 aborts the .op). */
const OP_EXPECTED: Record<string, (number | null)[]> = {
  'pow(V(in), 0.5)': [1, null, 0],
  'V(in)^0.5': [1, null, 0],
  'V(in)**0.5': [1, null, 0],
  'sgn(V(in))*pow(V(in), 0.5)': [1, null, 0],
  'pow(V(in), -0.5)': [1, 0, 0],
  'pwrs(V(in), 0.5)': [1, 0, 0], // ngbehavior=psa
};

/**
 * ngspice-47 psa `-r` raw output of TRAN_DECK at the PWL breakpoints, which
 * both simulators land on exactly (time, v(in), v(n2)).
 */
const TRAN_BREAKPOINTS: [number, number, number][] = [
  [0, 0, 0],
  [1e-3, 1, 1.000225684049215],
  [2e-3, -1, 0],
  [3e-3, 0, 0],
];

describe('B-source pow() with a zero base and an exponent below 1 (#886)', () => {
  for (const [expression, expected] of Object.entries(OP_EXPECTED)) {
    it(`.op converges for ${expression} like ngspice-47`, async () => {
      for (const [index, v1] of ['1', '0', '-1'].entries()) {
        const result = await simulate(deck(expression, v1));
        // Where default-mode ngspice-47 aborts (V1 = 0) the expected value
        // is the 0 its psa mode returns.
        expect(result.dc!.voltage('n2')).toBeCloseTo(expected[index] ?? 0, 12);
      }
    });
  }

  it('.tran of pwrs(V(in), 0.5) starting at V = 0 matches ngspice-47 psa', async () => {
    const result = await simulate(
      deck('pwrs(V(in), 0.5)', 'PWL(0 0 1m 1 2m -1 3m 0)', '.tran 0.1m 3m'),
    );
    const { time } = result.transient!;
    const vin = result.transient!.voltage('in');
    const vout = result.transient!.voltage('n2');
    expect(time.at(-1)).toBeCloseTo(3e-3, 15);

    // Every accepted point satisfies pwrs(v(in), 0.5) within reltol = 1e-3.
    for (let i = 0; i < time.length; i++) {
      const exact = Math.sign(vin[i]) * (vin[i] > 0 ? Math.sqrt(vin[i]) : 0);
      expect(Math.abs(vout[i] - exact)).toBeLessThanOrEqual(1e-3 * Math.abs(exact) + 1e-6);
    }
    for (const [t, vIn, vN2] of TRAN_BREAKPOINTS) {
      const i = time.findIndex(point => Math.abs(point - t) < 1e-12);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(vin[i]).toBeCloseTo(vIn, 12);
      expect(Math.abs(vout[i] - vN2)).toBeLessThanOrEqual(1e-3 * Math.abs(vN2) + 1e-6);
    }
  });
});
