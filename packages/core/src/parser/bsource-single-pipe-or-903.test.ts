import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';
import {
  BehavioralRangeError,
  compileBehavioralExpression,
  formatBehavioralExpression,
  parseBehavioralExpression,
} from './behavioral-expression.js';

/**
 * Self-written reductions (MIT), not redistributed vendor-library bytes.
 * ngspice-47 translates single | to || in included PSpice libraries (psa
 * and ltps), not in top-level B-cards or default mode. The identical included
 * model below produces these values in both compatibility modes. Accepting
 * the alias directly also widens spice-ts's top-level B-card syntax.
 */
const TRUTH_CASES: readonly (readonly [string, number])[] = [
  ['0 | 0', 0],
  ['0 | 2', 1],
  ['-2 | 0', 1],
  ['2 | -2', 1],
  ['0 | -1e-30', 1],
  ['0 | 1e-30', 1],
  ['-0 | 0', 0],
  ['2 | 0 == 1', 1],
  ['2 | 0 > 1', 1],
  ['0 | 1 + 1', 1],
  ['0 | 1 ? 7 : 9', 7],
  ['0 ? 7 : 0 | 2', 1],
  ['0 | 0 | 3', 1],
];
const PORTS = TRUTH_CASES.map((_, i) => `n${i}`).join(' ');
const MODEL = `.subckt logic x out cur ${PORTS}
${TRUTH_CASES.map(([text], i) => `B${i} n${i} 0 V = (${text})`).join('\n')}
Eif out 0 VALUE = {IF((V(x)>10E-3 | V(x)<-10E-3),1,0)}
Gi cur 0 VALUE = {IF((V(x)>10E-3 | V(x)<-10E-3),1m,0)}
Ri cur 0 1k
.ends logic
`;
const DECK = `Self-written single-pipe OR truth table (#903)
V1 x 0 0
X1 x out cur ${PORTS} logic
.dc V1 -0.02 0.02 0.01
.include "model.lib"
.end
`;

function evaluate(text: string, values: number[] = []): number {
  const compiled = compileBehavioralExpression(parseBehavioralExpression(text));
  return compiled.evaluate(values, new Float64Array(compiled.nodes.length));
}

describe('single-pipe B-source boolean OR (#903)', () => {
  it.each(TRUTH_CASES)('evaluates %s to the included-library ngspice-47 value %s', (text, expected) => {
    expect(evaluate(text)).toBe(expected);
    expect(parseBehavioralExpression(text)).toEqual(parseBehavioralExpression(text.replaceAll('|', '||')));
  });

  // ngspice's library translator skips lines containing existing || or &&.
  // These are alias/grammar consistency checks, not identical-deck parity claims.
  it.each([
    ['1 | 0 && 0', 1],
    ['0 && 1 | 2', 1],
    ['(1 | 0) && 0', 0],
    ['0 | 0 || -2', 1],
    ['0 || 0 | -2', 1],
  ] as const)('preserves existing logical precedence in %s', (text, expected) => {
    expect(evaluate(text)).toBe(expected);
    expect(parseBehavioralExpression(text)).toEqual(
      parseBehavioralExpression(text.replace(/(?<!\|)\|(?!\|)/g, '||')),
    );
  });

  it('runs the identical included model and parenthesized IF through the public API', async () => {
    const result = await simulate(DECK, { resolveInclude: async () => MODEL });
    const sweep = result.dcSweep!;
    for (const [i, [, expected]] of TRUTH_CASES.entries()) {
      expect(Array.from(sweep.voltage(`n${i}`))).toEqual(Array(5).fill(expected));
    }
    expect(Array.from(sweep.voltage('out'))).toEqual([1, 0, 0, 0, 1]);
    expect(Array.from(sweep.voltage('cur'))).toEqual([-1, 0, 0, 0, -1]);
  });

  it('accepts the alias on top-level voltage/current B-cards without changing ||', async () => {
    const deck = `Direct B-card alias extension (#903)
V1 x 0 0
Bv out 0 V = (IF((V(x)>10E-3 | V(x)<-10E-3),1,0))
Bi cur 0 I = (IF((V(x)>10E-3 | V(x)<-10E-3),1m,0))
Ri cur 0 1k
.dc V1 -0.02 0.02 0.01
.end
`;
    const single = (await simulate(deck)).dcSweep!;
    const double = (await simulate(deck.replaceAll('|', '||'))).dcSweep!;
    for (const node of ['out', 'cur']) {
      expect(Array.from(single.voltage(node))).toEqual(Array.from(double.voltage(node)));
    }
    expect(Array.from(single.voltage('out'))).toEqual([1, 0, 0, 0, 1]);
    expect(Array.from(single.voltage('cur'))).toEqual([-1, 0, 0, 0, -1]);
  });

  it('keeps zero logical derivatives and only the selected IF branch derivative', () => {
    const logical = compileBehavioralExpression(parseBehavioralExpression('V(a) | V(b)'));
    const selected = compileBehavioralExpression(parseBehavioralExpression('IF(V(a) | V(b), 2*V(a), 3*V(b))'));
    for (const values of [[0, 0], [-1, 0], [0, -1e-30]]) {
      const gradient = new Float64Array([99, 99]);
      const truth = values.some(value => value !== 0);
      expect(logical.evaluate(values, gradient)).toBe(truth ? 1 : 0);
      expect(Array.from(gradient)).toEqual([0, 0]);
      expect(selected.evaluate(values, gradient)).toBe(truth ? 2 * values[0] : 3 * values[1]);
      expect(Array.from(gradient)).toEqual(truth ? [2, 0] : [0, 3]);
    }
  });

  it('retains eager OR range errors and round-trips the normalized tree', () => {
    expect(() => evaluate('1 | sqrt(-1)')).toThrow(BehavioralRangeError);
    const tree = parseBehavioralExpression('IF(V(a) | V(b), V(a), V(b))');
    const formatted = formatBehavioralExpression(tree);
    expect(formatted).toContain('||');
    expect(parseBehavioralExpression(formatted)).toEqual(tree);
  });

  it.each([
    ['V(x) |', 'Unexpected end of behavioral expression'],
    ['| V(x)', "Unsupported behavioral expression operator '|'"],
    ['V(x) ||| 0', "Unsupported behavioral expression operator '|'"],
    ['V(x) | | 0', "Unsupported behavioral expression operator '|'"],
    ['IF((V(x) | 0),1)', 'if() takes three arguments'],
    ['IF((V(x) | 0),1,0', "Expected ')'"],
    ['V(x) & 0', "Unsupported behavioral expression operator '&'"],
    ['~V(x)', "Unsupported behavioral expression operator '~'"],
    ['frobnicate(V(x) | 0)', "Unsupported behavioral expression function 'frobnicate'"],
  ])('retains structured parser errors for %s', async (text, message) => {
    const raw = `B1 out 0 V = ${text}`;
    const error = await simulate(`Malformed OR (#903)\nV1 x 0 0\n${raw}\n.op\n.end\n`).catch(error => error);
    expect(error).toBeInstanceOf(ParseError);
    expect(error).toMatchObject({ name: 'ParseError', line: 3, context: raw });
    expect(error.message).toContain(message);
    expect(() => parseBehavioralExpression(text)).toThrow(message);
  });
});
