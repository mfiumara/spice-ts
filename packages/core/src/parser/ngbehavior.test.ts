import { describe, expect, it } from 'vitest';
import { parse, parseAsync, parseTitleless } from './index.js';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';

const deck = (options: string) => `compatibility\n${options}\nV1 in 0 2\nR1 in 0 1k\n.op\n.end`;

describe('ngbehavior option (#812 / 695)', () => {
  it.each(['hs', 'ps', 'xs', 'lt', 'ki', 'a', 'll', 'all', 's3', 'eg', 'spe', 'mc', 'psa', 'lta', 'kipsa'])('retains canonical mode %s', mode => {
    const circuit = parse(deck(`.options ngbehavior=${mode}`));
    expect(circuit.simulationOptions.ngbehavior?.mode).toBe(mode);
    expect(parse(circuit.toNetlist()).simulationOptions.ngbehavior).toEqual(circuit.simulationOptions.ngbehavior);
    expect(circuit.compile().simulationOptions.ngbehavior).toEqual(circuit.simulationOptions.ngbehavior);
  });

  it('normalizes mixed case, supports singular and titleless/async entry points, and keeps the last assignment', async () => {
    const text = deck('.options ngbehavior=lt\n.OpTiOn NGbEhAvIoR=PSA reltol=2m');
    for (const circuit of [parse(text), await parseAsync(text), parseTitleless(text.split('\n').slice(1).join('\n'))]) {
      expect(circuit.simulationOptions.ngbehavior).toMatchObject({ mode: 'psa', flags: { ps: true, a: true, lt: false } });
      expect(circuit.simulationOptions.reltol).toBe(0.002);
    }
  });

  it.each([
    ['hsps', { ps: true, hs: false }],
    ['psltkiegspe', { spe: true, ps: false, lt: false, ki: false, eg: false }],
    ['all', { a: true, ll: true, ps: false, lt: false }],
    ['s3psmc', { mc: true, s3: true, ps: false, a: false }],
  ])('mirrors set_compat_mode flag precedence for %s', (mode, flags) => {
    expect(parse(deck(`.options ngbehavior=${mode}`)).simulationOptions.ngbehavior?.flags).toMatchObject(flags);
  });

  it.each(['unknown', 'psgarbage', '42', '', 'ps,lt'])('rejects noncanonical mode %s with context', mode => {
    const card = `.options ngbehavior=${mode}`;
    expect(() => parse(deck(card))).toThrow(ParseError);
    try { parse(deck(card)); } catch (error) {
      expect(error).toMatchObject({ line: 2, context: card });
      expect((error as Error).message).toContain('Invalid .options ngbehavior');
    }
  });

  it('rejects a bare ngbehavior flag', () => {
    expect(() => parse(deck('.options ngbehavior'))).toThrow(ParseError);
  });

  it('does not leak mode across circuits or change native results', async () => {
    expect(parse(deck('')).simulationOptions).not.toHaveProperty('ngbehavior');
    for (const mode of ['', 'ps', 'lt', 'mc']) {
      const result = await simulate(deck(mode ? `.options ngbehavior=${mode}` : ''));
      expect(result.dc?.voltages.get('in')).toBe(2);
    }
  });
});

describe('ngspice-47 negative sqrt (#828)', () => {
  it.each(['', 'ps', 'lt', 'pslt'])('rejects in mode %s without vendor extensions', async mode => {
    const text = `sqrt domain\n${mode ? `.options ngbehavior=${mode}` : ''}\nVa a 0 0\nB1 y 0 v=3+sqrt(v(a)-4)\n.op\n.end`;
    await expect(simulate(text)).rejects.toThrow();
  });
});
