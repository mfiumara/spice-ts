import { describe, it, expect } from 'vitest';
import { preprocess } from './preprocessor.js';

describe('preprocessor', () => {
  describe('.param substitution', () => {
    it('substitutes a simple param into a device value', async () => {
      const input = `.param rval = 1000\nR1 1 0 {rval}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('R1 1 0 1000');
      expect(result).not.toContain('.param');
      expect(result).not.toContain('{');
    });

    it('substitutes param with SI suffix', async () => {
      const input = `.param cap = 100n\nC1 1 0 {cap}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('C1 1 0 1e-7');
    });

    it('substitutes param expression', async () => {
      const input = `.param w = 1e-6\n.param w2 = {w*2}\nM1 d g s NMOD W={w2}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('W=0.000002');
    });

    it('handles multiple params', async () => {
      const input = `.param a = 2\n.param b = 3\nR1 1 0 {a+b}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('R1 1 0 5');
    });

    it('passes through netlist with no directives unchanged', async () => {
      const input = 'V1 1 0 DC 5\nR1 1 0 1k\n.op';
      const result = await preprocess(input);
      expect(result).toBe(input);
    });

    it('preserves .subckt blocks without evaluating internal params', async () => {
      const input = `.subckt inv in out W=1u\nR1 in out {W}\n.ends inv\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('.subckt inv in out W=1u');
      expect(result).toContain('{W}');
    });

    it('handles .param with = sign and spaces', async () => {
      const input = `.param vdd = 1.8\nV1 1 0 DC {vdd}\n.op`;
      const result = await preprocess(input);
      expect(result).toContain('V1 1 0 DC 1.8');
    });
  });
});
