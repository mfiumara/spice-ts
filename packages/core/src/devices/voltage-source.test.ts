import { describe, it, expect } from 'vitest';
import { VoltageSource, pulseBreakpoints } from './voltage-source.js';
import type { PulseSource } from '../types.js';

describe('pulseBreakpoints', () => {
  it('emits three corners when delay is zero (rising-edge start at t=0 is filtered)', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 0,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    // t=0 (rising-edge start) is filtered; fall-edge end (5e-6) has a sub-ULP
    // FP rounding from 100e-9 + 4.8e-6 + 100e-9 — use the exact JS result.
    expect(pulseBreakpoints(p, 9e-6)).toEqual([
      100e-9,
      0 + 100e-9 + 4.8e-6,          // 4.9e-6 (exact)
      0 + 100e-9 + 4.8e-6 + 100e-9, // ≈5.0e-6 (IEEE 754 result)
    ]);
  });

  it('emits breakpoints across multiple periods up to stopTime', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 0,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    // period 1 corners: 100n, 4.9u, ~5.0u  (t=0 filtered)
    // period 2 corners: 10u, ~10.1u, ~14.9u  (fall-end ~15.0u > stopTime — skipped)
    expect(pulseBreakpoints(p, 15e-6)).toEqual([
      100e-9,
      0 + 100e-9 + 4.8e-6,
      0 + 100e-9 + 4.8e-6 + 100e-9,
      10e-6,
      10e-6 + 100e-9,
      10e-6 + 100e-9 + 4.8e-6,
    ]);
  });

  it('respects non-zero delay (all four corners emit in the first period)', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 1e-6,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    expect(pulseBreakpoints(p, 8e-6)).toEqual([
      1e-6,
      1e-6 + 100e-9,
      1e-6 + 100e-9 + 4.8e-6,
      1e-6 + 100e-9 + 4.8e-6 + 100e-9,
    ]);
  });

  it('returns empty when stopTime is before first edge', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 5e-6,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    expect(pulseBreakpoints(p, 1e-6)).toEqual([]);
  });

  it('returns empty for invalid period (defensive)', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 0,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 0,
    };
    expect(pulseBreakpoints(p, 1e-3)).toEqual([]);
  });
});

describe('VoltageSource.getBreakpoints', () => {
  it('returns pulse breakpoints when the waveform is a pulse', () => {
    const src = new VoltageSource('V1', [0, -1], 0, {
      type: 'pulse', v1: 0, v2: 5, delay: 0,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    });
    const bps = src.getBreakpoints!(1e-5);
    expect(bps.length).toBeGreaterThan(0);
    expect(bps[0]).toBe(100e-9);
  });

  it('returns empty for DC sources', () => {
    const src = new VoltageSource('V1', [0, -1], 0, { type: 'dc', value: 5 });
    expect(src.getBreakpoints!(1e-3)).toEqual([]);
  });

  it('returns empty for SIN sources', () => {
    const src = new VoltageSource('V1', [0, -1], 0, {
      type: 'sin', offset: 0, amplitude: 1, frequency: 1e3,
    });
    expect(src.getBreakpoints!(1e-3)).toEqual([]);
  });
});
