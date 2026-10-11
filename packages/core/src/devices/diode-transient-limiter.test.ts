import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

// Follow-up to #430: transient Newton used a stateless junction compression
// above vcrit whose fixed point is not the diode law. A DC-driven circuit then
// jumped away from its (exact) operating point at t=0+ and stayed tens of mV
// off for the whole run. ngspice-47 limits each transient iterate against the
// previous one (DEVpnjlim), so a constant circuit stays on its operating point.
//
// References: ngspice-47 `ngspice -b`, `set numdgt=15`, identical decks. With
// default tolerances ngspice stops its t=0 operating point a few microvolts
// (0.2 mV for the breakdown deck) short of the converged law and lands on it
// in the first transient steps; spice-ts must hold that law within the same
// residual at every point.
const NEWTON_STOP_RESIDUAL = 1e-5;

async function transientOut(netlist: string): Promise<number[]> {
  const result = await simulate(netlist);
  return result.transient!.voltage('out');
}

function maxDeviation(values: number[], reference: number): number {
  return Math.max(...values.map(value => Math.abs(value - reference)));
}

describe('transient diode limiting keeps the exact diode law', () => {
  it('holds the R=10 Ohm, 0.42 A operating point through a DC transient', async () => {
    // ngspice-47 v(out): t=0 8.11279040606e-01, every later point 8.11279029231e-01
    const out = await transientOut(`diode tran R10
      V1 in 0 DC 5
      R1 in out 10
      D1 out 0 DM
      .model DM D IS=1e-14
      .tran 1u 10u
      .end`);
    expect(maxDeviation(out, 0.811279029231)).toBeLessThan(NEWTON_STOP_RESIDUAL);
  });

  it('holds an IKF operating point above the knee through a DC transient', async () => {
    // ngspice-47 v(out): t=0 1.016380189196, later points 1.016379577629
    const out = await transientOut(`diode tran IKF
      V1 in 0 DC 5
      R1 in out 100
      D1 out 0 DM
      .model DM D IS=1e-14 N=1.2 IKF=1m
      .tran 1u 10u
      .end`);
    expect(maxDeviation(out, 1.016379577629)).toBeLessThan(NEWTON_STOP_RESIDUAL);
  });

  it('holds a 1.5 A breakdown operating point through a DC transient', async () => {
    // ngspice-47 v(out): t=0 -5.189410812, later points -5.189213894
    const out = await transientOut(`diode tran breakdown
      V1 in 0 DC -10
      R1 in out 3.2
      D1 out 0 DM
      .model DM D IS=1e-14 BV=5 IBV=1m
      .tran 1u 10u
      .end`);
    expect(maxDeviation(out, -5.189213894)).toBeLessThan(NEWTON_STOP_RESIDUAL);
  });

  it('reaches the forward law on a pulsed high-current diode with charge storage', async () => {
    // ngspice-47 v(out) at t=4 us (pulse plateau): 8.11279029231e-01
    const result = await simulate(`diode tran pulse
      V1 in 0 PULSE(0 5 1u 1u 1u 5u 20u)
      R1 in out 10
      D1 out 0 DM
      .model DM D IS=1e-14 CJO=10p TT=1n
      .tran 10n 20u
      .end`);
    const time = result.transient!.time;
    const out = result.transient!.voltage('out');
    const plateau = out.filter((_, i) => time[i] >= 3.5e-6 && time[i] <= 6.5e-6);
    expect(plateau.length).toBeGreaterThan(0);
    expect(maxDeviation(plateau, 0.811279029231)).toBeLessThan(NEWTON_STOP_RESIDUAL);
  });
});

describe('trapezoidal history of a charge-free diode', () => {
  // A diode without CJO/CJSW/TT stores no charge, so trapezoidal integration
  // must use the exact accepted static current. The raw-RHS history kept for
  // nonlinear capacitances mixes the new diode conductance with the old
  // operating point and charged Cl 18% too fast (showcase rectifier).
  it('charges the half-wave rectifier capacitor like ngspice-47', async () => {
    const result = await simulate(`rectifier
      V1 in 0 SIN(0 5 1k)
      Rs in anode 10
      D1 anode out DMOD
      Rl out 0 10k
      Cl out 0 10u
      .model DMOD D(IS=1e-14 N=1)
      .tran 1u 0.2m
      .end`);
    const time = result.transient!.time;
    const out = result.transient!.voltage('out');
    const index = time.findIndex(t => t >= 1e-4);
    const fraction = (1e-4 - time[index - 1]) / (time[index] - time[index - 1]);
    const at100us = out[index - 1] + fraction * (out[index] - out[index - 1]);
    // ngspice-47 (identical deck, .tran 1u 4m): v(out) at 100 us = 0.665192
    expect(Math.abs(at100us - 0.665192)).toBeLessThan(1e-3);
  });
});
