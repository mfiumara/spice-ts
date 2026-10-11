import { describe, expect, it } from 'vitest';
import { simulate, simulateStream, simulateStepStream } from './simulate.js';
import { simulateProtocolV1 } from './protocol/adapter.js';
import type { TransientStep } from './types.js';

// Issue #432: `.tran TSTEP TSTOP TSTART` integrates from t = 0 but saves only
// accepted points with t >= TSTART, as ngspice-47 dctran.c does
// (`if (CKTtime >= CKTinitTime) CKTdump(...)`). On this netlist ngspice-47
// emits 184 points, the first at t = 5.01e-4 with v(2) = 0.393774976 and the
// last at t = 2e-3.
const RC = [
  '* rc tstart',
  'V1 1 0 PULSE(0 1 0 1u 1u 0.5m 1m)',
  'R1 1 2 1k',
  'C1 2 0 1u',
].join('\n');
const TSTART = 0.5e-3;
const NGSPICE_FIRST_V2 = 0.393774976;

function expectSavedFromTstart(time: readonly number[]): void {
  expect(time.length).toBeGreaterThan(0);
  expect(Math.min(...time)).toBeGreaterThanOrEqual(TSTART);
  expect(time[0]).toBeLessThan(TSTART + 10e-6);
  expect(time[time.length - 1]).toBeCloseTo(2e-3, 12);
}

describe('.tran TSTART omits output points before TSTART (#432)', () => {
  it('simulate() returns no point with t < TSTART', async () => {
    const result = await simulate(`${RC}\n.tran 10u 2m 0.5m`);
    const tran = result.transient!;

    expectSavedFromTstart(tran.time);
    expect(tran.voltage('2')).toHaveLength(tran.time.length);
    expect(tran.current('V1')).toHaveLength(tran.time.length);
    // The waveform is the same one integrated from t = 0: the first kept
    // point sits on the ngspice curve, not on a restarted DC solution.
    expect(tran.voltage('2')[0]).toBeCloseTo(NGSPICE_FIRST_V2, 2);
  });

  it('keeps the t = 0 point when TSTART is 0', async () => {
    const result = await simulate(`${RC}\n.tran 10u 2m 0`);

    expect(result.transient!.time[0]).toBe(0);
  });

  it('does not change the integration: kept points match the TSTART = 0 run', async () => {
    const full = (await simulate(`${RC}\n.tran 10u 2m`)).transient!;
    const late = (await simulate(`${RC}\n.tran 10u 2m 0.5m 10u`)).transient!;
    const fullFromTstart = full.time.filter(t => t >= TSTART);

    expect(late.time).toEqual(fullFromTstart);
    const offset = full.time.length - fullFromTstart.length;
    expect(late.voltage('2')).toEqual(full.voltage('2').slice(offset));
  });

  it('simulateStream() yields no point with t < TSTART', async () => {
    const time: number[] = [];
    for await (const step of simulateStream(`${RC}\n.tran 10u 2m 0.5m`)) {
      time.push((step as TransientStep).time);
    }

    expectSavedFromTstart(time);
  });

  it('simulateStepStream() without .step yields no point with t < TSTART', async () => {
    const time: number[] = [];
    for await (const event of simulateStepStream(`${RC}\n.tran 10u 2m 0.5m`)) {
      time.push((event.point as TransientStep).time);
    }

    expectSavedFromTstart(time);
  });

  it('simulate() and simulateStepStream() with .step apply TSTART to every step', async () => {
    const source = `${RC}\n.step param R1 list 1k 2k\n.tran 10u 2m 0.5m`;
    const result = await simulate(source);

    expect(result.steps).toHaveLength(2);
    for (const step of result.steps!) expectSavedFromTstart(step.transient!.time);

    const byStep = new Map<number, number[]>();
    for await (const event of simulateStepStream(source)) {
      const times = byStep.get(event.stepIndex) ?? [];
      times.push((event.point as TransientStep).time);
      byStep.set(event.stepIndex, times);
    }
    expect(byStep.size).toBe(2);
    for (const times of byStep.values()) expectSavedFromTstart(times);
  });

  it('simulateProtocolV1 returns no tran point with t < TSTART', async () => {
    const response = await simulateProtocolV1({
      apiVersion: '1', input: { format: 'spice', source: `${RC}\n.tran 10u 2m 0.5m` },
    });
    const tran = response.analyses.find(a => a.type === 'tran');
    if (tran?.type !== 'tran') throw new Error('missing tran');

    expectSavedFromTstart(tran.timeS);
  });
});
