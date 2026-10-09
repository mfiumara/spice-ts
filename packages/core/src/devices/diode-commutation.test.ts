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

const RS_TT_TRANSIENT = `
V1 in 0 SIN(0.6 0.2 100k)
R1 in out 100
D1 out 0 DTT
.model DTT D(IS=1e-14 N=1 RS=10 TT=100n)
.tran 20n 5u
.end
`;

function interpolate(times: number[], values: number[], target: number): number {
  const upper = times.findIndex((time) => time >= target);
  if (upper <= 0) return values[Math.max(upper, 0)]!;
  const lower = upper - 1;
  const fraction = (target - times[lower]!) / (times[upper]! - times[lower]!);
  return values[lower]! + fraction * (values[upper]! - values[lower]!);
}

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

  it('tracks ngspice-47 when series resistance and transit time are combined', async () => {
    const result = await simulate(RS_TT_TRANSIENT);
    const transient = result.transient!;
    const output = transient.voltage('out');

    // ngspice-47: `ngspice -b rs-tt-transient.cir`, sampled from `v(out)`.
    const reference = [
      [1e-6, 0.649355511],
      [2.5e-6, 0.673686404],
      [4e-6, 0.652892241],
      [5e-6, 0.594218470],
    ] as const;

    for (const [time, expectedVoltage] of reference) {
      expect(Math.abs(interpolate(transient.time, output, time) - expectedVoltage)).toBeLessThan(2.5e-3);
    }
  });
});