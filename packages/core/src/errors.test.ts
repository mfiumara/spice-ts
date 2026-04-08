// packages/core/src/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  SpiceError,
  ParseError,
  InvalidCircuitError,
  SingularMatrixError,
  ConvergenceError,
  TimestepTooSmallError,
} from './errors.js';

describe('SpiceError hierarchy', () => {
  it('ParseError includes line and context', () => {
    const err = new ParseError('unknown device', 5, 'X1 1 2 mystery');
    expect(err).toBeInstanceOf(SpiceError);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.line).toBe(5);
    expect(err.context).toBe('X1 1 2 mystery');
    expect(err.message).toContain('line 5');
    expect(err.message).toContain('unknown device');
  });

  it('ConvergenceError includes time and oscillating nodes', () => {
    const last = new Float64Array([1, 2]);
    const prev = new Float64Array([1.5, 2.5]);
    const err = new ConvergenceError('max iterations', 1e-6, ['3', '4'], last, prev);
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.time).toBe(1e-6);
    expect(err.oscillatingNodes).toEqual(['3', '4']);
    expect(err.lastSolution).toBe(last);
    expect(err.message).toContain('t=');
  });

  it('SingularMatrixError includes involved nodes', () => {
    const err = new SingularMatrixError('floating node', ['5']);
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.involvedNodes).toEqual(['5']);
    expect(err.message).toContain('floating node');
  });

  it('TimestepTooSmallError includes time and dt', () => {
    const err = new TimestepTooSmallError(1e-3, 1e-18);
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.time).toBe(1e-3);
    expect(err.timestep).toBe(1e-18);
  });

  it('InvalidCircuitError is a SpiceError', () => {
    const err = new InvalidCircuitError('no ground node');
    expect(err).toBeInstanceOf(SpiceError);
    expect(err.message).toBe('no ground node');
  });
});
