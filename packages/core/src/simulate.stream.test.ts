import { describe, it, expect } from 'vitest';
import { simulateStream, parse } from './index.js';

describe('simulateStream', () => {
  it('streams transient results as TransientStep objects', async () => {
    const ckt = parse(`
      V1 1 0 DC 5
      R1 1 2 1k
      C1 2 0 1u
      .tran 10u 1m
      .end
    `);

    const steps: { time: number; v2: number }[] = [];
    for await (const step of simulateStream(ckt)) {
      if ('time' in step) {
        steps.push({ time: step.time, v2: step.voltages.get('2')! });
      }
    }

    expect(steps.length).toBeGreaterThan(10);
    // DC operating point: capacitor is open, so V(2) = 5V at t=0
    expect(steps[0].v2).toBeCloseTo(5, 0);
    // Should remain near 5V throughout (steady state)
    expect(steps[steps.length - 1].v2).toBeCloseTo(5, 0);
    // First step is t=0
    expect(steps[0].time).toBe(0);

    // Times should be monotonically increasing
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].time).toBeGreaterThan(steps[i - 1].time);
    }
  });

  it('streams AC results as ACPoint objects', async () => {
    const ckt = parse(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1u
      .ac dec 5 1 10k
      .end
    `);

    const points: { freq: number; mag: number }[] = [];
    for await (const point of simulateStream(ckt)) {
      if ('frequency' in point) {
        points.push({ freq: point.frequency, mag: point.voltages.get('2')!.magnitude });
      }
    }

    expect(points.length).toBeGreaterThan(5);
    expect(points[0].mag).toBeCloseTo(1, 0);
    expect(points[points.length - 1].mag).toBeLessThan(0.5);
  });
});
