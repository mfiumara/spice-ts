import { describe, it, expect } from 'vitest';
import { VoltageSource } from './voltage-source.js';
import { CurrentSource } from './current-source.js';
import { simulate, simulateStream } from '../index.js';
import type { PulseSource } from '../types.js';

// Issue #375: ngspice substitutes the transient TSTEP for a zero PULSE TR/TF
// and holds V1 at and before the delay, so the t=0 value is always V1.
const zeroEdgePulse = (): PulseSource => ({
  type: 'pulse', v1: 0, v2: 10, delay: 0, rise: 0, fall: 0, width: 10, period: 10,
});

describe('PULSE waveform with zero rise/fall (ngspice semantics)', () => {
  it('evaluates to V1 at t=0 for a voltage source', () => {
    const source = new VoltageSource('V1', [0, -1], 0, zeroEdgePulse());
    expect(source.getVoltageAtTime(0)).toBe(0);
  });

  it('evaluates to V1 at t=0 for a current source', () => {
    const source = new CurrentSource('I1', [0, -1], zeroEdgePulse());
    expect(source.getCurrentAtTime(0)).toBe(0);
  });

  it('ramps a zero rise/fall over the transient TSTEP for a voltage source', () => {
    const source = new VoltageSource('V1', [0, -1], 0, { ...zeroEdgePulse(), period: 20 });
    source.setTransientTimestep(0.01);
    expect(source.getVoltageAtTime(0.005)).toBeCloseTo(5, 12);
    expect(source.getVoltageAtTime(0.01)).toBe(10);
    // Falling edge starts at TR + PW = 10.01 and lasts TF = TSTEP.
    expect(source.getVoltageAtTime(10.015)).toBeCloseTo(5, 9);
    expect(source.getBreakpoints(10.05)).toEqual([0.01, 0.01 + 10, 0.01 + 10 + 0.01]);
  });

  it('ramps a zero rise/fall over the transient TSTEP for a current source', () => {
    const source = new CurrentSource('I1', [0, -1], zeroEdgePulse());
    source.setTransientTimestep(0.01);
    expect(source.getCurrentAtTime(0.0025)).toBeCloseTo(2.5, 12);
    expect(source.getBreakpoints(1)).toEqual([0.01]);
  });

  it('keeps an explicit non-zero rise/fall regardless of TSTEP', () => {
    const source = new VoltageSource('V1', [0, -1], 0, {
      ...zeroEdgePulse(), rise: 1e-3, fall: 2e-3,
    });
    source.setTransientTimestep(0.01);
    expect(source.getVoltageAtTime(0.5e-3)).toBeCloseTo(5, 12);
    expect(source.getVoltageAtTime(1e-3)).toBe(10);
  });

  it('repeats periods measured from the delay when the delay exceeds the period', () => {
    const pulse: PulseSource = {
      type: 'pulse', v1: 0, v2: 1, delay: 5, rise: 0.1, fall: 0.1, width: 1, period: 3,
    };
    const voltage = new VoltageSource('V1', [0, -1], 0, pulse);
    const current = new CurrentSource('I1', [0, -1], pulse);
    for (const time of [5.5, 8.5, 11.5]) {
      expect(voltage.getVoltageAtTime(time)).toBe(1);
      expect(current.getCurrentAtTime(time)).toBe(1);
    }
    expect(voltage.getVoltageAtTime(4.9)).toBe(0);
    expect(voltage.getVoltageAtTime(7)).toBe(0);
  });
});

const zeroEdgeNetlist = `
v1 1 0 10 pulse(0 10 0 0 0 10 10)
r1 1 2 3
c1 2 0 .5
.tran 0.01 0.05
.end
`;

function expectTstepRamp(points: Array<{ time: number; v1: number }>): void {
  expect(points[0].time).toBe(0);
  expect(points[0].v1).toBe(0);
  const insideRamp = points.filter(point => point.time > 0 && point.time < 0.01);
  expect(insideRamp.length).toBeGreaterThan(0);
  for (const point of insideRamp) expect(point.v1).toBeCloseTo(10 * point.time / 0.01, 9);
  expect(points.some(point => Math.abs(point.time - 0.01) < 1e-15)).toBe(true);
  for (const point of points.filter(candidate => candidate.time >= 0.01)) {
    expect(point.v1).toBeCloseTo(10, 9);
  }
}

describe('PULSE zero rise/fall in transient analysis (issue #375)', () => {
  it('starts from V1 and ramps over TSTEP in the batch path', async () => {
    const result = await simulate(zeroEdgeNetlist);
    const transient = result.transient!;
    const v1 = transient.voltage('1');
    expectTstepRamp(transient.time.map((time, index) => ({ time, v1: v1[index] })));
  });

  it('starts from V1 and ramps over TSTEP in the stream path', async () => {
    const points: Array<{ time: number; v1: number }> = [];
    for await (const step of simulateStream(zeroEdgeNetlist)) {
      if ('time' in step) points.push({ time: step.time, v1: step.voltages.get('1')! });
    }
    expectTstepRamp(points);
  });
});
