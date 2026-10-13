import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { BehavioralVoltageSource } from '../devices/behavioral-source.js';
import { compileBehavioralExpression, parseBehavioralExpression } from './behavioral-expression.js';

// Original, MIT-licensed decks; expected values from identical ngspice-47 decks.
const deck = (input: string, expression: string) =>
  `overflow\nV1 in 0 ${input}\nB2 n2 0 V = ${expression}\nR2 n2 0 1k\n.op\n.end\n`;

describe('B-source finite-Jacobian overflow (#899)', () => {
  it('certifies only an infinite expression evaluated at finite controls', () => {
    const source = new BehavioralVoltageSource('B2', [1, -1, 0], 0,
      compileBehavioralExpression(parseBehavioralExpression('V(in)*1e307')));
    for (const [control, accepted] of [
      [400, true], [-400, true], [10, false], [Infinity, false], [-Infinity, false], [NaN, false],
    ] as const) {
      expect(source.hasInfiniteValueAtFiniteControls(new Float64Array([control, Infinity]))).toBe(accepted);
    }
  });

  for (const [input, expected] of [['400', Infinity], ['-400', -Infinity]] as const) {
    it(`propagates the expression overflow at V(in)=${input}`, async () => {
      const result = await simulate(deck(input, 'V(in)*1e307'));
      expect(result.dc!.voltage('in')).toBe(Number(input));
      expect(result.dc!.voltage('n2')).toBe(expected);
      expect(result.dc!.current('B2')).toBe(-expected);
    });
  }

  it('retains finite output below the overflow boundary', async () => {
    const result = await simulate(deck('10', 'V(in)*1e307'));
    expect(result.dc!.voltage('n2') / 1e308).toBeCloseTo(1, 12);
  });

  it('retains a finite bounded expression despite its huge initial derivative', async () => {
    // Huge derivative at zero, bounded expression at every finite control value.
    const result = await simulate(deck('400', 'tanh(V(in)*1e307)'));
    expect(result.dc!.voltage('n2')).toBe(1);
  });

  it('does not bypass factorisation failure for conflicting voltage sources', async () => {
    await expect(simulate(deck('400', 'V(in)*1e307').replace('R2', 'V2 n2 0 1\nR2')))
      .rejects.toThrow();
  });
});
