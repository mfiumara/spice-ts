import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { parse, parseAsync } from './index.js';
import { tokenizeNetlist } from './tokenizer.js';

const deck = (card: string) => `* issue 1056\n.param width=21u\n${card}\n.model nn nmos\n.op\n.end`;

describe('MOS instance names and malformed cards (#1056)', () => {
  it('parses the minimal m$615 reproducer without a wrapped TypeError', () => {
    expect(() => parse(deck('m$615 d g 0 0 nn w=21u l=2u'))).not.toThrow();
  });
  // ngspice-47 accepts all three names in a four-terminal MOS card.
  it.each(['m$615', 'm$600', 'mnd#/mp1'])('preserves %s and its instance parameters', async name => {
    const text = deck(`${name} d g 0 0 nn w={width} l=2u $ trailing comment`);
    expect(tokenizeNetlist(text)[1].tokens[0]).toBe(name);
    for (const circuit of [parse(text), await parseAsync(text)]) {
      const devices = circuit.compile().devices;
      expect(devices.map(device => device.name)).toContain(name);
    }
  });

  it('evaluates bare passive parameters after a dollar-bearing name', () => {
    expect(() => parse(deck('r$615 d g width')).compile()).not.toThrow();
  });

  it('keeps continuation parameters and strips whitespace-delimited comments', () => {
    const lines = tokenizeNetlist('m$615 d g 0 0 nn $ comment\n+ w=21u l=2u ; comment');
    expect(lines[0].tokens).toEqual(['m$615', 'd', 'g', '0', '0', 'nn', 'w=21u', 'l=2u']);
  });

  it('preserves dollar-bearing source and node names and strips comma-delimited comments', () => {
    expect(tokenizeNetlist('v$d5 d$1 0 1,$ comment')[0].tokens).toEqual(['v$d5', 'd$1', '0', '1']);
    expect(() => parse(deck('v$d5 d$1 0 1,$ comment')).compile()).not.toThrow();
  });

  // ngspice-47 rejects these incomplete cards. Do not leak a wrapped TypeError.
  it.each(['m', 'm$615', 'm1 d', 'm1 d g', 'm1 d g 0', 'm1 d g 0 w=1u'])('reports a structured error for %s', card => {
    let caught: unknown;
    try { parse(deck(card)); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ParseError);
    expect(caught).not.toBeInstanceOf(TypeError);
    expect((caught as ParseError).line).toBe(3);
    expect((caught as ParseError).message).not.toMatch(/toLowerCase|undefined|TypeError/);
    expect((caught as ParseError).message).toContain('MOSFET');
  });
});
