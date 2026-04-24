import { describe, it, expect } from 'vitest';
import { VoltageSource, pulseBreakpoints } from './voltage-source.js';
import type { PulseSource } from '../types.js';

function expectBreakpoints(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 15);
  }
}

describe('pulseBreakpoints', () => {
  it('emits the four corners of the first period', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 0,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    expectBreakpoints(pulseBreakpoints(p, 9e-6), [100e-9, 4.9e-6, 5.0e-6]);
  });

  it('emits breakpoints across multiple periods up to stopTime', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 0,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    // period 1 corners: 100n, 4.9u, 5.0u  (delay=0 skipped since t <= 0)
    // period 2 corners: 10u, 10.1u, 14.9u  (15.0u > stopTime — skipped)
    expectBreakpoints(
      pulseBreakpoints(p, 15e-6),
      [100e-9, 4.9e-6, 5.0e-6, 10e-6, 10.1e-6, 14.9e-6],
    );
  });

  it('respects non-zero delay (emits the rising-edge start)', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 1e-6,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    expectBreakpoints(pulseBreakpoints(p, 8e-6), [1e-6, 1.1e-6, 5.9e-6, 6.0e-6]);
  });

  it('returns empty when stopTime is before first edge', () => {
    const p: PulseSource = {
      type: 'pulse', v1: 0, v2: 5, delay: 5e-6,
      rise: 100e-9, fall: 100e-9, width: 4.8e-6, period: 10e-6,
    };
    expect(pulseBreakpoints(p, 1e-6)).toEqual([]);
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
    expect(bps[0]).toBeCloseTo(100e-9, 15);
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
