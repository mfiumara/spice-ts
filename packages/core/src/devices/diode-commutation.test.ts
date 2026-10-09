import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

const DIODE_COMMUTATION = `
VPULSE in 0 PULSE(-10 10 1u 1n 1n 2u 5u)
RS in rect 0.1
D1 rect out DHARD
C1 out 0 10u
RLOAD out 0 10
.model DHARD D(IS=1e-14 N=1 RS=0.01)
.tran 100n 15u
.end
`;

describe('diode commutation', () => {
  it('tracks the ngspice-47 RC envelope after repeated commutation', async () => {
    const result = await simulate(DIODE_COMMUTATION, {
      reltol: 1e-3,
      abstol: 1e-12,
      vntol: 1e-6,
      gmin: 0,
      maxIterations: 100,
      maxTransientIterations: 50,
      integrationMethod: 'trapezoidal',
      trtol: 7,
    });

    const output = result.transient!.voltage('out');
    const ngspiceFinal = 8.77829;
    const relativeError = Math.abs(output.at(-1)! - ngspiceFinal) / ngspiceFinal;

    expect(relativeError).toBeLessThan(0.01);
  });
});