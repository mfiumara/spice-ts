import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { evaluateExpression } from './expression.js';

// ngspice-47 B-source values (PTustep/PTustep2/PTuramp in ptfuncs.c).
const cases: Array<[string, number, number]> = [
  ['u', -0.25, 0], ['u', 0, 0.5], ['u', 0.25, 1],
  ['u2', -0.25, 0], ['u2', 0, 0], ['u2', 0.25, 0.25],
  ['u2', 1, 1], ['u2', 1.25, 1],
  ['uramp', -0.25, 0], ['uramp', 0, 0], ['uramp', 0.25, 0.25],
];

describe('step functions in shared expressions (#1149)', () => {
  it.each(cases)('%s(%s) evaluates to %s', (name, x, expected) => {
    expect(evaluateExpression(`${name}(${x})`, {})).toBe(expected);
    expect(evaluateExpression(`${name.toUpperCase()}(x)`, { x })).toBe(expected);
  });

  it('matches ngspice-47 for constant quoted and voltage-dependent B-sources', async () => {
    const cards = cases.flatMap(([name, x], i) => [
      `Vx${i} x${i} 0 ${x}`,
      `Bc${i} c${i} 0 v='${name}(${x})'`,
      `Bv${i} v${i} 0 v=${name}(v(x${i}))`,
    ]);
    const result = await simulate(['step functions', ...cards, '.op', '.end'].join('\n'));
    cases.forEach(([, , expected], i) => {
      expect(result.dc!.voltage(`c${i}`)).toBeCloseTo(expected, 14);
      expect(result.dc!.voltage(`v${i}`)).toBeCloseTo(expected, 14);
    });
  });

  it('also exposes B-function values in .param expressions as a spice-ts extension', async () => {
    // Native ngspice-47 numparam rejects these names; this checks shared-evaluator
    // consistency, not native .param compatibility.
    const cards = cases.flatMap(([name, x], i) => [
      `.param p${i}='${name}(${x})'`,
      `V${i} n${i} 0 {p${i}}`,
    ]);
    const result = await simulate(['step parameters', ...cards, '.op', '.end'].join('\n'));
    cases.forEach(([, , expected], i) => {
      expect(result.dc!.voltage(`n${i}`)).toBeCloseTo(expected, 14);
    });
  });
});
