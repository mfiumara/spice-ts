// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from './index.js';
import { ParseError } from '../errors.js';

const inputs = [-2, -1, 0, .5, 1, 2];
const outputs = [-2, -1.95, .025, 1.5, 2.925, 3];
describe('ngspice-47 smoothed TABLE lowering (#917)', () => {
  for (const [index, input] of inputs.entries()) {
    it(`root E transfer at ${input}`, async () => {
      const result = await simulate(`MIT TABLE\nVinput in 0 ${input}\nElookup out 0 TABLE {v(in)} = (-1,-2) (0,0) (1,3)\nRload out 0 1k\n.op\n.end`);
      expect(result.op!.voltage('out')).toBeCloseTo(outputs[index], 8);
    });
    it(`per-instance params, port mapping and G multiplicity at ${input}`, async () => {
      const result = await simulate(`MIT TABLE\n.subckt lookup in out params: scale=1 mult=2\nGlookup out 0 TABLE {v(in)*scale} = (-1,-2m) (0,0) (1,3m) m={mult}\n.ends\nVinput in 0 ${input}\nVother other 0 .5\nXone in out lookup scale=1 mult=2\nXtwo other out2 lookup scale=2 mult=3\nRload out 0 1k\nRload2 out2 0 1k\n.op\n.end`);
      expect(result.op!.voltage('out')).toBeCloseTo(-2 * outputs[index], 8);
      expect(result.op!.voltage('out2')).toBeCloseTo(-3 * 2.925, 8);
    });
  }
  it('scopes branch-current input references', async () => {
    const result = await simulate('MIT TABLE\n.subckt lookup out params: bias=.5\nVlocal internal 0 {bias}\nRlocal internal 0 1\nElookup out 0 TABLE {i(Vlocal)} = (-1,-2) (0,0) (1,3)\n.ends\nXone out lookup\nXtwo out2 lookup bias=1\nRload out 0 1k\nRload2 out2 0 1k\n.op\n.end');
    expect(result.op!.voltage('out')).toBeCloseTo(-1, 8);
    expect(result.op!.voltage('out2')).toBeCloseTo(-1.95, 8);
  });
  for (const table of ['TABLE {v(in)} = (0,0)', 'TABLE {v(in)} = (0,0) (0,1)', 'TABLE {v(in)} = (0,0) (1)', 'TABLE {v(in)} = junk']) {
    it(`rejects malformed ${table}`, () => {
      expect(() => parse(`MIT malformed\nE1 out 0 ${table}\n.end`)).toThrow(ParseError);
    });
  }
});
