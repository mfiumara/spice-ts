import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { BehavioralRangeError, compileBehavioralExpression, parseBehavioralExpression } from './behavioral-expression.js';

/**
 * #891: `V(in)^-0.5` threw "0, -0.5 out of range for ^" on Newton's first
 * iterate (every node at 0), because pow(0, -0.5) = +Infinity was treated as
 * ngspice's HUGE error sentinel.
 *
 * ngspice-47 ifeval.c PTeval only reports E_PARMVAL when a node evaluates to
 * exactly HUGE, and ngspice.h takes HUGE from <math.h> (it only falls back to
 * HUGE_VAL on CYGWIN): FLT_MAX = 3.4028234663852886e38 on glibc and macOS.
 * ptfuncs.c returns HUGE for its own range errors (sqrt/log of a negative,
 * division by an exact zero); an IEEE +Infinity from pow() or an overflow is
 * an ordinary value.
 *
 * Expected values are ngspice-47 -b output for the identical decks
 * (`print v(n2)` after `op`):
 *   V1 = 0.25 -> v(n2) = 2.000000e+00
 *   V1 = 0    -> v(n2) = inf
 *   V1 = -1   -> v(n2) = 0.000000e+00
 */
const deck = (v1: string) =>
  `caret at the initial iterate (issue 891)\nV1 in 0 ${v1}\nB2 n2 0 V = V(in)^-0.5\nR2 n2 0 1k\n.op\n.end\n`;

describe('B-source ^ with a negative exponent at the all-zero initial iterate (#891)', () => {
  it('V1 = 0.25 converges to v(n2) = 2 like ngspice-47', async () => {
    const result = await simulate(deck('0.25'));
    expect(result.dc!.voltage('n2')).toBeCloseTo(2, 12);
  });

  it('V1 = -1 converges to v(n2) = 0 like ngspice-47 (PTpowerH non-integer exponent)', async () => {
    const result = await simulate(deck('-1'));
    expect(result.dc!.voltage('n2')).toBe(0);
  });

  it('V1 = 0 gives v(n2) = +inf like ngspice-47, not a range error', async () => {
    const result = await simulate(deck('0'));
    expect(result.dc!.voltage('n2')).toBe(Infinity);
  });

  it('only the HUGE sentinel (FLT_MAX), never an IEEE infinity, is a range error', () => {
    const evaluate = (text: string, x: number) =>
      compileBehavioralExpression(parseBehavioralExpression(text)).evaluate([x], new Float64Array(1));
    // ngspice-47: B1 n 0 V = V(x)*1e307 with V(x) = 400 prints v(n) = inf.
    expect(evaluate('v(x)*1e307', 400)).toBe(Infinity);
    expect(evaluate('v(x)^-0.5', 0)).toBe(Infinity);
    expect(evaluate('10^v(x)', 400)).toBe(Infinity);
    // ngspice-47: "Error: -400 out of range for sqrt".
    expect(() => evaluate('sqrt(v(x))', -400)).toThrow(BehavioralRangeError);
    expect(() => evaluate('log(v(x))', -1)).toThrow(BehavioralRangeError);
  });
});
