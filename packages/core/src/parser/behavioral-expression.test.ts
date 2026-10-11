import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import {
  compileBehavioralExpression,
  mapBehavioralNodes,
  parseBehavioralExpression,
  parseBehavioralSourceCard,
} from './behavioral-expression.js';

function evaluate(text: string, voltages: Record<string, number>) {
  const expression = parseBehavioralExpression(text);
  const compiled = compileBehavioralExpression(expression);
  const values = compiled.nodes.map(node => voltages[node] ?? 0);
  const gradient = new Float64Array(compiled.nodes.length);
  const value = compiled.evaluate(values, gradient);
  return {
    value,
    gradient: Object.fromEntries(compiled.nodes.map((node, index) => [node, gradient[index]])),
  };
}

describe('behavioral source expressions', () => {
  it('evaluates the mesa-oscillator load current and its exact node derivatives', () => {
    const text = '0.00025*tanh(v(1,2)/0.00025/2240)*(1+v(1,2)*0.027)';
    const v12 = 0.37;
    const x = v12 / 0.00025 / 2240;
    const expected = 0.00025 * Math.tanh(x) * (1 + v12 * 0.027);
    const derivative = (1 - Math.tanh(x) ** 2) / 2240 * (1 + v12 * 0.027)
      + 0.00025 * Math.tanh(x) * 0.027;

    const result = evaluate(text, { 1: 1.2, 2: 1.2 - v12 });

    expect(result.value).toBeCloseTo(expected, 15);
    expect(result.gradient['1']).toBeCloseTo(derivative, 12);
    expect(result.gradient['2']).toBeCloseTo(-derivative, 12);
  });

  it('honours precedence, unary minus, SPICE scale factors and ground references', () => {
    const result = evaluate('-2k*v(a)+3m/v(b,0)-v(0,a)*4', { a: 0.5, b: 2 });
    expect(result.value).toBeCloseTo(-2000 * 0.5 + 3e-3 / 2 + 0.5 * 4, 12);
    expect(result.gradient.a).toBeCloseTo(-2000 + 4, 12);
    expect(result.gradient.b).toBeCloseTo(-3e-3 / 4, 12);
    expect(Object.keys(result.gradient)).toEqual(['a', 'b']);
  });

  it('supports the ngspice transcendental functions with their derivatives', () => {
    const v = 0.3;
    const cases: Array<[string, number, number]> = [
      ['exp(v(x))', Math.exp(v), Math.exp(v)],
      ['sinh(v(x))', Math.sinh(v), Math.cosh(v)],
      ['cosh(v(x))', Math.cosh(v), Math.sinh(v)],
      ['atan(v(x))', Math.atan(v), 1 / (1 + v * v)],
      ['sin(v(x))', Math.sin(v), Math.cos(v)],
      ['cos(v(x))', Math.cos(v), -Math.sin(v)],
      ['abs(-v(x))', v, 1],
    ];
    for (const [text, value, slope] of cases) {
      const result = evaluate(text, { x: v });
      expect(result.value, text).toBeCloseTo(value, 14);
      expect(result.gradient.x, text).toBeCloseTo(slope, 14);
    }
    expect(evaluate('exp(300)', {}).value).toBe(1e99);
  });

  it('maps subcircuit-local node names without touching ground', () => {
    const mapped = mapBehavioralNodes(
      parseBehavioralExpression('v(1,2)+v(0)'),
      node => `x1.${node}`,
    );
    expect(compileBehavioralExpression(mapped).nodes).toEqual(['x1.1', 'x1.2']);
  });

  it('parses an I= behavioral source card from its raw text', () => {
    const card = parseBehavioralSourceCard(
      'bl1 1 2 i=0.00025*tanh(v(1,2)/0.00025/2240)*(1+v(1,2)*0.027)', 4,
    );
    expect(card.name).toBe('bl1');
    expect(card.nodes).toEqual(['1', '2']);
    expect(compileBehavioralExpression(card.expression).nodes).toEqual(['1', '2']);
  });

  it.each([
    ['b1 1 0 v=v(2)', "Unsupported behavioral source form: only 'I=<expression>' is supported"],
    ['b1 1 0 i=v(2) tc1=1', "Unsupported behavioral expression token 'tc1'"],
    ['b1 1 0 i=i(v1)', "Unsupported behavioral expression function 'i'"],
    ['b1 1 0 i=time*2', "Unsupported behavioral expression token 'time'"],
    ['b1 1 0 i=v(2)**2', "Unsupported behavioral expression operator '*'"],
    ['b1 1 0 i=v(2)^2', "Unsupported behavioral expression operator '^'"],
    ['b1 1 0 i=v(2)>1?1:0', "Unsupported behavioral expression operator '>'"],
    ['b1 1 0 i=sqrt(v(2))', "Unsupported behavioral expression function 'sqrt'"],
    ['b1 1 0 i=v(1,2,3)', 'v() takes one or two node names'],
    ['b1 1 0 i=(v(2)', "Expected ')'"],
    ['b1 1', 'B-card requires two nodes and an I= expression'],
  ])('rejects %s explicitly', (raw, message) => {
    let error: unknown;
    try {
      parseBehavioralSourceCard(raw, 7);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ParseError);
    expect((error as Error).message).toContain(message);
  });
});
