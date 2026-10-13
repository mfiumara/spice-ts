import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from './errors.js';
import { simulate } from './simulate.js';

/**
 * Linear F (CCCS) and H (CCVS) cards whose controlling voltage source comes
 * later in the deck (#860). ngspice-47 binds the controlling source in
 * CCCSsetup/CCVSsetup after every instance exists, so card order does not
 * matter, at top level or inside a subcircuit (TI OPA690.LIB, Boyle model).
 *
 * Every expected value below is ngspice-47 `ngspice -b` output on the same deck.
 */
const DEVICES = `f1 0 4 vs 2
r4 4 0 1k
h1 2 0 vs 1k
r2 2 0 1k
x1 in 5 fwd
r5 5 0 1k
v1 in 0 dc 1 ac 1 sin(0 1 1k)
r1 in 1 1k
vs 1 3 0
r3 3 0 1k
c3 3 0 100n
.subckt fwd a b
h1 b 0 vf 500
vf a m 0
rm m 0 1k
.ends fwd`;

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

describe('F/H controlled by a voltage source defined later (#860, ngspice-47)', () => {
  it('solves the operating point', async () => {
    // ngspice-47: v(2) = 5.000000e-01, v(4) = 1.000000e+00, v(5) = 5.000000e-01,
    // i(vs) = 5.000000e-04, i(h1) = -5.00000e-04.
    const result = await simulate(`fh forward reference op\n${DEVICES}\n.op\n.end`);
    const dc = result.dc!;

    expect(dc.voltage('2')).toBeCloseTo(0.5, 12);
    expect(dc.voltage('4')).toBeCloseTo(1, 12);
    expect(dc.voltage('5')).toBeCloseTo(0.5, 12);
    expect(dc.current('vs')).toBeCloseTo(5e-4, 15);
    expect(dc.current('h1')).toBeCloseTo(-5e-4, 15);
  });

  it('solves the AC sweep', async () => {
    // ngspice-47 print vm(2) vp(2) (radians) vm(4) vm(5) for ac dec 1 100 10k.
    const ngspice = [
      [5.007389e-1, 3.134377e-2, 1.001478, 5e-1],
      [5.633583e-1, 2.565863e-1, 1.126717, 5e-1],
      [9.648835e-1, 1.503379e-1, 1.929767, 5e-1],
    ];
    const result = await simulate(`fh forward reference ac\n${DEVICES}\n.ac dec 1 100 10k\n.end`);
    const v2 = result.ac!.voltage('2');
    const v4 = result.ac!.voltage('4');
    const v5 = result.ac!.voltage('5');

    expect(v2).toHaveLength(ngspice.length);
    ngspice.forEach(([m2, p2, m4, m5], index) => {
      expect(relativeError(v2[index].magnitude, m2)).toBeLessThan(1e-6);
      expect(relativeError(v2[index].phase * Math.PI / 180, p2)).toBeLessThan(1e-6);
      expect(relativeError(v4[index].magnitude, m4)).toBeLessThan(1e-6);
      expect(relativeError(v5[index].magnitude, m5)).toBeLessThan(1e-6);
    });
  });

  it('runs the transient', async () => {
    // ngspice-47 meas: v(2), v(4), v(5) at 0.25 ms = 5.43343e-01, 1.08669e+00, 4.99307e-01;
    // v(2), v(4) at 0.75 ms = -5.44263e-01, -1.08853e+00.
    const result = await simulate(`fh forward reference tran\n${DEVICES}\n.tran 50u 1m\n.end`);
    const time = result.transient!.time;
    const at = (node: string, t: number): number => {
      const values = result.transient!.voltage(node);
      const index = time.findIndex(value => value >= t - 1e-15);
      if (Math.abs(time[index] - t) < 1e-15) return values[index];
      const fraction = (t - time[index - 1]) / (time[index] - time[index - 1]);
      return values[index - 1] + fraction * (values[index] - values[index - 1]);
    };

    expect(relativeError(at('2', 0.25e-3), 5.43343e-1)).toBeLessThan(2e-3);
    expect(relativeError(at('4', 0.25e-3), 1.08669)).toBeLessThan(2e-3);
    expect(relativeError(at('5', 0.25e-3), 4.99307e-1)).toBeLessThan(2e-3);
    expect(relativeError(at('2', 0.75e-3), -5.44263e-1)).toBeLessThan(2e-3);
    expect(relativeError(at('4', 0.75e-3), -1.08853)).toBeLessThan(2e-3);
  });

  it('still rejects a controlling source that does not exist with a structured error', async () => {
    // ngspice-47: "Fatal error: f1: unknown controlling source vnope".
    for (const card of ['f1 0 4 vnope 2', 'h1 4 0 vnope 2']) {
      const run = simulate(`missing control\n${card}\nr4 4 0 1k\nv1 1 0 1\nr1 1 0 1k\n.op\n.end`);
      await expect(run).rejects.toBeInstanceOf(InvalidCircuitError);
      await expect(run).rejects.toThrow(/references unknown or branchless source 'vnope'/);
    }
  });
});
