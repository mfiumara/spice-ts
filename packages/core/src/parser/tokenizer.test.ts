import { describe, it, expect } from 'vitest';
import { parseNumber } from './tokenizer.js';

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

  describe('SI suffixes (case-sensitive)', () => {
    it('parses k/K as kilo (1e3)', () => {
      expect(parseNumber('10k')).toBe(10000);
      expect(parseNumber('4.7K')).toBe(4700);
    });

    it('parses m as milli (1e-3)', () => {
      expect(parseNumber('2.2m')).toBeCloseTo(0.0022);
    });

    it('parses M as mega (1e6)', () => {
      expect(parseNumber('1M')).toBe(1e6);
      expect(parseNumber('10M')).toBe(10e6);
    });

    it('parses meg/MEG as mega (1e6)', () => {
      expect(parseNumber('2.2meg')).toBe(2.2e6);
      expect(parseNumber('1MEG')).toBe(1e6);
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
  });

  describe('embedded suffix notation', () => {
    it('parses 3k3 as 3300', () => {
      expect(parseNumber('3k3')).toBe(3300);
    });

    it('parses 4M7 as 4700000', () => {
      expect(parseNumber('4M7')).toBe(4700000);
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
