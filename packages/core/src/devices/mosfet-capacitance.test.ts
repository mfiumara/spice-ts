import { describe, expect, it } from 'vitest';
import { MOSFET } from './mosfet.js';
import type { StampContext } from './device.js';
import { simulate } from '../simulate.js';

function context(voltage: number[]) {
  const c = new Float64Array(16);
  const g = new Float64Array(16);
  const b = new Float64Array(4);
  const ctx: StampContext = {
    stampC: (r, col, v) => { c[4 * r + col] += v; },
    stampG: (r, col, v) => { g[4 * r + col] += v; },
    stampB: (r, v) => { b[r] += v; },
    getVoltage: n => voltage[n] ?? 0, getCurrent: () => 0,
    time: 0, dt: 0, numNodes: 4, sourceScale: 1, useDcSourceValue: true,
  };
  return { ctx, c, g, b };
}
const base = { VTO: 0.7, KP: 1e-4, W: 10e-6, L: 1e-6 };
const area = { CJ: 1e-3, CJSW: 1e-9, MJ: 0.5, MJSW: 0.33, PB: 0.8,
  AD: 100e-12, AS: 50e-12, PD: 40e-6, PS: 20e-6 };
function near(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-27 + Math.abs(expected) * 1e-10);
}

// ngspice-47: VD d 0 -bias; VG g 0 -2 AC 1; VB b 0 0;
// M1 d g 0 b nm W=10u L=1u AD=100p AS=50p PD=40u PS=20u;
// .model nm nmos level=1 vto=.7 kp=1e-4 [parameters below]
// ac lin 1 1e6 1e6; print @m1[cbd] @m1[cbs]. Default TEMP=TNOM=27.
const biases = [-2, -1, 0, 0.2, 0.4, 0.5, 0.6];
const areaReference = [7.990784357785411e-14, 9.727500550108095e-14, 1.4e-13,
  1.594535527134802e-13, 1.917018912181826e-13, 2.135277048837684e-13, 2.353535185493541e-13];
const explicitReference = [5.345224838248489e-14, 6.666666666666667e-14, 1e-13,
  1.154700538379252e-13, 1.414213562373095e-13, 1.590990257669732e-13, 1.767766952966369e-13];

describe('MOS1 ngspice-47 depletion and Meyer capacitances (#590/#591)', () => {
  for (const polarity of [1, -1]) {
    for (const [label, params, reference, source] of [
      ['area/perimeter', area, areaReference, 7e-14],
      ['explicit CBD/CBS', { CBD: 100e-15, CBS: 50e-15 }, explicitReference, 5e-14],
    ] as const) {
      it(`matches the ${label} C(V) sweep including forward continuation, polarity=${polarity}`, () => {
        const mos = new MOSFET('M1', [0, 1, 2, 3], { ...base, ...params, polarity });
        biases.forEach((bias, i) => {
          const { ctx, c } = context([-polarity * bias, -2 * polarity, 0, 0]);
          mos.stampAC(ctx, 2 * Math.PI * 1e6);
          near(-c[12], reference[i]);
          near(-c[14], source);
        });
      });
    }
  }

  // Same ngspice deck with VD=1, VG=bias, TOX=20n, print @m1[cgs/cgd/cgb].
  const gateReference = [
    [0, 0, 0, 1.726571899845e-14],
    [0.2, 0, 0, 1.4388099165375e-14],
    [0.5, 3.836826444099995e-15, 0, 5.755239666150001e-15],
    [0.7, 1.15104793323e-14, 0, 0],
    [1, 1.15104793323e-14, 0, 0],
    [2, 1.110581404327382e-14, 3.911764460586326e-15, 0],
    [4, 9.568820031666483e-15, 7.51337729375577e-15, 0],
  ];
  for (const polarity of [1, -1]) {
    for (const reverse of [false, true]) {
      it(`matches Meyer accumulation/depletion/saturation/linear caps, polarity=${polarity}, reverse=${reverse}`, () => {
        const mos = new MOSFET('M1', reverse ? [2, 1, 0, 3] : [0, 1, 2, 3],
          { ...base, VTO: polarity * base.VTO, TOX: 20e-9, polarity });
        for (const [bias, gs, gd, gb] of gateReference) {
          const { ctx, c } = context([polarity, polarity * bias, 0, 0]);
          mos.stampDynamic(ctx);
          near(-c[6], gs); near(-c[4], gd); near(-c[7], gb);
        }
      });
    }
  }

  it('matches the gate-drive current of the ngspice-47 AC deck', async () => {
    const result = await simulate(`MOS1 AC gate
VD d 0 1
VG g 0 2 AC 1
VB b 0 0
M1 d g 0 b nm W=10u L=1u AD=100p AS=50p PD=40u PS=20u
.model nm nmos level=1 vto=.7 kp=1e-4 tox=20n cj=1e-3 cjsw=1e-9 mj=.5 mjsw=.33 pb=.8
.ac lin 1 1e6 1e6
.end`);
    near(result.ac!.current('VG')[0].magnitude, 9.43582286048701e-8);
  });

  it('averages the accepted and trial Meyer caps for charge increments, without committing rejected trials', () => {
    const mos = new MOSFET('M1', [0, 1, 2, 3], { ...base, TOX: 20e-9 });
    mos.acceptTransientStep(context([1, 0.2, 0, 0]).ctx);
    const stamp = (v: number) => {
      const result = context([1, v, 0, 0]);
      mos.stampTransientCharge(result.ctx, { method: 'euler', dt: 1e-9 });
      return result;
    };
    stamp(4); // rejected trial must not overwrite accepted capacitance/voltage
    const { g, b } = stamp(0.5);
    const expectedC = (1.4388099165375e-14 + 3.836826444099995e-15 + 5.755239666150001e-15) / 2;
    near(g[5], expectedC / 1e-9);
    near(g[5] * 0.5 - b[1], expectedC * 0.3 / 1e-9);
    mos.resetTransient();
    mos.acceptTransientStep(context([1, 0.2, 0, 0]).ctx);
    near(stamp(0.5).b[1], b[1]);
  });

  it('matches ngspice-47 gate current through cutoff, saturation and linear operation on both ramp directions', async () => {
    const result = await simulate(`MOS1 gate transient reference
VD d 0 1
VG g 0 PULSE(0 5 1n 5n 5n 1n 15n)
VB b 0 0
M1 d g 0 b nm W=10u L=1u
.model nm nmos level=1 vto=.7 kp=1e-4 tox=20n
.tran .01n 13n 0 .001n
.end`);
    const tran = result.transient!;
    const current = tran.current('VG');
    // ngspice-47 on the identical deck, interpolated at these times. In the
    // linear region spice-ts matches ngspice-47 to rounding (issue #479:
    // with the mos1conv.c test, Newton no longer stops after one iterate with
    // the Meyer caps of the previous timepoint). Not sampled: 2.934-3.2 ns
    // and 9.83-10.07 ns, where ngspice-47's i(vg) jumps by ~1.4e-8 A relative
    // to spice-ts with and without the convergence test and decays back.
    const reference = [
      [1.2, -1.4388099165376614e-5], [1.5, -9.592066110249767e-6],
      [2, -1.1510479332302474e-5], [2.8, -1.3269016459384389e-5],
      [5, -1.7081934852818768e-5], [7.5, 1.713375686917922e-5],
      [10.3, 1.151622595058964e-5], [11.8, 1.4388099165354563e-5],
    ];
    for (const [ns, expected] of reference) {
      const time = ns * 1e-9;
      let i = 1;
      while (tran.time[i] < time) i++;
      const fraction = (time - tran.time[i - 1]) / (tran.time[i] - tran.time[i - 1]);
      const actual = current[i - 1] + fraction * (current[i] - current[i - 1]);
      expect(Math.abs(actual - expected), `i(vg) at ${ns} ns`).toBeLessThan(1e-8);
    }
  }, 30_000);

  it('keeps the sidewall when CBD overrides CJ*AD and supports a zero override', () => {
    const mos = new MOSFET('M1', [0, 1, 2, 3], { ...base, ...area, CBD: 0, CBS: 0 });
    const { ctx, c } = context([0, -2, 0, 0]);
    mos.stampDynamic(ctx);
    near(-c[12], 40e-15); near(-c[14], 20e-15);
  });

  it('adds all three overlaps with Leff for CGBO and a source-tied omitted bulk', () => {
    const mos = new MOSFET('M1', [0, 1, 2], { ...base, LD: 0.1e-6, CGBO: 1e-9, CGSO: 2e-9, CGDO: 3e-9 });
    const { ctx, c } = context([1, 2, 0]);
    mos.stampDynamic(ctx);
    near(-c[4], 3e-14); near(-c[6], 2.08e-14);
  });

  it('integrates the depletion charge rather than C(v)*v, including forward continuation and PMOS polarity', () => {
    for (const polarity of [1, -1]) {
      const mos = new MOSFET('M1', [0, 1, 2, 3], { ...base, CBD: 100e-15, polarity });
      mos.acceptTransientStep(context([0, -2 * polarity, 0, 0]).ctx);
      for (const bias of [-1, 0.2, 0.4, 0.6]) {
        const { ctx, g, b } = context([-polarity * bias, -2 * polarity, 0, 0]);
        mos.stampTransientCharge(ctx, { method: 'euler', dt: 1e-9 });
        const cornerQ = 2 * 100e-15 * 0.8 * (1 - Math.sqrt(0.5));
        const delta = bias - 0.4;
        const q = bias < 0.4 ? 2 * 100e-15 * 0.8 * (1 - Math.sqrt(1 - bias / 0.8))
          : cornerQ + 100e-15 * Math.SQRT2 * (delta + delta * delta / 1.6);
        // Bulk row conductance times voltage minus RHS is physical dQ/dt.
        near(g[12] * (-polarity * bias) - b[3], polarity * q / 1e-9);
      }
    }
  });
});
