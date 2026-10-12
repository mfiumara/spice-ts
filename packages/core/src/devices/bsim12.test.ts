import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, simulate } from '../index.js';
import { InvalidCircuitError, UnsupportedModelParameterError } from '../errors.js';

// Issue #657: BSIM1 (MOSFET LEVEL=4) and BSIM2 (LEVEL=5), ported from ngspice-47.
// Reference values come from ngspice-47 batch runs of the same decks
// (`wrdata` of the listed vectors); benchmarks/bsim12-657/compare.ts reruns the
// full differential and benchmarks/bsim12-657/README.md records it.

const repo = new URL('../../../../', import.meta.url);
const deck = (path: string) => readFileSync(new URL(path, repo), 'utf8');
const BSIM1_FIXTURE = 'benchmarks/corpus/classic/fixtures/spice3f5/bsim1tst.cir';
const BSIM2_FIXTURE = 'benchmarks/corpus/classic/fixtures/spice3f5/bsim2tst.cir';

function expectClose(actual: number, expected: number, rel: number, abs: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(rel * Math.abs(expected) + abs);
}

/** Sweep index of a value on a uniform .dc grid. */
function at(sweep: Float64Array, value: number): number {
  const index = sweep.findIndex(x => Math.abs(x - value) < 1e-9);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe('BSIM1/BSIM2 corpus device sweeps match ngspice-47 (#657)', () => {
  // [VGS, I(V1) .. I(V5)] for VBS = 0, -1, -2, -3, -4 V.
  const cases: Array<[string, string, number[][]]> = [
    ['classic/bsim1-device-sweep (LEVEL=4)', BSIM1_FIXTURE, [
      [0.5, 2.703932520e-10, 2.142120370e-12, 4.179258090e-12, 6.217920390e-12, 8.256582880e-12],
      [1, 3.098364410e-06, 8.597153540e-10, 4.365775960e-12, 6.218037560e-12, 8.256582880e-12],
      [2, 1.824477220e-05, 1.181670860e-05, 7.498407390e-06, 4.257221320e-06, 1.650997390e-06],
      [3, 3.147330930e-05, 2.569654820e-05, 2.177284410e-05, 1.879227030e-05, 1.642256050e-05],
      [5, 5.349490630e-05, 4.871119770e-05, 4.538921840e-05, 4.280639540e-05, 4.069972110e-05],
    ]],
    ['classic/bsim2-device-sweep (LEVEL=5)', BSIM2_FIXTURE, [
      [0.5, 8.754271380e-09, 2.320557760e-12, 4.496289860e-12, 6.689601740e-12, 8.882913780e-12],
      [1, 7.474892430e-06, 9.402971310e-08, 7.201260030e-12, 6.689754280e-12, 8.882913800e-12],
      [2, 3.103865740e-05, 2.306368450e-05, 1.647035730e-05, 1.041888860e-05, 4.584045660e-06],
      [3, 5.020639510e-05, 4.370385200e-05, 3.843704230e-05, 3.371455510e-05, 2.927440390e-05],
      [5, 7.605712960e-05, 7.125680510e-05, 6.742880500e-05, 6.412381740e-05, 6.115139200e-05],
    ]],
  ];

  it.each(cases)('%s', async (_name, path, rows) => {
    const result = await simulate(deck(path));
    const sweep = result.dcSweep!;
    for (const [vgs, ...currents] of rows) {
      const i = at(sweep.sweepValues, vgs);
      currents.forEach((expected, k) => {
        expectClose(sweep.current(`V${k + 1}`)[i], expected, 1e-6, 1e-12);
      });
    }
  });
});

describe('BSIM1/BSIM2 output characteristics match ngspice-47 (#657)', () => {
  it('BSIM1 NMOS through inverse mode, with RSH*NRD/NRS series resistance', async () => {
    const sweep = (await simulate(deck('benchmarks/bsim12-657/fixtures/bsim1-output-inverse.cir'))).dcSweep!;
    const rows = [
      [-1.01, -6.988613470e-04, -2.598934190e-03],
      [-0.01, -6.008517830e-06, -3.403992750e-06],
      [0.99, 3.261645670e-04, 5.839842310e-05],
      [2.99, 3.724235340e-04, 6.663028630e-05],
      [4.99, 3.844114150e-04, 7.305778510e-05],
    ];
    for (const [vds, i1, i2] of rows) {
      const i = at(sweep.sweepValues, vds);
      // ngspice stops Newton at RELTOL here; with RELTOL=1e-7 it moves onto spice-ts (README).
      expectClose(sweep.current('V1')[i], i1, 1e-5, 1e-12);
      expectClose(sweep.current('V2')[i], i2, 1e-5, 1e-12);
    }
  });

  it('BSIM2 PMOS with forward and reverse body bias', async () => {
    const sweep = (await simulate(deck('benchmarks/bsim12-657/fixtures/bsim2-pmos-output.cir'))).dcSweep!;
    const rows = [
      [-0.01, -4.624106260e-06, -2.439950890e-05],
      [-1.01, -2.300539710e-04, -2.353795030e-03],
      [-2.01, -2.244645380e-04, -3.457666040e-03],
      [-4.01, -2.030298550e-04, -3.541770790e-03],
    ];
    for (const [vds, i1, i2] of rows) {
      const i = at(sweep.sweepValues, vds);
      expectClose(sweep.current('V1')[i], i1, 1e-6, 1e-12);
      expectClose(sweep.current('V2')[i], i2, 1e-6, 1e-12);
    }
  });
});

describe('BSIM1/BSIM2 charge model (#657)', () => {
  it.each([
    // [deck, f, |v(out)|, phase in radians]
    ['benchmarks/bsim12-657/fixtures/bsim1-cs-ac.cir', [
      [1e3, 6.40092929e-01, 3.14157713], [1e9, 7.43136657e-02, 7.15059816e-01], [1e10, 5.94059232e-02, 3.19633206e-02],
    ]],
    ['benchmarks/bsim12-657/fixtures/bsim2-cs-ac.cir', [
      [1e3, 1.87389676, 3.14156828], [1e9, 1.37411416, 1.67714835e-01], [1e10, 1.37115972, 1.68133145e-02],
    ]],
  ] as const)('AC small-signal gain of %s', async (path, rows) => {
    const ac = (await simulate(deck(path))).ac!;
    const out = ac.voltage('out');
    for (const [frequency, magnitude, phase] of rows) {
      const i = ac.frequencies.findIndex(f => Math.abs(f / frequency - 1) < 1e-9);
      expectClose(out[i].magnitude, magnitude, 1e-5, 0);
      expectClose(out[i].phase * Math.PI / 180, phase, 1e-4, 1e-6);
    }
  });

  it('BSIM1 resistor-load inverter transient', async () => {
    const tran = (await simulate(deck('benchmarks/bsim12-657/fixtures/bsim1-rload-tran.cir'))).transient!;
    const out = tran.voltage('out');
    const sample = (t: number) => {
      const k = tran.time.findIndex(x => x >= t);
      const f = (t - tran.time[k - 1]) / (tran.time[k] - tran.time[k - 1]);
      return out[k - 1] + f * (out[k] - out[k - 1]);
    };
    // ngspice-47 v(out), linearized on a 0.1 ns grid.
    for (const [t, v] of [[10e-9, 0.521682611], [30e-9, 2.30245965], [50e-9, 4.93942921], [70e-9, 0.498396283]]) {
      expect(Math.abs(sample(t) - v)).toBeLessThan(5e-3);
    }
  });
});

describe('BSIM1/BSIM2 parameters that are not ported are typed errors (#657)', () => {
  const sweep = (card: string, instance = '') => `bsim
MN1 d g 0 0 NX L=10U W=50U ${instance}
VD d 0 1
VG g 0 2
.model NX NMOS (${card})
.op
.end
`;

  it.each([
    ['LEVEL=4 TOX=0.03 VTO=0.7', 'BSIM1', 'VTO'],
    ['LEVEL=5 KP=1e-4', 'BSIM2', 'KP'],
  ])('rejects %s', (card, model, parameter) => {
    let caught: unknown;
    try {
      parse(sweep(card)).compile();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedModelParameterError);
    expect(caught).toMatchObject({ code: 'UNSUPPORTED_MODEL_PARAMETER', model, modelName: 'NX', parameter });
  });

  it('rejects instance parameters BSIM1 does not define', () => {
    expect(() => parse(sweep('LEVEL=4 TOX=0.03', 'TEMP=50')).compile())
      .toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MODEL_PARAMETER', parameter: 'TEMP' }));
  });

  it('rejects a BSIM1 card without TOX (b1set.c default 0 gives an infinite Cox)', () => {
    expect(() => parse(sweep('LEVEL=4 VFB=-1')).compile()).toThrow(InvalidCircuitError);
    expect(() => parse(sweep('LEVEL=4 VFB=-1')).compile()).toThrow(/BSIM1 model 'NX': TOX must be positive/);
  });

  it('rejects .noise on BSIM1 and BSIM2 instead of treating the channel as noiseless', async () => {
    for (const level of [4, 5]) {
      const netlist = `noise
MN1 d g 0 0 NX L=10U W=50U
RD vdd d 10k
VDD vdd 0 5
VG g 0 DC 2 AC 1
.model NX NMOS (LEVEL=${level} TOX=0.03)
.noise v(d) VG dec 2 1k 10k
.end
`;
      await expect(simulate(netlist)).rejects.toThrow(/does not support MOSFET BSIM[12] noise/);
    }
  });
});
