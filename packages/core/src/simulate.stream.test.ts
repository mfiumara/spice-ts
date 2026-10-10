import { describe, it, expect } from 'vitest';
import { simulate, simulateStream, parse } from './index.js';

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

  it('uses the batch AC excitation assembly for mixed-source streams', async () => {
    const netlist = `
      V1 source 0 AC 1 15
      R1 source out 2
      I1 out 0 AC 0.25 -30
      I2 0 out AC 0.1 90
      R2 out 0 3
      .ac dec 3 1 1k
      .end
    `;
    const batch = (await simulate(netlist)).ac!;
    const streamed = [];
    for await (const point of simulateStream(netlist)) {
      if ('frequency' in point) streamed.push(point);
    }

    expect(streamed.map(point => point.frequency)).toEqual(batch.frequencies);
    expect(streamed.map(point => point.voltages.get('out'))).toEqual(batch.voltage('out'));
  });

  it('rejects unsupported two-tone distortion streams with a structured error', async () => {
    const collect = async () => {
      const points = [];
      for await (const point of simulateStream(`two-tone distortion stream
        V1 1 0 DC 0 AC 1 SIN 0 1 1K 0 0 DISTOF1 1 DISTOF2 0.25 30
        R1 1 2 10k
        R2 2 0 10k
        C1 2 0 1n
        .disto dec 10 1k 1Meg 0.9
        .end
      `)) points.push(point);
      return points;
    };

    await expect(collect()).rejects.toMatchObject({
      name: 'UnsupportedStreamAnalysisError',
      code: 'UNSUPPORTED_FEATURE',
      details: { api: 'simulateStream', analysis: 'disto' },
    });
  });
});
