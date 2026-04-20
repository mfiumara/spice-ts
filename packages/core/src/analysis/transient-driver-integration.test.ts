import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { createTransientSim } from './transient-driver.js';

const BUCK = `
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 sw gate in 0 NMOD W=1m L=1u
D1 0 sw DMOD
L1 sw out 100u
C1 out 0 100u
Rload out 0 10
.tran 50n __STOP__
`;

const BOOST = `
Vin in 0 DC 5
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
L1 in sw 100u
M1 sw gate 0 0 NMOD W=1m L=1u
D1 sw out DMOD
C1 out 0 100u
Rload out 0 10
.tran 50n __STOP__
`;

const BUCK_BOOST = `
Vin in 0 DC 12
Vg gate 0 PULSE(0 15 0 100n 100n 4.8u 10u)
.model NMOD NMOS(VTO=2 KP=10)
.model DMOD D(IS=1e-14 N=1)
M1 in gate sw 0 NMOD W=1m L=1u
L1 sw n1 100u
D1 n1 0 DMOD
C1 n1 neg 100u
Rload neg 0 10
.tran 50n __STOP__
`;

function withStop(nl: string, stop: string): string {
  return nl.replace('__STOP__', stop);
}

describe('hard-switching converter integration', () => {
  it('buck runs to 10 ms without throwing', async () => {
    const result = await simulate(withStop(BUCK, '10m'));
    expect(result.transient).toBeDefined();
    const vout = result.transient!.voltage('out');
    expect(vout[vout.length - 1]).toBeGreaterThan(4); // ~6 V steady state
    expect(vout[vout.length - 1]).toBeLessThan(8);
  }, 120_000);

  it('boost runs to 10 ms without throwing', async () => {
    const result = await simulate(withStop(BOOST, '10m'));
    expect(result.transient).toBeDefined();
    const vout = result.transient!.voltage('out');
    expect(vout[vout.length - 1]).toBeGreaterThan(7);
  }, 120_000);

  it('buck-boost runs to 500 µs without throwing — HEADLINE (was failing at 562 ns pre-fix)', async () => {
    // Pre-fix: TimestepTooSmallError at t=562 ns on the first MOSFET switching edge.
    // Post-fix: the expanded GMIN schedule recovers convergence across the first
    // ~50 switching cycles (500 µs at 10 µs period). Extending beyond ~800 µs
    // needs nested GMIN stepping — tracked as follow-up to subproject 1.
    const result = await simulate(withStop(BUCK_BOOST, '500u'));
    expect(result.transient).toBeDefined();
    const vneg = result.transient!.voltage('neg');
    // Sanity check: the inverting buck-boost starts settling toward a negative rail
    expect(vneg[vneg.length - 1]).toBeLessThan(0);
  }, 60_000);

  it('buck-boost via createTransientSim advances past the first switching edge', async () => {
    const sim = await createTransientSim(withStop(BUCK_BOOST, '10m'));
    // Check specifically that simTime crosses past t=562 ns (the previous failure point)
    sim.advanceUntil(1e-6);
    expect(sim.simTime).toBeGreaterThan(1e-6);
    sim.dispose();
  });
});
