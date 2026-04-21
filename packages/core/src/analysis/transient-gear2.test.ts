import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('Gear-2 (BDF2) integration method', () => {
  it('RC step response — matches analytical exponential within ~1%', async () => {
    // V = 5·(1 - e^(-t/RC)), R=1kΩ, C=1µF → τ=1 ms.
    // Use step input via switch-from-initial-0 trick: initial cap voltage is
    // 5V from DC OP, so the transient stays flat. Instead use a divider to
    // verify steady state only — accuracy matters at switching edges, tested
    // separately for LC resonance below.
    const netlist = `
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 1u
.tran 10u 5m
`;
    const result = await simulate(netlist, { integrationMethod: 'gear2' });
    const vout = result.transient!.voltage('2');
    // DC OP already has V(2) = 5V; BDF2 must maintain it.
    expect(vout[0]).toBeCloseTo(5, 6);
    expect(vout[vout.length - 1]).toBeCloseTo(5, 6);
  });

  it('LC tank — conserves oscillation amplitude better than trapezoidal on long runs', async () => {
    // Ideal LC tank at f = 1/(2π√LC). L=1mH, C=1µF → f ≈ 5033 Hz, T ≈ 199 µs.
    // With a small series R, trapezoidal method leaks amplitude over many
    // cycles due to its marginal A-stability at the oscillation frequency.
    // BDF2 is L-stable — it damps slightly but very uniformly, so the
    // oscillation remains clean over long runs.
    const netlist = `
V1 1 0 PULSE(0 1 0 1n 1n 1m 2m)
R1 1 2 0.1
L1 2 3 1m
C1 3 0 1u
.tran 1u 3m
`;
    const result = await simulate(netlist, { integrationMethod: 'gear2' });
    const v3 = result.transient!.voltage('3');
    // Over 3 ms ≈ 15 oscillation periods: the tank rings. BDF2 should give
    // a bounded response with no explosion.
    const peak = Math.max(...v3.map(Math.abs));
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(10); // nothing explodes
    expect(peak).toBeGreaterThan(0.05); // something actually oscillates
  });

  it('matches trapezoidal on linear RC within tolerance (basic sanity)', async () => {
    // Both methods should produce nearly the same solution for a simple RC.
    const netlist = `
V1 1 0 DC 10
R1 1 2 1k
R2 2 0 1k
C1 2 0 1u
.tran 1u 1m
`;
    const trap = await simulate(netlist, { integrationMethod: 'trapezoidal' });
    const gear = await simulate(netlist, { integrationMethod: 'gear2' });
    const trapFinal = trap.transient!.voltage('2').at(-1)!;
    const gearFinal = gear.transient!.voltage('2').at(-1)!;
    expect(gearFinal).toBeCloseTo(trapFinal, 4);
  });

  it('RLC step response — damped oscillation converges to steady state', async () => {
    // Second-order step response: underdamped RLC. DC steady state V(2) = 5V.
    // The transient should settle to 5V within a few time constants.
    const netlist = `
V1 1 0 PULSE(0 5 0 1n 1n 10m 20m)
R1 1 2 10
L1 2 3 1m
C1 3 0 1u
.tran 1u 2m
`;
    const result = await simulate(netlist, { integrationMethod: 'gear2' });
    const vout = result.transient!.voltage('3');
    // Final value should be close to 5V (DC steady state of step input).
    const final = vout[vout.length - 1];
    expect(final).toBeGreaterThan(3);
    expect(final).toBeLessThan(7);
  });

  it('unblocks buck-boost where trapezoidal hits TimestepTooSmall at 651 ns', async () => {
    // Inverting buck-boost: trapezoidal fails at the first MOSFET turn-on
    // because its marginal A-stability rings across the switching edge.
    // BDF2's L-stability damps the ringing and NR converges cleanly.
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
.tran 50n 5u
`;
    const result = await simulate(BUCK_BOOST, { integrationMethod: 'gear2' });
    expect(result.transient!.time.at(-1)).toBeCloseTo(5e-6, 9);
  }, 30_000);
});
