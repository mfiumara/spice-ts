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

describe('controlled-source TABLE front-end safety (#917)', () => {
  it.each(cards)('rejects the logical card before producing node tokens: %s', card => {
    expectTableError(() => tokenizeNetlist(card));
  });

  it.each(cards)('lowers a TABLE in a subcircuit before tokenization: %s', card => {
    const circuit = parse([
      'MIT TABLE safety probe', '.subckt lookup in out', card, '.ends lookup',
      'Vinput in 0 0.5', 'Xlookup in out lookup', 'Rload out 0 1k', '.op', '.end',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });

  it('guards the direct linear controlled-source validator too', () => {
    expectTableError(() => assertControlledSourceCard(
      ['Glookup', 'out', '0', 'TABLE', '{v(in)}', '=', '(', '0', '0', ')'],
      17, 'Glookup out 0 TABLE {v(in)} = (0,0)',
    ));
  });

  it('lowers a top-level constant TABLE', () => {
    expect(() => parse('probe\nElookup out 0 TABLE {0.5} = (0,0) (1,1)\n.op\n.end').compile()).not.toThrow();
  });

  it('lowers an included TABLE subcircuit', async () => {
    const deck = 'probe\n.include "lookup.lib"\nVinput in 0 0.5\nXlookup in out lookup\n.op\n.end';
    const circuit = await parseAsync(deck, async () => [
      '.subckt lookup in out', cards[0], '.ends lookup',
    ].join('\n'));
    expect(() => circuit.compile()).not.toThrow();
  });

  it.each(['E', 'G'])('preserves a genuine linear %s control node named table', type => {
    const raw = `${type}linear out 0 table in 2`;
    expect(tokenizeNetlist(raw)[0].raw).toBe(raw);
    expect(() => assertControlledSourceCard([`${type}linear`, 'out', '0', 'table', 'in', '2'], 1, raw)).not.toThrow();
  });

  it('preserves paired linear control nodes and a parameterized gain', () => {
    const raw = 'Glinear (out 0) (table in) {gain}';
    expect(tokenizeNetlist(raw)[0].raw).toBe(raw);
  });

  it('does not mistake a linear TABLE control node with m= for TABLE syntax', () => {
    const raw = 'Glinear out 0 table in 2 m=3';
    expect(tokenizeNetlist(raw)[0].raw).toBe(raw);
  });
});
