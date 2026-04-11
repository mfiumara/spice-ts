import { describe, it, expect } from 'vitest';
import { preprocess } from './preprocessor.js';
import type { IncludeResolver } from '../types.js';

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

  describe('.include resolution', () => {
    it('resolves a simple .include', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'models.lib') return '.model DMOD D(IS=1e-14)';
        throw new Error(`Unknown file: ${path}`);
      };
      const input = `.include 'models.lib'\nD1 1 0 DMOD\n.op`;
      const result = await preprocess(input, resolver);
      expect(result).toContain('.model DMOD D(IS=1e-14)');
      expect(result).toContain('D1 1 0 DMOD');
      expect(result).not.toContain('.include');
    });

    it('strips quotes from include path', async () => {
      const paths: string[] = [];
      const resolver: IncludeResolver = async (path) => {
        paths.push(path);
        return '* empty';
      };
      await preprocess(`.include "file.lib"\n.op`, resolver);
      expect(paths).toEqual(['file.lib']);
    });

    it('handles unquoted include path', async () => {
      const paths: string[] = [];
      const resolver: IncludeResolver = async (path) => {
        paths.push(path);
        return '* empty';
      };
      await preprocess(`.include file.lib\n.op`, resolver);
      expect(paths).toEqual(['file.lib']);
    });

    it('resolves recursive includes', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'a.lib') return `.include 'b.lib'\n.model A D(IS=1e-14)`;
        if (path === 'b.lib') return '.model B D(IS=2e-14)';
        throw new Error(`Unknown: ${path}`);
      };
      const result = await preprocess(`.include 'a.lib'\n.op`, resolver);
      expect(result).toContain('.model A D(IS=1e-14)');
      expect(result).toContain('.model B D(IS=2e-14)');
    });

    it('detects circular includes', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'a.lib') return `.include 'b.lib'`;
        if (path === 'b.lib') return `.include 'a.lib'`;
        throw new Error(`Unknown: ${path}`);
      };
      await expect(preprocess(`.include 'a.lib'\n.op`, resolver))
        .rejects.toThrow('Circular dependency detected');
    });

    it('throws when resolver is not provided', async () => {
      await expect(preprocess(`.include 'file.lib'\n.op`))
        .rejects.toThrow();
    });

    it('throws on depth limit exceeded', async () => {
      const resolver: IncludeResolver = async (path) => {
        const n = parseInt(path.replace('file', '').replace('.lib', ''));
        if (n < 65) return `.include 'file${n + 1}.lib'`;
        return '* end';
      };
      await expect(preprocess(`.include 'file0.lib'\n.op`, resolver))
        .rejects.toThrow();
    });
  });

  describe('.lib/.endl section selection', () => {
    it('selects the requested section from a file', async () => {
      const libContent = [
        '.lib TT',
        '.model nch nmos(VTO=0.5 KP=120u)',
        '.endl TT',
        '.lib FF',
        '.model nch nmos(VTO=0.4 KP=140u)',
        '.endl FF',
      ].join('\n');
      const resolver: IncludeResolver = async () => libContent;
      const result = await preprocess(`.lib 'models.lib' TT\n.op`, resolver);
      expect(result).toContain('VTO=0.5');
      expect(result).not.toContain('VTO=0.4');
    });

    it('includes unconditional content outside sections', async () => {
      const libContent = [
        '* Shared content',
        '.param vdd = 1.8',
        '.lib TT',
        '.model nch nmos(VTO=0.5)',
        '.endl TT',
      ].join('\n');
      const resolver: IncludeResolver = async () => libContent;
      const result = await preprocess(`.lib 'models.lib' TT\n.op`, resolver);
      expect(result).toContain('VTO=0.5');
    });

    it('handles .lib with section containing .include', async () => {
      const topLib = [
        '.lib TT',
        `.include 'tt-models.lib'`,
        '.endl TT',
      ].join('\n');
      const resolver: IncludeResolver = async (path) => {
        if (path === 'top.lib') return topLib;
        if (path === 'tt-models.lib') return '.model nch nmos(VTO=0.5)';
        throw new Error(`Unknown: ${path}`);
      };
      const result = await preprocess(`.lib 'top.lib' TT\n.op`, resolver);
      expect(result).toContain('VTO=0.5');
    });

    it('detects circular .lib references', async () => {
      const resolver: IncludeResolver = async (path) => {
        if (path === 'a.lib') return `.lib TT\n.lib 'b.lib' TT\n.endl TT`;
        if (path === 'b.lib') return `.lib TT\n.lib 'a.lib' TT\n.endl TT`;
        throw new Error(`Unknown: ${path}`);
      };
      await expect(preprocess(`.lib 'a.lib' TT\n.op`, resolver))
        .rejects.toThrow('Circular dependency detected');
    });

    it('throws when resolver not provided for .lib with file', async () => {
      await expect(preprocess(`.lib 'models.lib' TT\n.op`))
        .rejects.toThrow();
    });
  });
});
