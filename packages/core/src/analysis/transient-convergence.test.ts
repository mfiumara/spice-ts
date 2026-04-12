import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('Transient convergence (issues #24 and #25)', () => {
  it('#25: half-wave rectifier with SIN source should not throw TimestepTooSmallError', { timeout: 30000 }, async () => {
    // Diode rectifier: SIN source drives a diode into a RC load.
    // The diode turn-on at ~0.57V previously caused TimestepTooSmallError
    // because the adaptive timestep cascaded to near-zero.
    const netlist = `
      V1 in 0 SIN(0 10 500)
      D1 in rect DMOD
      .model DMOD D (IS=1e-14 N=1.05 RS=0.5)
      R1 rect out 100
      C1 out 0 100u
      R2 out 0 1k
      .tran 0.1u 20m
    `;

    // Should complete without throwing
    const result = await simulate(netlist);

    expect(result.transient).toBeDefined();
    const time = result.transient!.time;
    const vout = result.transient!.voltage('out');

    // Basic sanity: simulation ran to completion
    expect(time.length).toBeGreaterThan(10);
    expect(time[time.length - 1]).toBeCloseTo(20e-3, 4);

    // Output voltage should be non-negative (rectified)
    // and bounded by supply amplitude
    for (let i = 0; i < vout.length; i++) {
      expect(vout[i]).toBeGreaterThanOrEqual(-1); // small undershoot ok
      expect(vout[i]).toBeLessThanOrEqual(12);    // bounded by 10V supply + margin
    }
  });

  it('#24: CMOS inverter should not produce voltage spikes beyond supply rails', async () => {
    // CMOS inverter with PULSE input. Previously produced 20V+ voltage spikes
    // on a 5V supply during switching transitions.
    const netlist = `
      .model NMOS NMOS (VTO=0.7 KP=110e-6 LAMBDA=0.04 CBD=5p CBS=5p)
      .model PMOS PMOS (VTO=-0.7 KP=50e-6 LAMBDA=0.05 CBD=5p CBS=5p)
      V1 vdd 0 DC 5
      V2 in 0 PULSE(0 5 0 0.1n 0.1n 50n 100n)
      M1 out in vdd vdd PMOS W=10u L=1u
      M2 out in 0 0 NMOS W=5u L=1u
      C1 out 0 1p
      .tran 0.05n 500n
    `;

    const result = await simulate(netlist);

    expect(result.transient).toBeDefined();
    const vout = result.transient!.voltage('out');

    // Output should stay within supply rails (0V to 5V) with small tolerance
    // for numerical overshoot. 20V+ spikes are definitely wrong.
    const maxV = Math.max(...vout);
    const minV = Math.min(...vout);

    expect(maxV).toBeLessThan(6.5);  // <30% overshoot of VDD
    expect(minV).toBeGreaterThan(-1.5); // <30% undershoot of VSS
  });
});
