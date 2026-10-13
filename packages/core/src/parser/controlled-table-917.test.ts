// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { parse, parseAsync } from './index.js';
import { tokenizeNetlist } from './tokenizer.js';
import { assertControlledSourceCard } from './controlled-source.js';

const cards = [
  'Elookup out 0 TABLE {v(in)} = (-1,-2) (0,0) (1,3)',
  'Glookup out 0 table {v(in) * 2} = (-1,-2m) (0,0) (1,3m)',
  'Elookup (out 0) TABLE {v(in)}=(-1,-2) (1,3)',
  'Glookup out 0 TABLE {v(in)} =\n+ (-1,-2m) (1,3m)',
];

function expectTableError(action: () => unknown): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ParseError);
  expect((caught as ParseError).message).toContain('TABLE');
  expect((caught as ParseError).message).toContain('not supported');
  expect((caught as ParseError).line).toBeGreaterThan(0);
  expect((caught as ParseError).context).toMatch(/lookup/i);
}

describe('controlled-source TABLE fails closed (#917)', () => {
  it.each(cards)('rejects the logical card before producing node tokens: %s', card => {
    expectTableError(() => tokenizeNetlist(card));
  });

  it.each(cards)('rejects a TABLE in a subcircuit during parsing: %s', card => {
    expectTableError(() => parse([
      'MIT TABLE safety probe', '.subckt lookup in out', card, '.ends lookup',
      'Vinput in 0 0.5', 'Xlookup in out lookup', 'Rload out 0 1k', '.op', '.end',
    ].join('\n')));
  });

  it('guards the direct linear controlled-source validator too', () => {
    expectTableError(() => assertControlledSourceCard(
      ['Glookup', 'out', '0', 'TABLE', '{v(in)}', '=', '(', '0', '0', ')'],
      17, 'Glookup out 0 TABLE {v(in)} = (0,0)',
    ));
  });

  it('rejects a top-level constant TABLE with its source location', () => {
    expectTableError(() => parse('probe\nElookup out 0 TABLE {0.5} = (0,0) (1,1)\n.op\n.end'));
  });

  it('rejects an included TABLE subcircuit without returning a circuit', async () => {
    const deck = 'probe\n.include "lookup.lib"\nVinput in 0 0.5\nXlookup in out lookup\n.op\n.end';
    await expect(parseAsync(deck, async () => [
      '.subckt lookup in out', cards[0], '.ends lookup',
    ].join('\n'))).rejects.toMatchObject({ name: 'ParseError' });
    await expect(parseAsync(deck, async () => [
      '.subckt lookup in out', cards[0], '.ends lookup',
    ].join('\n'))).rejects.toThrow(/TABLE.*not supported/);
  });

  it.each(['E', 'G'])('preserves a genuine linear %s control node named table', type => {
    const raw = `${type}linear out 0 table in 2`;
    expect(tokenizeNetlist(raw)[0].raw).toBe(raw);
    expect(() => assertControlledSourceCard([`${type}linear`, 'out', '0', 'table', 'in', '2'], 1, raw)).not.toThrow();
  });
});
