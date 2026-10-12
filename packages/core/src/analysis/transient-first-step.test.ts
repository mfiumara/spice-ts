import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { createTransientSim } from './transient-driver.js';

// Issue #532: the first transient step was the full min(TSTEP, TMAX). On a
// slow RC (tau = 2 ms) driven by a 100 kHz SIN, one trapezoidal step across
// 0.4 of a source period leaves an error that decays only with tau, i.e. a DC
// offset for the whole run. ngspice dctran.c starts at
// MIN(TSTOP/100, TSTEP)/10, limits it at the t=0 breakpoint to
// 0.1 x MIN(TSTOP/50, next breakpoint), and cuts that by 10 for the first
// timepoint, integrating at order 1. References are ngspice-47 on the
// identical deck; reproduce with `node benchmarks/tran-first-step-532/measure.mjs`.

const RC_OSC = `rc_osc test
.tran 4e-6 2.0e-4
v1 1 0 sin 0 1V 1e5 0 0
r1 1 2 1k
c1 2 0 2u
.end
`;

/** v(2) of the RC low-pass driven by sin(2*pi*1e5*t) from a zero DC point. */
function analytic(t: number): number {
  const w = 2 * Math.PI * 1e5;
  const wt = w * 1e3 * 2e-6;
  return (Math.sin(w * t) - wt * Math.cos(w * t) + wt * Math.exp(-t / 2e-3)) / (1 + wt * wt);
}

describe('ngspice first transient step (#532)', () => {
  it('takes the ngspice-47 first step on the SIN-driven RC deck', async () => {
    const sim = await createTransientSim(RC_OSC);
    // ngspice-47: MIN(2e-4/100, 4e-6)/10 = 2e-7, then /10 at t=0 -> 2e-8.
    expect(sim.advance().time).toBeCloseTo(2e-8, 20);
    sim.dispose();
  });

  it('tracks the analytic SIN-driven RC response like ngspice-47', async () => {
    const transient = (await simulate(RC_OSC)).transient!;
    const v2 = transient.voltage('2');
    let max = 0;
    let sum = 0;
    for (let index = 0; index < transient.time.length; index++) {
      const error = Math.abs(v2[index]! - analytic(transient.time[index]!));
      max = Math.max(max, error);
      sum += error * error;
    }
    const rms = Math.sqrt(sum / transient.time.length);
    // ngspice-47 vs analytic: max 3.42e-4 V, RMS 1.47e-4 V. Before #532 the
    // offset made spice-ts max 8.51e-4 V, RMS 8.10e-4 V (the whole 8e-4 V signal).
    // With ngspice's CAPtrunc step control (#621) instead of the stricter
    // node-voltage LTE (1006 points, max 2.31e-6 V), spice-ts takes 148
    // points to ngspice's 154 and has ngspice's accuracy: max 3.56e-4 V,
    // RMS 2.07e-4 V. With ngspice's order-1 restart after t=0 (#742, #561)
    // spice-ts takes ngspice's 154 points on the same grid.
    expect(max).toBeLessThan(4e-4);
    expect(rms).toBeLessThan(2.5e-4);
  });

  it('limits the first step to a tenth of a near first breakpoint, then cuts it by 10', async () => {
    // First PULSE corner at 1 ns: 0.1 x 1e-9 / 10 = 1e-11, well below the
    // MIN(TSTOP/100, TSTEP)/10 / 10 = 1e-9 start.
    const sim = await createTransientSim(`pulse first gap
V1 in 0 PULSE(0 1 1n 1n 1n 5u 10u)
R1 in out 1k
C1 out 0 1n
.tran 1u 20u
.end
`);
    expect(sim.advance().time).toBeCloseTo(1e-11, 22);
    sim.dispose();
  });
});
