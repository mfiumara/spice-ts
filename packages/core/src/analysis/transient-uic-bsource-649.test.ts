import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #649: with `uic`, the seed puts v(x1) = 7000 V from the capacitor
// IC but leaves v(x) at 0 V across the 0 V source Vx. Node x sits on a B
// source, and transient Newton capped every B-source node to a 3.5 V step
// per iteration, so x could not reach 7000 V within ITL4: the first step
// was cut to "Timestep too small at t=0". asrcload.c applies no limiting and
// ngspice damps no node voltages, so ngspice-47 takes the jump in one Newton
// step and runs the deck with v(x1) = v(x) = 7000 V throughout.

const deck = (expression: string): string => `top-level cap IC uic
V1 0 1 DC 0 sin(0 3 100Meg)
R1 1 0 7k
Bx 0 x I=${expression}
Vx x x1 dc 0
Cx x1 0 1 IC=7000
.tran 0.1n 10n uic
.end
`;

// ngspice-47 `ngspice -b` on the identical decks prints v(x1) = v(x) =
// 7.000000e+03 at every point to 10 ns, and i(vx) = 0 (I=0) or 7.000000e-03
// (I=1e-6*v(x)); 1 F barely moves under 7 mA in 10 ns (7e-11 V).
// v(1) = -V1 exactly, since R1 is the only load on V1.
const CASES = [
  { expression: '0', current: 0 },
  // The B source reads the node that jumps: its control node is undamped too.
  { expression: '1e-6*v(x)', current: 7e-3 },
] as const;

describe('uic with a B source on a capacitor IC node (#649)', () => {
  for (const { expression, current } of CASES) {
    it(`runs Bx I=${expression} like ngspice-47`, async () => {
      const transient = (await simulate(deck(expression))).transient!;
      const time = transient.time;
      const x = transient.voltage('x');
      const x1 = transient.voltage('x1');
      const v1 = transient.voltage('1');
      const ivx = transient.current('Vx');
      expect(time[time.length - 1]).toBeCloseTo(10e-9, 15);
      expect(time.length).toBeGreaterThan(50);
      // ngspice prints no t=0 row in UIC mode; compare every accepted step.
      for (let index = 1; index < time.length; index++) {
        expect(Math.abs(x1[index]! - 7000)).toBeLessThan(1e-6);
        expect(Math.abs(x[index]! - 7000)).toBeLessThan(1e-6);
        expect(Math.abs(ivx[index]! - current)).toBeLessThan(1e-9);
        const source = 3 * Math.sin(2 * Math.PI * 100e6 * time[index]!);
        expect(Math.abs(v1[index]! + source)).toBeLessThan(1e-9);
      }
    });
  }
});
