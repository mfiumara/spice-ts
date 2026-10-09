import { describe, it, expect } from 'vitest';
import { parseNumber, tokenizeNetlist } from './tokenizer.js';

describe('parseNumber', () => {
  it('parses plain integers', () => {
    expect(parseNumber('42')).toBe(42);
  });

  it('parses plain floats', () => {
    expect(parseNumber('3.14')).toBeCloseTo(3.14);
  });

  it('parses scientific notation', () => {
    expect(parseNumber('1e-14')).toBe(1e-14);
    expect(parseNumber('2.5E3')).toBe(2500);
  });

  describe('ngspice scale factors', () => {
    it('parses k/K as kilo (1e3)', () => {
      expect(parseNumber('10k')).toBe(10000);
      expect(parseNumber('4.7K')).toBe(4700);
    });

    it('parses m as milli (1e-3)', () => {
      expect(parseNumber('2.2m')).toBeCloseTo(0.0022);
    });

    it('parses m/M as milli (1e-3)', () => {
      expect(parseNumber('1M')).toBe(1e-3);
      expect(parseNumber('10m')).toBe(10e-3);
    });

    it('parses meg/MEG as mega (1e6)', () => {
      expect(parseNumber('2.2meg')).toBe(2.2e6);
      expect(parseNumber('1MEG')).toBe(1e6);
    });

    it('parses mil as one thousandth of an inch', () => {
      expect(parseNumber('1mil')).toBe(25.4e-6);
      expect(parseNumber('10MIL')).toBe(254e-6);
    });

    it('parses u as micro (1e-6)', () => {
      expect(parseNumber('100u')).toBe(100e-6);
    });

    it('parses n as nano (1e-9)', () => {
      expect(parseNumber('100n')).toBe(100e-9);
    });

    it('parses p as pico (1e-12)', () => {
      expect(parseNumber('10p')).toBe(10e-12);
    });

    it('parses f as femto (1e-15)', () => {
      expect(parseNumber('1f')).toBe(1e-15);
    });

    it('parses T as tera (1e12)', () => {
      expect(parseNumber('1T')).toBe(1e12);
    });

    it('parses G as giga (1e9)', () => {
      expect(parseNumber('2G')).toBe(2e9);
    });

    it('ignores letters following a number or scale factor', () => {
      expect(parseNumber('10Volts')).toBe(10);
      expect(parseNumber('1kHz')).toBe(1e3);
      expect(parseNumber('2.2MegOhm')).toBe(2.2e6);
    });
  });

  describe('embedded suffix notation', () => {
    it('parses 3k3 as 3300', () => {
      expect(parseNumber('3k3')).toBe(3300);
    });

    it('parses 4M7 as 0.0047', () => {
      expect(parseNumber('4M7')).toBeCloseTo(0.0047);
    });

    it('parses 1k5 as 1500', () => {
      expect(parseNumber('1k5')).toBe(1500);
    });

    it('parses 2n2 as 2.2e-9', () => {
      expect(parseNumber('2n2')).toBeCloseTo(2.2e-9);
    });

    it('parses 4meg7 as 4.7e6', () => {
      expect(parseNumber('4meg7')).toBe(4.7e6);
    });
  });

  it('throws on unparseable tokens', () => {
    expect(() => parseNumber('abc')).toThrow('Cannot parse number');
  });
});

describe('tokenizeNetlist', () => {
  it('removes end-of-line comments before merging required continuation syntax', () => {
    const lines = tokenizeNetlist('.tran 1n $ step\n+ 10n ; stop time\n.op // trailing comment');

    expect(lines).toEqual([
      { raw: '.tran 1n 10n', lineNumber: 1, tokens: ['.tran', '1n', '10n'] },
      { raw: '.op', lineNumber: 3, tokens: ['.op'] },
    ]);
  });
});
