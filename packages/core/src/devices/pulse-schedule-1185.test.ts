import { expect, it } from 'vitest';
import type { PulseSource } from '../types.js';
import type { StampContext } from './device.js';
import { CurrentSource } from './current-source.js';
import { PulseBreakpointSchedule, VoltageSource } from './voltage-source.js';

const pulse: PulseSource = { type: 'pulse', v1: 0, v2: 5, delay: 0.0001,
  rise: 0.0001, fall: 0.0001, width: 0.02, period: 0.04 };

it('preserves ngspice TIME+wait rounding at period wrap', () => {
  const schedule = new PulseBreakpointSchedule();
  expect(schedule.next(pulse, 0, 0.1, 0.01)).toBe(0.0001);
  expect(schedule.next(pulse, 0.00005, 0.1, 0.01)).toBeUndefined();
  expect(schedule.next(pulse, 0.0203, 0.1, 0.01)).toBe(0.0401);
  // TIME-TD is just below PER: request within minBreak of the current
  // time (ignored by the queue), not rise end.
  expect(schedule.next(pulse, 0.0401, 0.1, 0.01)).toBe(0.040100000000000004);
  expect(schedule.next(pulse, 0.0403, 0.1, 0.01)).toBeCloseTo(0.0602, 14);
  schedule.reset();
  expect(schedule.next(pulse, 0, 0.1, 0.01)).toBe(0.0001);
});

it('substitutes TSTOP for absent PER and stops scheduling after NP', () => {
  const schedule = new PulseBreakpointSchedule();
  expect(schedule.next({ ...pulse, period: Infinity }, 0.03, 0.1, 0.01)).toBe(0.10010000000000001);
  schedule.reset();
  expect(schedule.next({ ...pulse, pulses: 1 }, 0.05, 0.1, 0.01)).toBeUndefined();
});

for (const source of [new VoltageSource('v', [0, -1], 0, pulse), new CurrentSource('i', [0, -1], pulse)]) {
  it(`${source.name} schedules on accept, not on load, and resets for a rerun`, () => {
    source.setTransientTimestep(0.01, 0.1);
    expect(source.getBreakpoints(0.1)).toEqual([0.0001]);
    const times: number[] = [];
    const sink = { schedule: (time: number) => { times.push(time); } };
    const accept = (time: number) => source.acceptTransientStep!({ time } as StampContext, sink);
    accept(0);
    accept(0.00005);
    accept(0.0001);
    expect(times).toEqual([0.0001, 0.0002]);
    source.resetTransient();
    accept(0);
    expect(times).toEqual([0.0001, 0.0002, 0.0001]);
  });
}
