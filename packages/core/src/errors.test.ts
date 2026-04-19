// packages/core/src/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  SpiceError,
  ParseError,
  InvalidCircuitError,
  SingularMatrixError,
  ConvergenceError,
  TimestepTooSmallError,
  CycleError,
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

describe('CycleError', () => {
  it('formats the dependency chain', () => {
    const err = new CycleError(['a.lib', 'b.lib', 'a.lib']);
    expect(err.name).toBe('CycleError');
    expect(err.message).toBe('Circular dependency detected: a.lib → b.lib → a.lib');
    expect(err.chain).toEqual(['a.lib', 'b.lib', 'a.lib']);
    expect(err).toBeInstanceOf(SpiceError);
  });
});

describe('ConvergenceError (extended)', () => {
  it('carries a kind discriminator', () => {
    const err = new ConvergenceError(
      'NR failed', 1e-9, ['n1'], new Float64Array([1]), new Float64Array([0]),
      'nr-divergence', 1e-12, 1e-8,
    );
    expect(err.kind).toBe('nr-divergence');
    expect(err.dt).toBe(1e-12);
    expect(err.gmin).toBe(1e-8);
  });

  it('defaults kind to nr-divergence when omitted', () => {
    const err = new ConvergenceError(
      'm', 0, [], new Float64Array(0), new Float64Array(0),
    );
    expect(err.kind).toBe('nr-divergence');
  });
});

describe('TimestepTooSmallError (now extends ConvergenceError)', () => {
  it('is instanceof ConvergenceError', () => {
    const err = new TimestepTooSmallError(1e-9, 1e-18);
    expect(err).toBeInstanceOf(ConvergenceError);
    expect(err).toBeInstanceOf(TimestepTooSmallError);
  });

  it('has kind=dt-floor and preserves timestep getter', () => {
    const err = new TimestepTooSmallError(1e-9, 1e-18);
    expect(err.kind).toBe('dt-floor');
    expect(err.timestep).toBe(1e-18);
    expect(err.time).toBe(1e-9);
    expect(err.dt).toBe(1e-18);
  });
});
