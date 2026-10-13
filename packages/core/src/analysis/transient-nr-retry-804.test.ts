import { describe, expect, it } from 'vitest';
import type { CompiledCircuit } from '../circuit.js';
import type { ChargeIntegration, DeviceModel } from '../devices/device.js';
import { DEFAULT_OPTIONS } from '../types.js';
import { createTransientSim } from './transient-driver.js';

// Issue #804: after #799, corpus-h mosamp2.cir (MOS2) still left ngspice-47's
// timestep sequence. Most of its ~830 rejected steps are Newton failures, and
// two ngspice-47 rules for them differed in spice-ts:
//
//  - niiter.c NIiter raises any iteration limit below 100 to 100 ("some
//    convergence issues that get resolved by increasing max iter"), so with
//    the default ITL4 = 10 a transient timepoint fails after 100 iterations,
//    not after spice-ts's 50.
//  - dctran.c retries a non-converged timepoint at CKTorder = 1 (Backward
//    Euler), cutting CKTdelta by 8; spice-ts kept trapezoidal history.

const DECK = `diode rc
V1 in 0 PULSE(0 1 1u 100n 100n 2u 5u)
R1 in out 1k
D1 out 0 DMOD
.model DMOD D(CJO=1n)
.tran 100n 10u
`;

interface Stamp { attempt: number; integration: ChargeIntegration }

/**
 * Run DECK and force one Newton failure: the first trapezoidal attempt after
 * the third one never passes D1's convergence test.
 */
async function runWithForcedFailure(): Promise<{ stamps: Stamp[]; failed: number }> {
  const sim = await createTransientSim(DECK);
  const { compiled } = sim as unknown as { compiled: CompiledCircuit };
  const diode = compiled.devices.find(device => device.name.toUpperCase() === 'D1') as DeviceModel;
  const stamps: Stamp[] = [];
  let attempt = 0;
  let failed = -1;
  const begin = diode.beginTransientNewton!.bind(diode);
  const stampCharge = diode.stampTransientCharge!.bind(diode);
  Object.assign(diode, {
    beginTransientNewton: (dt: number, accepted: Float64Array) => { attempt++; begin(dt, accepted); },
    stampTransientCharge: (ctx: Parameters<typeof stampCharge>[0], integration: ChargeIntegration) => {
      if (failed < 0 && attempt > 3 && integration.method === 'trapezoidal') failed = attempt;
      stamps.push({ attempt, integration: { ...integration } });
      stampCharge(ctx, integration);
    },
    convergenceTest: () => attempt !== failed,
  });
  while (failed < 0 || attempt <= failed + 1) sim.advance();
  sim.dispose();
  return { stamps, failed };
}

describe('ngspice-47 Newton failure handling in transient (#804)', () => {
  it('defaults the transient iteration limit to the NIiter floor of 100', () => {
    expect(DEFAULT_OPTIONS.maxTransientIterations).toBe(100);
  });

  it('gives up a timepoint after 100 Newton iterations by default', async () => {
    const { stamps, failed } = await runWithForcedFailure();
    expect(failed).toBeGreaterThan(0);
    expect(stamps.filter(stamp => stamp.attempt === failed)).toHaveLength(100);
  });

  it('retries a non-converged timepoint at order 1 with the step cut by 8', async () => {
    const { stamps, failed } = await runWithForcedFailure();
    const failedStamp = stamps.find(stamp => stamp.attempt === failed)!;
    const retry = stamps.find(stamp => stamp.attempt === failed + 1)!;
    expect(failedStamp.integration.method).toBe('trapezoidal');
    expect(retry.integration.method).toBe('euler');
    expect(retry.integration.dt).toBeCloseTo(failedStamp.integration.dt / 8, 20);
  });
});
