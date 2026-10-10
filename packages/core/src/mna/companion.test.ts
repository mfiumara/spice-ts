import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('trapezoidal bootstrap', () => {
  it('produces a sensible RC bootstrap step (BE-equivalent on step 1)', async () => {
    // Trivial RC: with BE on step 1, x(1) = x(0) + dt * (u - x(0)) / (RC + dt).
    // After many subsequent trap steps, vout settles toward 1 V regardless of
    // the bootstrap's exact value. This test passes both before and after the
    // fix; its purpose is to lock in regression coverage so the fix can't
    // silently break linear bootstrap accuracy.
    // The zero TR/TF use TSTEP = 1 ms (ngspice semantics, issue #375), so the
    // input is a 1 ms ramp: analytic vout(5 ms) = 1 - (1 - e^-1) e^-4 = 0.98842;
    // ngspice-47 prints 0.9884542 for this netlist.
    const netlist = `
V1 in 0 PULSE(0 1 0 0 0 1 2)
R1 in out 1k
C1 out 0 1u
.tran 1m 5m`;
    const result = await simulate(netlist, { integrationMethod: 'trapezoidal' });
    const vout = result.transient!.voltage('out');
    expect(vout[vout.length - 1]).toBeCloseTo(0.98845, 3);
  });
});
