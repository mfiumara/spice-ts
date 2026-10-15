import { describe, expect, it } from 'vitest';
import { parse, parseAsync, parseTitleless } from '../index.js';
import { simulate } from '../../simulate.js';
import { UnsupportedControlCommandError } from './errors.js';

const circuit = 'V1 in 0 1\nR1 in 0 1k';

describe('ngspice-47 pre_set (#1097)', () => {
  it('accepts strict_errorhandling and runs the deck without changing valid results', async () => {
    const result = await simulate(`Strict\n${circuit}\n.op\n.control\npre_set strict_errorhandling\nrun\n.endc`);
    expect(result.dc!.voltage('in')).toBe(1);
  });

  it('hoists pre_set out of normal control flow, across blocks, in source order', async () => {
    const result = await simulate(`Hoisted\n${circuit}\n.control\necho $numdgt $?strict_errorhandling\nset numdgt=9\nif 0\npre_set numdgt = 4\nend\n.endc\n.control\nPRE_SET numdgt=7 strict_errorhandling\necho $numdgt\n.endc`);
    expect(result.control!.output).toEqual(['7 1', '9']);
  });

  it('stores quoted and list values using set semantics', async () => {
    const result = await simulate(`Values\n${circuit}\n.control\necho $color0 $color1\npre_set color0="light blue" color1=(red green)\n.endc`);
    expect(result.control!.output).toEqual(['light blue red green']);
  });

  it('substitutes earlier pre_set values but does not allow injected loading settings', async () => {
    const result = await simulate(`Substitution\n${circuit}\n.control\npre_set color0=blue\npre_set color1=$color0\necho $color1\n.endc`);
    expect(result.control!.output).toEqual(['blue']);
    await expect(simulate(`Injection\n${circuit}\n.control\npre_set color0="blue ngbehavior=ps"\npre_set color1=$color0\n.endc`))
      .rejects.toMatchObject({ command: 'pre_set' });
  });

  it('accepts bare pre_set as variable listing and does not leak flags between decks', async () => {
    const first = await simulate(`First\n${circuit}\n.control\npre_set\npre_set strict_errorhandling\necho $?strict_errorhandling\n.endc`);
    const second = await simulate(`Second\n${circuit}\n.control\necho $?strict_errorhandling\n.endc`);
    expect(first.control!.output).toEqual(['1']);
    expect(second.control!.output).toEqual(['0']);
  });

  it.each(['ngbehavior=ps', 'nosubckt', 'temp=50', 'unknown_loading_mode=1'])('rejects unsupported loading effects before circuit parsing: %s', (setting) => {
    const deck = `Unsupported\ninvalid device\n.control\npre_set ${setting}\n.endc`;
    expect(() => parse(deck)).toThrow(UnsupportedControlCommandError);
    try { parse(deck); } catch (error) {
      expect(error).toMatchObject({ command: 'pre_set', line: 4 });
    }
  });

  it('preserves fail-fast parse errors under strict_errorhandling on every parser entry point', async () => {
    // Bare resistors are ignored by ngspice-47; use an invalid extra token instead.
    const body = 'V1 in 0 1\nR1 in 0 1k 2k 3k\n.control\npre_set strict_errorhandling\n.endc';
    expect(() => parse(`Bad\n${body}`)).toThrow("Unexpected resistor token '3k'");
    expect(() => parseTitleless(body)).toThrow("Unexpected resistor token '3k'");
    await expect(parseAsync(`Bad\n${body}`)).rejects.toThrow("Unexpected resistor token '3k'");
  });

  it('does not suppress control errors when strict_errorhandling is set', async () => {
    await expect(simulate(`Bad control\n${circuit}\n.control\npre_set strict_errorhandling\nlet missing = absent\n.endc`)).rejects.toThrow('no such vector');
  });
});
