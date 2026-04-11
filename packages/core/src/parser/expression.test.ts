import { describe, it, expect } from 'vitest';
import { evaluateExpression } from './expression.js';

describe('evaluateExpression', () => {
  describe('basic arithmetic', () => {
    it('evaluates integer addition', () => {
      expect(evaluateExpression('1+2', {})).toBe(3);
    });

    it('evaluates subtraction', () => {
      expect(evaluateExpression('5-3', {})).toBe(2);
    });

    it('evaluates multiplication', () => {
      expect(evaluateExpression('3*4', {})).toBe(12);
    });

    it('evaluates division', () => {
      expect(evaluateExpression('10/4', {})).toBe(2.5);
    });

    it('evaluates exponentiation', () => {
      expect(evaluateExpression('2**3', {})).toBe(8);
    });

    it('respects operator precedence (mul before add)', () => {
      expect(evaluateExpression('2+3*4', {})).toBe(14);
    });

    it('respects operator precedence (div before sub)', () => {
      expect(evaluateExpression('10-6/3', {})).toBe(8);
    });

    it('handles parentheses overriding precedence', () => {
      expect(evaluateExpression('(2+3)*4', {})).toBe(20);
    });

    it('handles nested parentheses', () => {
      expect(evaluateExpression('((2+3)*(4-1))', {})).toBe(15);
    });

    it('handles unary minus', () => {
      expect(evaluateExpression('-5', {})).toBe(-5);
    });

    it('handles unary minus in expression', () => {
      expect(evaluateExpression('3*-2', {})).toBe(-6);
    });

    it('handles floating point numbers', () => {
      expect(evaluateExpression('1.5+2.5', {})).toBe(4);
    });

    it('handles scientific notation', () => {
      expect(evaluateExpression('1e-6*1e3', {})).toBeCloseTo(1e-3);
    });

    it('handles whitespace', () => {
      expect(evaluateExpression(' 2 + 3 ', {})).toBe(5);
    });
  });

  describe('variables', () => {
    it('resolves a variable', () => {
      expect(evaluateExpression('W', { W: 1e-6 })).toBe(1e-6);
    });

    it('resolves variable in expression', () => {
      expect(evaluateExpression('W*2', { W: 1e-6 })).toBeCloseTo(2e-6);
    });

    it('resolves multiple variables', () => {
      expect(evaluateExpression('W/L', { W: 10e-6, L: 1e-6 })).toBeCloseTo(10);
    });

    it('is case-insensitive for variable lookup', () => {
      expect(evaluateExpression('vdd', { VDD: 1.8 })).toBe(1.8);
    });

    it('throws on undefined variable', () => {
      expect(() => evaluateExpression('X', {})).toThrow("Undefined variable 'X'");
    });
  });

  describe('functions', () => {
    it('evaluates sqrt', () => {
      expect(evaluateExpression('sqrt(4)', {})).toBe(2);
    });

    it('evaluates abs', () => {
      expect(evaluateExpression('abs(-3)', {})).toBe(3);
    });

    it('evaluates log (base 10)', () => {
      expect(evaluateExpression('log(100)', {})).toBeCloseTo(2);
    });

    it('evaluates ln (natural log)', () => {
      expect(evaluateExpression('ln(1)', {})).toBe(0);
    });

    it('evaluates exp', () => {
      expect(evaluateExpression('exp(0)', {})).toBe(1);
    });

    it('evaluates min with two args', () => {
      expect(evaluateExpression('min(3,7)', {})).toBe(3);
    });

    it('evaluates max with two args', () => {
      expect(evaluateExpression('max(3,7)', {})).toBe(7);
    });

    it('evaluates pow', () => {
      expect(evaluateExpression('pow(2,10)', {})).toBe(1024);
    });

    it('evaluates nested function calls', () => {
      expect(evaluateExpression('sqrt(abs(-9))', {})).toBe(3);
    });

    it('evaluates function with expression argument', () => {
      expect(evaluateExpression('sqrt(W*L)', { W: 4, L: 9 })).toBe(6);
    });

    it('throws on unknown function', () => {
      expect(() => evaluateExpression('foo(1)', {})).toThrow("Unknown function 'foo'");
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(() => evaluateExpression('', {})).toThrow();
    });

    it('handles complex nested expression', () => {
      expect(evaluateExpression('2*(W+L)/sqrt(4)', { W: 3, L: 5 })).toBe(8);
    });
  });
});
