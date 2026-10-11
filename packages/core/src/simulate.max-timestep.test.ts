import { describe, expect, it } from 'vitest';
import { simulate, simulateStream, simulateStepStream } from './simulate.js';
import { mapProtocolErrorV1, simulateProtocolV1 } from './protocol/adapter.js';
import { createTransientSim } from './analysis/transient-driver.js';
import { InvalidCircuitError } from './errors.js';
import type { TransientStep } from './types.js';

// Issue #415: SimulationOptions.maxTimestep must cap transient steps in
// simulate()/streaming/protocol runs. `.tran` TMAX is the per-analysis cap
// and wins (as in ngspice); the option replaces the min(TSTEP, TSTOP/50)
// default when `.tran` has no TMAX.
const RC_PULSE = '* rc pulse\nV1 a 0 PULSE(0 1 0 1n 1n 5u 10u)\nR1 a b 1k\nC1 b 0 1n';
const TOLERANCE = 1 + 1e-9;

function largestStep(time: readonly number[]): number {
  let largest = 0;
  for (let i = 1; i < time.length; i++) largest = Math.max(largest, time[i]! - time[i - 1]!);
  return largest;
}

describe('SimulationOptions.maxTimestep caps transient steps (#415)', () => {
  it('simulate() honours the option when .tran has no TMAX', async () => {
    const result = await simulate(`${RC_PULSE}\n.tran 1u 20u`, { maxTimestep: 1e-7 });

    expect(largestStep(result.transient!.time)).toBeLessThanOrEqual(1e-7 * TOLERANCE);
  });

  it('simulate() lets the option loosen the min(TSTEP, TSTOP/50) default', async () => {
    const source = '* rc step\nV1 a 0 1\nR1 a b 1k\nC1 b 0 1n\n.tran 0.1u 100u';
    const defaulted = await simulate(source);
    const loosened = await simulate(source, { maxTimestep: 1e-6 });

    expect(largestStep(defaulted.transient!.time)).toBeLessThanOrEqual(0.1e-6 * TOLERANCE);
    expect(largestStep(loosened.transient!.time)).toBeGreaterThan(0.1e-6 * TOLERANCE);
    expect(largestStep(loosened.transient!.time)).toBeLessThanOrEqual(1e-6 * TOLERANCE);
  });

  it('.tran TMAX takes precedence over the option', async () => {
    const result = await simulate(`${RC_PULSE}\n.tran 1u 20u 0 0.1u`, { maxTimestep: 1e-6 });

    expect(largestStep(result.transient!.time)).toBeLessThanOrEqual(0.1e-6 * TOLERANCE);
  });

  it('runs a zero-TSTEP .tran at the option cap', async () => {
    const result = await simulate(`${RC_PULSE}\n.tran 0 20u`, { maxTimestep: 1e-7 });

    expect(largestStep(result.transient!.time)).toBeLessThanOrEqual(1e-7 * TOLERANCE);
  });

  it('simulateStream() honours the option', async () => {
    const time: number[] = [];
    for await (const step of simulateStream(`${RC_PULSE}\n.tran 1u 20u`, { maxTimestep: 1e-7 })) {
      time.push((step as TransientStep).time);
    }

    expect(largestStep(time)).toBeLessThanOrEqual(1e-7 * TOLERANCE);
  });

  it('simulateStepStream() without .step honours the option', async () => {
    const time: number[] = [];
    for await (const event of simulateStepStream(`${RC_PULSE}\n.tran 1u 20u`, { maxTimestep: 1e-7 })) {
      time.push((event.point as TransientStep).time);
    }

    expect(largestStep(time)).toBeLessThanOrEqual(1e-7 * TOLERANCE);
  });

  it('simulate() with .step honours the option for every step', async () => {
    const source = `${RC_PULSE}\n.step param R1 list 1k 2k\n.tran 1u 20u`;
    const result = await simulate(source, { maxTimestep: 1e-7 });

    expect(result.steps).toHaveLength(2);
    for (const step of result.steps!) {
      expect(largestStep(step.transient!.time)).toBeLessThanOrEqual(1e-7 * TOLERANCE);
    }
  });

  it('simulateProtocolV1 honours options.maxTimestep', async () => {
    const source = `${RC_PULSE}\n.tran 1u 20u`;
    const baseline = await simulateProtocolV1({ apiVersion: '1', input: { format: 'spice', source } });
    const capped = await simulateProtocolV1({
      apiVersion: '1', input: { format: 'spice', source }, options: { maxTimestep: 1e-8 },
    });

    const timeOf = (r: typeof baseline) => {
      const tran = r.analyses.find(a => a.type === 'tran');
      if (tran?.type !== 'tran') throw new Error('missing tran');
      return tran.timeS;
    };
    expect(largestStep(timeOf(baseline))).toBeCloseTo(0.4e-6, 15);
    expect(largestStep(timeOf(capped))).toBeLessThanOrEqual(1e-8 * TOLERANCE);
  });
});

describe('SimulationOptions.maxTimestep validation (#415)', () => {
  const source = `${RC_PULSE}\n.tran 1u 20u`;
  const INVALID = [-1e-7, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it('treats maxTimestep 0 as unset, as ngspice does', async () => {
    const baseline = await simulate(source);
    const zero = await simulate(source, { maxTimestep: 0 });

    expect(zero.transient!.time).toEqual(baseline.transient!.time);
  });

  it.each(INVALID)('simulate() rejects maxTimestep %s with InvalidCircuitError', async (value: number) => {
    await expect(simulate(source, { maxTimestep: value })).rejects.toThrow(InvalidCircuitError);
    await expect(simulate(source, { maxTimestep: value })).rejects.toThrow(/maxTimestep/);
  });

  it('simulate() with .step rejects a negative maxTimestep with InvalidCircuitError', async () => {
    const stepped = `${RC_PULSE}\n.step param R1 list 1k 2k\n.tran 1u 20u`;
    await expect(simulate(stepped, { maxTimestep: -1 })).rejects.toThrow(InvalidCircuitError);
  });

  it('simulateStream() rejects a negative maxTimestep with InvalidCircuitError', async () => {
    const drain = async () => {
      for await (const _ of simulateStream(source, { maxTimestep: -1 })) { /* drain */ }
    };
    await expect(drain()).rejects.toThrow(InvalidCircuitError);
  });

  it('createTransientSim() treats 0 as unset and rejects negative maxTimestep', async () => {
    const baseline = (await createTransientSim(source)).advanceUntil(20e-6).map(step => step.time);
    const zero = (await createTransientSim(source, { maxTimestep: 0 })).advanceUntil(20e-6).map(step => step.time);

    expect(zero).toEqual(baseline);
    await expect(createTransientSim(source, { maxTimestep: -1 })).rejects.toThrow(InvalidCircuitError);
  });

  it('simulateProtocolV1 treats maxTimestep 0 as unset', async () => {
    const input = { format: 'spice' as const, source };
    const baseline = await simulateProtocolV1({ apiVersion: '1', input });
    const zero = await simulateProtocolV1({ apiVersion: '1', input, options: { maxTimestep: 0 } });

    expect(zero.analyses).toEqual(baseline.analyses);
  });

  it.each(INVALID)('simulateProtocolV1 maps maxTimestep %s to INVALID_REQUEST', async (value: number) => {
    const request = { apiVersion: '1' as const, input: { format: 'spice' as const, source }, options: { maxTimestep: value } };
    const error = await simulateProtocolV1(request).then(() => undefined, (cause: unknown) => cause);

    expect(mapProtocolErrorV1(error)).toMatchObject({
      code: 'INVALID_REQUEST', phase: 'validation', details: { option: 'maxTimestep' },
    });
  });
});
