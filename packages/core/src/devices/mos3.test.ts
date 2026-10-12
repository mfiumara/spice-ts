import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { simulate } from '../simulate.js';

/**
 * Issue #715: MOSFET LEVEL=3 (ngspice-47 mos3) and LEVEL=9 (mos9) used to be
 * rejected with UnsupportedModelLevelError. Every reference below comes from
 * ngspice-47 (`print`/`wrdata`, numdgt=15) on the identical deck.
 */
const N3 = '.MODEL N3 NMOS (LEVEL=3 VTO=0.8 KP=50U GAMMA=0.5 PHI=0.7 NSUB=1E16 TOX=25N UO=600 VMAX=1.5E5'
  + ' NFS=1E11 XJ=0.3U LD=0.2U DELTA=0.5 THETA=0.08 ETA=0.3 KAPPA=0.6 IS=1E-15)';

const NMOS_DRAIN_SWEEP = (level: 3 | 9) => `MOS${level} NMOS drain sweep
VD d 0 DC 0
VG g 0 DC 2.5
VB b 0 DC -1
M1 d g 0 b N3 W=20U L=2U
${N3.replace('LEVEL=3', `LEVEL=${level}`)}
.DC VD -1.5 5 0.25
.END`;

/** ngspice-47 I(VD) of {@link NMOS_DRAIN_SWEEP}; identical for LEVEL=3 and LEVEL=9. */
const NMOS_DRAIN_SWEEP_REFERENCE = [
  1.431418499239654e-03, 1.191040469256802e-03, 9.439040993556849e-04, 6.965743034776309e-04,
  4.558465666041948e-04, 2.231732545792434e-04, -1.00099997673979e-12, -1.89873125953591e-04,
  -3.29446763265523e-04, -4.25988549309244e-04, -4.85430346516321e-04, -5.12661651467358e-04,
  -5.24471976875436e-04, -5.36388788648126e-04, -5.48431141731321e-04, -5.60606026292990e-04,
  -5.72919833108562e-04, -5.85378473500220e-04, -5.97987473224541e-04, -6.10752046943825e-04,
  -6.23677158019093e-04, -6.36767567063723e-04, -6.50027871791041e-04, -6.63462540047478e-04,
  -6.77075937461278e-04, -6.90872350800165e-04, -7.04856007882837e-04,
];

const CMOS_MODELS = [
  '.MODEL N3 NMOS (LEVEL=3 VTO=0.8 KP=50U GAMMA=0.5 PHI=0.7 NSUB=1E16 TOX=25N UO=600 VMAX=1.5E5 NFS=1E11',
  '+ XJ=0.3U LD=0.2U THETA=0.08 ETA=0.3 KAPPA=0.6 RSH=20 CJ=4E-4 CJSW=3E-10 MJ=0.45 MJSW=0.3 CGSO=2E-10'
    + ' CGDO=2E-10 CGBO=1E-10)',
  '.MODEL P3 PMOS (LEVEL=3 VTO=-0.9 GAMMA=0.4 PHI=0.65 NSUB=2E16 TOX=25N UO=250 XJ=0.25U LD=0.1U THETA=0.05',
  '+ ETA=0.1 KAPPA=1.2 RD=40 RS=40 CJ=5E-4 CJSW=3E-10 CGSO=2E-10 CGDO=2E-10 CGBO=1E-10)',
].join('\n');

const CMOS_INVERTER = (level: 3 | 9) => `MOS${level} CMOS inverter transient
VDD vdd 0 DC 5
VIN in 0 PULSE(0 5 2n 1n 1n 8n 20n)
MP out in vdd vdd P3 W=20U L=2U AD=40P AS=40P PD=24U PS=24U
MN out in 0 0 N3 W=10U L=2U AD=20P AS=20P PD=14U PS=14U NRD=2 NRS=2
CL out 0 50F
${CMOS_MODELS.replaceAll('LEVEL=3', `LEVEL=${level}`)}
.TRAN 0.05N 30N 0 0.05N
.END`;

/** ngspice-47 v(out) of {@link CMOS_INVERTER} (identical for LEVEL=3 and LEVEL=9), [time, volts]. */
const CMOS_INVERTER_REFERENCE: ReadonlyArray<readonly [number, number]> = [
  [0, 5.000000e+00], [2.75e-09, 3.809634e+00], [3e-09, 1.224781e+00], [3.25e-09, 1.234364e-01],
  [3.5e-09, 9.082026e-03], [1.15e-08, 3.919677e-01], [1.175e-08, 2.821162e+00], [1.2e-08, 4.629207e+00],
  [1.225e-08, 4.975443e+00], [1.25e-08, 4.998464e+00], [2.275e-08, 3.809634e+00], [2.3e-08, 1.224781e+00],
  [2.325e-08, 1.234364e-01], [3e-08, -9.870929e-08],
];

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

function expectSweep(actual: ArrayLike<number>, reference: readonly number[], label: string, relative = 1e-9): void {
  expect(actual.length).toBe(reference.length);
  reference.forEach((expected, index) => {
    expect(Math.abs(actual[index] - expected), `${label} point ${index}`)
      .toBeLessThan(1e-14 + relative * Math.abs(expected));
  });
}

describe('MOSFET level 3 and level 9 (issue #715)', () => {
  it.each([3, 9] as const)(
    'LEVEL=%i matches the ngspice-47 drain sweep with body bias, NFS, VMAX, THETA, ETA, KAPPA, XJ and inverse mode',
    async level => {
      const result = await simulate(NMOS_DRAIN_SWEEP(level));
      // No internal nodes: the bias is fixed by sources, so only rounding separates the engines.
      expectSweep(result.dcSweep!.current('VD'), NMOS_DRAIN_SWEEP_REFERENCE, `LEVEL=${level} I(VD)`);
    },
  );

  it('matches the ngspice-47 PMOS gate sweep with WD/XL/XW, JS area junctions, TPG=-1 and the alpha CLM path', async () => {
    const result = await simulate(`MOS3 PMOS gate sweep
VD d 0 DC -3
VG g 0 DC 0
VB b 0 DC 0.4
M1 d g 0 b P3 W=30U L=3U AD=60P AS=60P
.MODEL P3 PMOS (LEVEL=3 VTO=-0.9 GAMMA=0.4 PHI=0.65 NSUB=2E16 TOX=30N UO=250 XJ=0.25U LD=0.1U THETA=0.05
+ ETA=0.1 KAPPA=1.2 JS=1E-4 TPG=-1 WD=0.1U XL=0.05U XW=-0.05U)
.DC VG 0 -4 -0.2
.END`);
    expectSweep(result.dcSweep!.current('VD'), [
      3.405999996449184e-12, 3.405999996449184e-12, 3.405999996449184e-12, 3.405999996449184e-12,
      3.405999996449184e-12, 3.673076021469309e-07, 9.928199101583614e-06, 3.199524738055192e-05,
      6.598192277961665e-05, 1.113147016400118e-04, 1.674306072025926e-04, 2.337743649147811e-04,
      3.097949866794483e-04, 3.949414996514339e-04, 4.886573664632638e-04, 5.903728427873801e-04,
      6.994939516494203e-04, 8.153856158300142e-04, 9.373440106497182e-04, 1.064547210975840e-03,
      1.195956601038062e-03,
    ], 'I(VD)');
  });

  it('uses the mos3load.c cubic reverse bulk-junction tail and RD/RS series resistances scaled by M', async () => {
    const result = await simulate(`MOS3 bulk junction sweep
VD d 0 DC 0.2
VG g 0 DC 0
VB b 0 DC 0
M1 d g 0 b N3 W=10U L=2U M=3
.MODEL N3 NMOS (LEVEL=3 VTO=0.8 KP=50U IS=1E-9 RD=50 RS=30)
.DC VB -0.4 0.3 0.05
.END`);
    // The prime nodes behind RD/RS are Newton unknowns, so agreement is
    // bounded by the convergence tolerances rather than rounding.
    expectSweep(result.dcSweep!.current('VB'), [
      5.999718235356849e-09, 5.998996983329682e-09, 5.997657286487278e-09, 5.995468270053661e-09,
      5.990787095525380e-09, 5.978196710442894e-09, 5.928034847043216e-09, 5.561745676515482e-09,
      2.991477415586170e-09, -1.47535601837200e-08, -1.37349521990607e-07, -9.84322424987270e-07,
      -6.82272896981457e-06, -4.64665209513615e-05, -2.92119637128571e-04,
    ], 'I(VB)', 2e-4);
    // A linear gmin tail (mos2load.c) would give 6.001e-9 A at VB = -0.4 V.
    expect(result.dcSweep!.current('VB')[0]).toBeLessThan(6e-9);
  });

  it('matches ngspice-47 through RD/RS series resistances in saturation', async () => {
    const result = await simulate(`MOS3 series resistance drain sweep
VD d 0 DC 0
VG g 0 DC 3
M1 d g 0 0 N3 W=10U L=2U M=2
.MODEL N3 NMOS (LEVEL=3 VTO=0.8 KP=50U GAMMA=0.5 NSUB=1E16 TOX=25N VMAX=1.5E5 THETA=0.08 ETA=0.3 KAPPA=0.6 RD=50 RS=30)
.DC VD 0 5 0.25
.END`);
    expectSweep(result.dcSweep!.current('VD'), [
      -8.79740014049699e-31, -2.03673450234582e-04, -3.66788780888978e-04, -4.93335568386953e-04,
      -5.86844168335574e-04, -6.50440433625478e-04, -6.86895924428074e-04, -7.00404082645424e-04,
      -7.09469177123481e-04, -7.18508928921113e-04, -7.27534094890657e-04, -7.36553422685001e-04,
      -7.45573365174678e-04, -7.54599644934297e-04, -7.63637374977179e-04, -7.72691156879857e-04,
      -7.81765159586136e-04, -7.90863183660351e-04, -7.99988714137488e-04, -8.09144964345697e-04,
      -8.18334912514700e-04,
    ], 'I(VD)', 1e-4);
  });

  it.each([3, 9] as const)(
    'LEVEL=%i CMOS inverter transient (Meyer and junction charges, RSH*NRD, RD/RS) tracks ngspice-47',
    async level => {
      const result = await simulate(CMOS_INVERTER(level));
      const { time } = result.transient!;
      const out = result.transient!.voltage('out');
      for (const [at, expected] of CMOS_INVERTER_REFERENCE) {
        // The 0.05 ns step bound keeps both engines on nearly the same grid;
        // the worst difference over the whole run is 0.2 mV on 5 V.
        expect(Math.abs(interpolate(time, out, at) - expected), `v(out) at ${at}`).toBeLessThan(1e-3);
      }
    },
  );

  it('rejects a MOS9 effective length below 1 um like mos9temp.c, while MOS3 accepts it', async () => {
    const deck = (level: 3 | 9) => `MOS${level} short channel
VD d 0 DC 1
VG g 0 DC 2
M1 d g 0 0 NX W=10U L=1.5U
.MODEL NX NMOS (LEVEL=${level} VTO=0.8 KP=50U LD=0.3U)
.OP
.END`;
    await expect(simulate(deck(9))).rejects.toThrow(InvalidCircuitError);
    await expect(simulate(deck(9))).rejects.toThrow(/M1: effective channel length less than zero/);
    const result = await simulate(deck(3));
    expect(result.dc!.current('VD')).toBeCloseTo(-3.88888889898889e-04, 15);
  });

  it('rejects NSUB below the intrinsic density at TNOM like mos3temp.c', async () => {
    await expect(simulate(`nsub
VD d 0 DC 1
M1 d d 0 0 NX
.MODEL NX NMOS (LEVEL=3 NSUB=1E9)
.OP
.END`)).rejects.toThrow(/MOSFET level 3 model 'NX': Nsub < Ni/);
  });
});

/**
 * Corpus-g (#711) decks of the "MOSFET LEVEL=3 (MOS3) and LEVEL=9 (MOS9)" gap
 * bucket, byte-identical Xyce Regression Suite fixtures (GPL-3.0-or-later)
 * committed under benchmarks/corpus/corpus-g. The checks run once the fixtures
 * are on disk.
 */
const CORPUS_G = new URL('../../../../benchmarks/corpus/corpus-g/fixtures/', import.meta.url);
const fixture = (path: string) => new URL(path, CORPUS_G);
const hasCorpusG = existsSync(fixture('NMOS3_DC/mos3_dc.cir'));

describe.skipIf(!hasCorpusG)('corpus-g MOS3/MOS9 decks vs ngspice-47 (issue #715)', () => {
  it('NMOS3_DC/mos3_dc.cir: drain current over VDS x VGS', async () => {
    const result = await simulate(readFileSync(fixture('NMOS3_DC/mos3_dc.cir'), 'utf8'));
    const current = result.dcSweep!.current('VMON');
    const reference: ReadonlyArray<readonly [number, number, number]> = [
      [1, 0.5, 1.974463502544258e-06], [1, 1, 2.107906692097962e-06], [1, 2, 2.388746386796424e-06],
      [1, 3, 2.688535312728251e-06], [1, 6, 3.706400955273194e-06],
      [2, 0.5, 1.558718182082504e-05], [2, 1, 2.017706025024842e-05], [2, 2, 2.112067374803084e-05],
      [2, 3, 2.210024681695639e-05], [2, 6, 2.527105100808192e-05],
      [3, 0.5, 2.873781409836270e-05], [3, 1, 4.569850784797285e-05], [3, 2, 5.348035133944368e-05],
      [3, 3, 5.534316373293314e-05], [3, 6, 6.135373896067490e-05],
      [4, 0.5, 4.067179519161002e-05], [4, 1, 6.900346290223452e-05], [4, 2, 9.480692621415791e-05],
      [4, 3, 9.812143771714071e-05], [4, 6, 1.076174804438472e-04],
    ];
    expect(current.length).toBe(4 * 601);
    for (const [vgs, vds, expected] of reference) {
      const index = (vgs - 1) * 601 + Math.round(vds / 0.01);
      expect(Math.abs(current[index] - expected), `VGS=${vgs} VDS=${vds}`).toBeLessThan(1e-9 * Math.abs(expected));
    }
  });

  it('OP/comparator_op.cir: MOS9 default-model operating point', async () => {
    const result = await simulate(readFileSync(fixture('OP/comparator_op.cir'), 'utf8'));
    const op = result.dc!;
    const reference: Record<string, number> = {
      2: 4.999196987936132, 3: 1.199358970399644, 8: 1.849698860336930, 9: 3.224117007497216e-08,
      Anot: 4.999999983879425, AorBnot: 4.999999903276548, Bnot: 4.999999983879425,
      Lnot: 4.999999709860645, Qnot: 3.027756440402258,
    };
    for (const [node, expected] of Object.entries(reference)) {
      // Node 2 sits between two off devices and is only Newton-converged (7e-7 V apart).
      expect(Math.abs(op.voltage(node) - expected), `v(${node})`).toBeLessThan(1e-5);
    }
    expect(op.current('Vdd')).toBeCloseTo(-2.84904344686709e-04, 12);
  });

  it('COMPARATOR/comparator.cir: MOS9 transient outputs', async () => {
    const result = await simulate(readFileSync(fixture('COMPARATOR/comparator.cir'), 'utf8'));
    const { time } = result.transient!;
    const v9 = result.transient!.voltage('9');
    const v8 = result.transient!.voltage('8');
    const reference: ReadonlyArray<readonly [number, number, number]> = [
      [0, 3.224117e-08, 1.849699], [5e-9, 3.224117e-08, 1.849699], [12e-9, 4.772887, 6.100647e-02],
      [20e-9, 4.776285, 5.453801e-02], [35e-9, -1.914922e-02, 1.849989], [45e-9, 4.715347, 5.497401e-02],
      [55e-9, 4.718100, 5.495343e-02], [60e-9, -2.540997e-02, 1.850065],
    ];
    for (const [at, expected9, expected8] of reference) {
      expect(Math.abs(interpolate(time, v9, at) - expected9), `v(9) at ${at}`).toBeLessThan(2e-3);
      expect(Math.abs(interpolate(time, v8, at) - expected8), `v(8) at ${at}`).toBeLessThan(2e-3);
    }
  });

  it('ACtests/bsim3/gain-stage.cir: MOS9 small-signal gain', async () => {
    const result = await simulate(readFileSync(fixture('ACtests/bsim3/gain-stage.cir'), 'utf8'));
    const v3 = result.ac!.voltage('3');
    const reference: ReadonlyArray<readonly [number, number, number]> = [
      [0, -2.98351616834e-01, 1.726202178891e-08], [40, -2.98351516960e-01, 1.726201601037e-04],
      [60, -2.97356203321e-01, 1.720442917404e-02], [70, -2.23525448785e-01, 1.293273087719e-01],
    ];
    for (const [index, real, imaginary] of reference) {
      const { magnitude, phase } = v3[index];
      const radians = phase * Math.PI / 180;
      expect(Math.abs(magnitude * Math.cos(radians) - real), `Re v(3) #${index}`).toBeLessThan(1e-8);
      expect(Math.abs(magnitude * Math.sin(radians) - imaginary), `Im v(3) #${index}`).toBeLessThan(1e-8);
    }
  });

  it.each([
    ['MOS13_IC/invert42_mos3.cir', 'VOUT', 4.782500],
    ['SUBCKT/subckt_a0.cir', 'OUT', 4.806048],
  ])('%s: MOS3 initial operating point', async (path, node, expected) => {
    const result = await simulate(readFileSync(fixture(path), 'utf8'));
    expect(result.transient!.voltage(node)[0]).toBeCloseTo(expected, 5);
  }, 60_000);
});
