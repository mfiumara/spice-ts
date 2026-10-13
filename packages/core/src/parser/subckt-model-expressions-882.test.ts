import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { parse } from './index.js';
import { simulate } from '../simulate.js';

// Self-written reductions of the .model blockers in ngspice-bugs #784/#738.
// Models must be evaluated after body .params, once per instance, not at parse time.
export const issueDeck = (parameter: string, expression = `pwr(${parameter},0.5)/1e11`): string => [
  'model param from subckt-local .param',
  '.subckt femt 1 2',
  `.model dvnf d (kf={${expression}} is=1e-16)`,
  'i1 0 1 10e-3',
  'd1 1 2 dvnf',
  `.param ${parameter}=1e-3`,
  '.ends',
  'x1 a 0 femt',
  'r1 a 0 1k',
  '.op',
  '.end',
].join('\n');

function models(deck: string) {
  return parse(deck).compile().models;
}

describe('instance-scoped .model expressions (#882)', () => {
  for (const parameter of ['flwf', 'flw']) {
    it(`resolves the #${parameter === 'flwf' ? '784' : '738'} KF blocker and runs its reduction`, async () => {
      const deck = issueDeck(parameter);
      expect(models(deck).get('x1:dvnf')!.params.KF).toBeCloseTo(Math.sqrt(1e-3) / 1e11, 25);
      // Expression handling must preserve the literal model's simulation.
      // The ngspice voltage comparison is recorded separately (not exact parity).
      const literal = deck.replace(`{pwr(${parameter},0.5)/1e11}`, String(Math.sqrt(1e-3) / 1e11));
      expect((await simulate(deck)).dc!.voltage('a')).toBe((await simulate(literal)).dc!.voltage('a'));
    });
  }

  it('evaluates a constant function expression too', () => {
    expect(models(issueDeck('flwf', 'sqrt(1e-3)')).get('x1:dvnf')!.params.KF).toBeCloseTo(Math.sqrt(1e-3), 15);
  });

  it('keeps multiple instances distinct and orders late body parameter dependencies', () => {
    const deck = [
      'scoped model dependencies', '.param scale=9',
      '.subckt cell a scale=1',
      '.model dm d (is={islocal} kf={noise})',
      'd1 a 0 dm',
      '.param islocal={base*scale} noise={pwr(scale,0.5)/1e11}',
      '.param base=1e-16', '.ends',
      'v1 a 0 0.5', 'v2 b 0 0.5',
      'x1 a cell scale=2', 'x2 b cell scale=4', '.op', '.end',
    ].join('\n');
    const compiled = models(deck);
    expect(compiled.get('x1:dm')!.params.IS).toBeCloseTo(2e-16, 28);
    expect(compiled.get('x2:dm')!.params.IS).toBeCloseTo(4e-16, 28);
    expect(compiled.get('x1:dm')!.params.KF).toBeCloseTo(Math.sqrt(2) / 1e11, 23);
    expect(compiled.get('x2:dm')!.params.KF).toBeCloseTo(2e-11, 23);
  });

  it('uses the enclosing definition scope and nested overrides independently', () => {
    const deck = [
      'nested model scopes', '.subckt outer a scale=1',
      '.model parent d is={base*scale}',
      '.subckt inner b mult=1',
      '.model child d is={base*scale*mult}',
      'd1 b 0 child', 'd2 b 0 parent', '.ends inner',
      'xchild a inner mult=3', '.param base=1e-16', '.ends outer',
      'v1 a 0 0.5', 'v2 b 0 0.5',
      'x1 a outer scale=2', 'x2 b outer scale=4', '.op', '.end',
    ].join('\n');
    const compiled = models(deck);
    expect(compiled.get('x1:parent')!.params.IS).toBeCloseTo(2e-16, 28);
    expect(compiled.get('x2:parent')!.params.IS).toBeCloseTo(4e-16, 28);
    expect(compiled.get('x1.xchild:child')!.params.IS).toBeCloseTo(6e-16, 28);
    expect(compiled.get('x2.xchild:child')!.params.IS).toBeCloseTo(12e-16, 28);
  });

  it('accepts quoted values, spaces and a continuation with no equals sign', () => {
    const deck = issueDeck('flwf').replace(
      '.model dvnf d (kf={pwr(flwf,0.5)/1e11} is=1e-16)',
      ".model dvnf d (kf = 'pwr(flwf, 0.5) / 1e11'\n+ is {flwf * 1e-13})",
    );
    const model = models(deck).get('x1:dvnf')!;
    expect(model.params.KF).toBeCloseTo(Math.sqrt(1e-3) / 1e11, 25);
    expect(model.params.IS).toBeCloseTo(1e-16, 28);
  });

  it('resolves expressions before translating PSpice switch models', async () => {
    const deck = [
      'switch model scope', '.subckt cell a b',
      '.model sm vswitch (ron={r} roff={r*1e6} von={hi} voff=0)',
      's1 a 0 b 0 sm', '.param r=2 hi=1', '.ends',
      'v1 a 0 1', 'v2 b 0 2', 'x1 a b cell', '.op', '.end',
    ].join('\n');
    expect((await simulate(deck)).dc!.current('v1')).toBeCloseTo(-0.5, 10);
  });

  it('reports an undefined model expression with its original deck line', () => {
    const deck = issueDeck('flwf', 'missing');
    try {
      models(deck);
      expect.fail('undefined model expression must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).line).toBe(3);
      expect((error as ParseError).context).toContain('.model dvnf');
      expect((error as Error).message).toContain("Undefined variable 'missing'");
    }
  });

  it('evaluates resistor models without bypassing unsupported parameter validation', async () => {
    const deck = [
      'resistor model scope', '.subckt cell a',
      '.model rm res (r={value})', 'r1 a 0 rm', '.param value=2k', '.ends',
      'v1 a 0 1', 'x1 a cell', '.op', '.end',
    ].join('\n');
    expect(models(deck).get('x1:rm')!.params.R).toBe(2000);
    expect((await simulate(deck)).dc!.current('v1')).toBeCloseTo(-0.0005, 12);
    expect(() => models(deck.replace('r={value}', 'r={value} unknown=2'))).toThrow('Unsupported resistor');
  });

  it('reports a cyclic dependency feeding a model at the defining .param card', () => {
    const deck = issueDeck('flwf').replace('.param flwf=1e-3', '.param flwf={other} other={flwf}');
    try {
      models(deck);
      expect.fail('cyclic model dependency must fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).line).toBe(6);
      expect((error as Error).message).toContain('Circular .param dependency');
    }
  });
});
