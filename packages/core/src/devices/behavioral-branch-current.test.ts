import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

/**
 * B-source expressions reading voltage-source branch currents, `i(vx)`
 * (ngspice PT_CURRENT, #718). The current is the MNA branch unknown of the
 * referenced source, positive from its + node through the source to its -
 * node, and the expression is linearised with d/d(branch) on that unknown.
 *
 * b1 (I= form) and b2 (V= form) read i(vsense); b2 also reads the branch of
 * the V= B-source b3. The I= feedback keeps |d i(b1) / d i(vsense)| < 1, so
 * the Jacobian is regular from the zero start, as in ngspice.
 */
const BRANCH_CURRENT_DECK = [
  'b-source branch current',
  'v1 1 0 dc 2 ac 1 sin(0 2 1k)',
  'r1 1 2 1k',
  'vsense 2 3 0',
  'r2 3 0 2k',
  'c1 3 0 100n',
  'b1 3 0 i=0.25*i(vsense)+0.2m*tanh(1k*i(vsense))',
  'b2 4 0 v=1k*i(vsense)+500*i(b3)',
  'r4 4 0 1k',
  'b3 5 0 v=2*v(3)',
  'r5 5 0 1k',
].join('\n');

const deck = (analysis: string) => `${BRANCH_CURRENT_DECK}\n${analysis}\n.end`;

// ngspice-47 `.op` of deck('.op') (`set numdgt=14`; print v(3) v(4) i(vsense) i(b3)).
const NGSPICE_47_OP = {
  v3: 1.08417325165710e+00,
  v4: -1.6834650331420e-01,
  vsense: 9.15826748342901e-04,
  b3: -2.1683465033142e-03,
};

// ngspice-47 `.ac dec 2 10 100k` of the same deck: [frequency, vr(3), vi(3), vr(4), vi(4)].
const NGSPICE_47_AC: readonly (readonly [number, number, number, number, number])[] = [
  [1.00000000000000e+01, 5.67012012628602e-01, -3.0850423858364e-03, -1.3402402525720e-01, 6.17008477167288e-03],
  [3.16227766016838e+01, 5.66860989322170e-01, -9.7531621764665e-03, -1.3372197864434e-01, 1.95063243529329e-02],
  [1.00000000000000e+02, 5.65355169250160e-01, -3.0760277054852e-02, -1.3071033850032e-01, 6.15205541097031e-02],
  [3.16227766016838e+02, 5.50725592218866e-01, -9.4755435932608e-02, -1.0145118443773e-01, 1.89510871865215e-01],
  [1.00000000000000e+03, 4.37511626964817e-01, -2.3804467690649e-01, 1.24976746070366e-01, 4.76089353812973e-01],
  [3.16227766016838e+03, 1.43177744393487e-01, -2.4634536287285e-01, 7.13644511213026e-01, 4.92690725745704e-01],
  [1.00000000000000e+04, 1.85284527581295e-02, -1.0081102486313e-01, 9.62943094483741e-01, 2.01622049726268e-01],
  [3.16227766016838e+04, 1.90898617056802e-03, -3.2845180855442e-02, 9.96182027658864e-01, 6.56903617108844e-02],
  [1.00000000000000e+05, 1.91478794527188e-04, -1.0418124906503e-02, 9.99617042410946e-01, 2.08362498130059e-02],
];

// ngspice-47 `.tran 20u 2m 0 2u`, `linearize v(3) v(4)`, every 200 us: [time, v(3), v(4)].
const NGSPICE_47_TRAN: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [200e-6, 6.91751575557471e-01, 5.18588879229239e-01],
  [400e-6, 8.61608283146821e-01, -5.4765910323298e-01],
  [600e-6, -9.7296380704810e-02, -9.8096480103447e-01],
  [800e-6, -9.3421493743628e-01, -3.3662117510525e-02],
  [1000e-6, -4.7130109674637e-01, 9.42602254915088e-01],
  [1200e-6, 6.44620744585023e-01, 6.12850541174111e-01],
  [1400e-6, 8.56878561559796e-01, -5.3819966005894e-01],
  [1600e-6, -9.7821102707011e-02, -9.7991535703010e-01],
  [1800e-6, -9.3426384873098e-01, -3.3564294921176e-02],
  [2000e-6, -4.7131198351786e-01, 9.42623967035713e-01],
];

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let i = 1;
  while (i < time.length - 1 && time[i] < at) i++;
  const fraction = (at - time[i - 1]) / (time[i] - time[i - 1]);
  return values[i - 1] + fraction * (values[i] - values[i - 1]);
}

describe('B-source i(vx) branch-current references', () => {
  it('solves the operating point on the referenced branch unknowns like ngspice-47', async () => {
    const dc = (await simulate(deck('.op'))).dc!;
    expect(dc.voltage('3')).toBeCloseTo(NGSPICE_47_OP.v3, 12);
    expect(dc.voltage('4')).toBeCloseTo(NGSPICE_47_OP.v4, 12);
    expect(dc.current('vsense')).toBeCloseTo(NGSPICE_47_OP.vsense, 15);
    expect(dc.current('b3')).toBeCloseTo(NGSPICE_47_OP.b3, 15);
  });

  it('stamps d/d(branch) into the small-signal matrix like ngspice-47 .ac', async () => {
    const ac = (await simulate(deck('.ac dec 2 10 100k'))).ac!;
    const v3 = ac.voltage('3');
    const v4 = ac.voltage('4');
    expect(v3).toHaveLength(NGSPICE_47_AC.length);
    NGSPICE_47_AC.forEach(([, re3, im3, re4, im4], k) => {
      const phase3 = (v3[k].phase * Math.PI) / 180;
      const phase4 = (v4[k].phase * Math.PI) / 180;
      expect(v3[k].magnitude * Math.cos(phase3)).toBeCloseTo(re3, 12);
      expect(v3[k].magnitude * Math.sin(phase3)).toBeCloseTo(im3, 12);
      expect(v4[k].magnitude * Math.cos(phase4)).toBeCloseTo(re4, 12);
      expect(v4[k].magnitude * Math.sin(phase4)).toBeCloseTo(im4, 12);
    });
  });

  it('tracks ngspice-47 through a transient run', async () => {
    const tran = (await simulate(deck('.tran 20u 2m 0 2u'))).transient!;
    const v3 = tran.voltage('3');
    const v4 = tran.voltage('4');
    for (const [time, ref3, ref4] of NGSPICE_47_TRAN) {
      // 1e-4 V on 1 V swings: both engines integrate the same trapezoidal steps under tmax=2u.
      expect(Math.abs(interpolate(tran.time, v3, time) - ref3)).toBeLessThan(1e-4);
      expect(Math.abs(interpolate(tran.time, v4, time) - ref4)).toBeLessThan(1e-4);
    }
  });

  it('qualifies i() inside a subcircuit with the instance path, case-insensitively', async () => {
    // ngspice-47 `.op`: v(2) = -1.9238405844044, v(3) = 3.75185791008058.
    const dc = (await simulate([
      'b-source branch current in subcircuits',
      '.subckt amp in out',
      'vib in mid 0',
      'rin mid 0 1k',
      'bout out 0 v=-2k*I(VIB)+0.1*tanh(i(vib)*1k)',
      '.ends',
      'v1 1 0 dc 1',
      'x1 1 2 amp',
      'x2 2 3 amp',
      'r3 3 0 1k',
      '.op',
      '.end',
    ].join('\n'))).dc!;
    expect(dc.voltage('2')).toBeCloseTo(-1.9238405844044, 12);
    expect(dc.voltage('3')).toBeCloseTo(3.75185791008058, 12);
  });

  it('serialises i() references back to an equivalent netlist', async () => {
    const circuit = parse(deck('.op'));
    const line = circuit.toNetlist().split('\n').find(text => text.startsWith('b2 '));
    expect(line).toBe('b2 4 0 V=((1000*i(vsense))+(500*i(b3)))');
    const reparsed = await simulate(circuit.toNetlist().replace('* spice-ts generated netlist', 'title'));
    expect(reparsed.dc!.voltage('4')).toBeCloseTo(NGSPICE_47_OP.v4, 12);
  });

  it('rejects an unknown source with a structured error, as ngspice does', async () => {
    // ngspice-47: "Fatal error: b1: unknown controlling source vnope".
    const run = simulate('t\nv1 1 0 1\nr1 1 0 1k\nb1 2 0 i=i(vnope)\nr2 2 0 1k\n.op\n.end');
    await expect(run).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(run).rejects.toThrow("B-source 'b1' references i(vnope), but 'vnope' is not a source in the circuit");
  });

  it('rejects a reference to an element without a branch current', async () => {
    const run = simulate('t\nv1 1 0 1\nr1 1 0 1k\nb1 2 0 i=i(r1)\nr2 2 0 1k\n.op\n.end');
    await expect(run).rejects.toBeInstanceOf(InvalidCircuitError);
    await expect(run).rejects.toThrow("'r1' has no branch current");
  });
});
