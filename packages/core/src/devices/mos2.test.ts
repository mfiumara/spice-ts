import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidCircuitError } from '../errors.js';
import { simulate } from '../simulate.js';

/**
 * Issue #565: MOSFET level 2 (ngspice-47 mos2, Grove-Frohman) used to be
 * rejected with UnsupportedModelLevelError (#530), and before that ran the
 * Level-1 equations (mosamp2.cir v(5) 5.30 V off ngspice-47). Every reference
 * below comes from ngspice-47 (`wrdata`/`print`, numdgt=15) on the identical
 * deck.
 */
const MOSAMP_MODEL = '.MODEL M NMOS(NSUB=2.2E15 UO=575 UCRIT=49K UEXP=0.1 TOX=0.11U XJ=2.95U LEVEL=2'
  + ' CGSO=1.5N CGDO=1.5N CBD=4.5F CBS=4.5F LD=2.4485U NSS=3.2E10 KP=2E-5 PHI=0.6)';

const MOSAMP = readFileSync(
  new URL('../../../../benchmarks/corpus/ngspice/fixtures/tests/general/mosamp.cir', import.meta.url),
  'utf8',
);

const CMOS_MODELS = [
  '.MODEL N NMOS LEVEL=2 VTO=0.7 KP=60U GAMMA=0.45 PHI=0.7 NSUB=1E16 TOX=25N UO=600 UCRIT=1E4 UEXP=0.1'
    + ' XJ=0.2U LD=0.15U CJ=4E-4 CJSW=3E-10 CGSO=2E-10 CGDO=2E-10 CGBO=1E-10',
  '.MODEL P PMOS LEVEL=2 VTO=-0.8 KP=25U GAMMA=0.5 PHI=0.65 NSUB=2E16 TOX=25N UO=250 VMAX=5E4 NEFF=2'
    + ' XJ=0.2U LD=0.15U CJ=5E-4 CJSW=3E-10 CGSO=2E-10 CGDO=2E-10',
].join('\n');

const CMOS_INVERTER = (source: string, analysis: string, options = '') => `MOS2 CMOS inverter
VDD vdd 0 DC 5
VIN in 0 ${source}
MP out in vdd vdd P W=20U L=2U AD=40P AS=40P PD=24U PS=24U
MN out in 0 0 N W=10U L=2U AD=20P AS=20P PD=14U PS=14U
${analysis.startsWith('.TRAN') ? 'CL out 0 50F\n' : ''}${CMOS_MODELS}
${options}
${analysis}
.END`;

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

function expectSweep(actual: ArrayLike<number>, reference: readonly number[], label: string): void {
  expect(actual.length).toBe(reference.length);
  reference.forEach((expected, index) => {
    // Bias is fixed by sources, so the comparison is limited by rounding, not
    // Newton tolerance. 1e-14 A absorbs one ngspice subthreshold point whose
    // value depends on stale MOS2gm state (mos2load.c `goto doneval`).
    expect(Math.abs(actual[index] - expected), `${label} point ${index}`)
      .toBeLessThan(1e-14 + 1e-9 * Math.abs(expected));
  });
}

describe('MOSFET level 2 (issue #565)', () => {
  it('matches ngspice-47 drain current of the mosamp2 model with body bias and normal/inverse modes', async () => {
    const result = await simulate(`MOS2 mosamp model drain sweep
VD d 0 DC 0
VG g 0 DC 3
VB b 0 DC -2
M1 d g 0 b M W=88.9U L=25.4U
${MOSAMP_MODEL}
.DC VD -1.5 10 0.5
.END`);
    expectSweep(result.dcSweep!.current('VD'), [
      3.742325196543883e-04, 2.271131843081642e-04, 1.025207944728960e-04, -2.010000000000000e-12,
      -7.833238396453109e-05, -1.302873055311391e-04, -1.561041822221110e-04, -1.596478750383109e-04,
      -1.603961084256811e-04, -1.611443221165682e-04, -1.618896838171098e-04, -1.626290777600727e-04,
      -1.633597052426752e-04, -1.640793773221321e-04, -1.647865773862068e-04, -1.654803932302946e-04,
      -1.661603973300273e-04, -1.668265221963418e-04, -1.674789523412992e-04, -1.681180391543499e-04,
      -1.687442376219115e-04, -1.693580611149828e-04, -1.699600500562261e-04, -1.705507507913822e-04,
    ], 'I(VD)');
  });

  it('matches ngspice-47 PMOS gate sweep with NFS subthreshold, VMAX, NEFF, DELTA and JS/CJ junctions', async () => {
    const result = await simulate(`MOS2 PMOS gate sweep
VD d 0 DC -3
VG g 0 DC 0
VB b 0 DC 0.5
M1 d g 0 b P W=20U L=4U AD=40P AS=40P PD=24U PS=24U
.MODEL P PMOS LEVEL=2 VTO=-0.8 KP=25U GAMMA=0.6 PHI=0.65 NSUB=3E16 TOX=40N UO=250 UCRIT=1E4 UEXP=0.2 VMAX=5E4 NEFF=2 XJ=0.3U DELTA=1.2 NFS=1E11 LD=0.3U JS=1E-4 CJ=3E-4 CJSW=2E-10
.DC VG 0 -5 -0.25
.END`);
    expectSweep(result.dcSweep!.current('VD'), [
      3.504000594447208e-12, 3.504004591143339e-12, 3.891988684673660e-12, 3.169566489220988e-10,
      3.723944065161645e-07, 5.609253546773435e-06, 1.542517062077967e-05, 2.937421205943348e-05,
      4.715338305640092e-05, 6.854353470980739e-05, 9.336707303631514e-05, 1.214695729549277e-04,
      1.527097302382453e-04, 1.869526547651928e-04, 2.240642429970826e-04, 2.639050156732676e-04,
      3.063213131745364e-04, 3.511293624344972e-04, 3.980789886603030e-04, 4.467417679995494e-04,
      4.958901657656906e-04,
    ], 'I(VD)');
  });

  it('matches ngspice-47 with explicit LAMBDA and no NSUB (no depletion-width channel shortening)', async () => {
    const result = await simulate(`MOS2 LAMBDA drain sweep
VD d 0 DC 0
VG g 0 DC 2.5
M1 d g 0 0 N W=10U L=2U
.MODEL N NMOS LEVEL=2 VTO=0.7 KP=50U GAMMA=0.4 PHI=0.7 LAMBDA=0.03 TOX=25N
.DC VD -0.5 5 0.25
.END`);
    expectSweep(result.dcSweep!.current('VD'), [
      2.813270433631657e-04, 1.269874114769382e-04, 0, -1.036961591696409e-04,
      -1.898391139084440e-04, -2.583928965485629e-04, -3.092180931478738e-04, -3.421080712021853e-04,
      -3.568076625189655e-04, -3.598310054289383e-04, -3.627019977294883e-04, -3.656191722077952e-04,
      -3.685836522141286e-04, -3.715965978295576e-04, -3.746592073795813e-04, -3.777727190232345e-04,
      -3.809384124220883e-04, -3.841576104938806e-04, -3.874316812558170e-04, -3.907620397629444e-04,
      -3.941501501473630e-04, -3.975975277644536e-04, -4.011057414527282e-04,
    ], 'I(VD)');
  });

  it('matches ngspice-47 NSUB-derived VTO/GAMMA/PHI with VMAX velocity saturation and channel shortening', async () => {
    const result = await simulate(`MOS2 NSUB VMAX drain sweep
VD d 0 DC 0
VG g 0 DC 3
VB b 0 DC -1
M1 d g 0 b N W=10U L=3U
.MODEL N NMOS LEVEL=2 NSUB=1E16 TOX=30N UO=600 VMAX=6E4 NEFF=1.5 XJ=0.25U UCRIT=2E4 UEXP=0.15 LD=0.2U
.DC VD -1 6 0.25
.END`);
    expectSweep(result.dcSweep!.current('VD'), [
      5.405255630294085e-04, 3.915236814956513e-04, 2.518444342451110e-04, 1.213770916128777e-04,
      -1.010000000000000e-12, -1.104782353067430e-04, -2.082372835847408e-04, -2.933825079749152e-04,
      -3.660028675301100e-04, -4.261747660096213e-04, -4.739647455813031e-04, -5.081264070563212e-04,
      -5.245050266223459e-04, -5.363835167615965e-04, -5.464664966905330e-04, -5.555139945110191e-04,
      -5.638697315981597e-04, -5.717239806893593e-04, -5.791951933234804e-04, -5.863630740543510e-04,
      -5.932843234911598e-04, -6.000010036693132e-04, -6.065453565427405e-04, -6.129427567764336e-04,
      -6.192136124360183e-04, -6.253746384512601e-04, -6.314397387256187e-04, -6.374206345949766e-04,
      -6.433273234937085e-04,
    ], 'I(VD)');
  });

  it('matches the ngspice-47 CMOS inverter transfer curve at tight Newton tolerances', async () => {
    const result = await simulate(CMOS_INVERTER(
      'DC 2.2', '.DC VIN 0 5 0.25', '.OPTIONS RELTOL=1E-10 VNTOL=1E-14 ABSTOL=1E-18',
    ));
    const sweep = result.dcSweep!;
    // [VIN, V(OUT), I(VDD)] from ngspice-47 with the same .OPTIONS.
    const reference: Array<[number, number, number]> = [
      [0.75, 4.997049779475183, -3.022708981370248e-06],
      [1.5, 4.831077211758234, -1.306552403909605e-04],
      [2.0, 4.461057463003574, -3.017119749600902e-04],
      [2.25, 4.005275179308822, -4.040656541542639e-04],
      [2.5, 1.113577827332013, -4.240817466051883e-04],
      [3.0, 0.3545167115125162, -2.284898036685384e-04],
      [4.0, 1.035714878394981e-02, -9.830316651068648e-06],
      [4.5, 4.384920670056735e-03, -4.686689298876963e-06],
    ];
    for (const [vin, vout, ivdd] of reference) {
      const index = Array.from(sweep.sweepValues).findIndex(value => Math.abs(value - vin) < 1e-9);
      expect(index, `sweep point ${vin}`).toBeGreaterThanOrEqual(0);
      expect(Math.abs(sweep.voltage('out')[index] - vout), `V(OUT) at VIN=${vin}`).toBeLessThan(1e-9);
      expect(Math.abs(sweep.current('VDD')[index] - ivdd), `I(VDD) at VIN=${vin}`)
        .toBeLessThan(1e-15 + 1e-8 * Math.abs(ivdd));
    }
  });

  it('matches the ngspice-47 operating point of the 27-transistor mosamp amplifier', async () => {
    const deck = MOSAMP.replace(/^\.tran.*$/m, '.op').replace(/^\.(print|plot).*$/gm, '');
    const result = await simulate(deck);
    const op = result.dc!;
    const reference: Array<[string, number]> = [
      ['1', 9.645168254834473], ['2', -11.7353766631808], ['5', 9.463960706006286],
      ['6', 9.697758013328723], ['8', -2.31454073516232], ['10', -10.3376869237173],
      ['12', -8.89401033675703], ['14', -12.9655225352408], ['16', -11.0469552364823],
      ['20', 4.197147922759369e-02], ['66', 4.197147039812099e-02],
    ];
    for (const [node, expected] of reference) {
      expect(Math.abs(op.voltage(node) - expected), `v(${node})`).toBeLessThan(1e-9);
    }
    expect(Math.abs(op.current('vccp') - -5.21513749675125e-03)).toBeLessThan(1e-12);
  });

  it('matches the ngspice-47 CMOS inverter AC response through the Meyer and junction capacitances', async () => {
    const deck = CMOS_INVERTER('DC 2.3 AC 1', '.AC DEC 2 1K 100G', '.OPTIONS RELTOL=1E-10 VNTOL=1E-14 ABSTOL=1E-18')
      .replace('.AC DEC', 'CL out 0 50F\n.AC DEC');
    const result = await simulate(deck);
    const output = result.ac!.voltage('out');
    // [index, |v(out)|, phase deg] from ngspice-47 vm(out)/vp(out) on the same deck.
    const reference: Array<[number, number, number]> = [
      [0, 2.529623602102749, 179.99989594919603],
      [10, 2.492328757156609, 169.6934515512875],
      [12, 1.265255011769967, 115.46258859608854],
      [14, 0.1840919708976536, 55.40551878948686],
      [16, 0.114168591216239, 7.652868071053487],
    ];
    expect(output.length).toBe(17);
    for (const [index, magnitude, phase] of reference) {
      expect(Math.abs(output[index].magnitude - magnitude) / magnitude, `|v(out)| point ${index}`).toBeLessThan(1e-8);
      expect(Math.abs(output[index].phase - phase), `phase point ${index}`).toBeLessThan(1e-6);
    }
  });

  it('tracks the ngspice-47 CMOS inverter transient with Meyer and junction charges', async () => {
    const result = await simulate(CMOS_INVERTER('PULSE(0 5 2N 1N 1N 10N 24N)', '.TRAN 0.05N 30N'));
    const transient = result.transient!;
    const output = transient.voltage('out');
    // ngspice-47 v(out), default tolerances, interpolated. Settled points must
    // agree to Newton tolerance; switching-edge points carry timestep error in
    // both engines (largest measured gap 0.0157 V at 2.725 ns).
    const settled: Array<[number, number]> = [
      [1e-9, 4.999999995978185], [6e-9, 4.225681643880435e-09], [15e-9, 4.9999948525019615],
      [20e-9, 4.999999995978181], [29e-9, 4.226288993110364e-09],
    ];
    for (const [time, expected] of settled) {
      expect(Math.abs(interpolate(transient.time, output, time) - expected), `v(out) at ${time}`).toBeLessThan(1e-6);
    }
    const edges: Array<[number, number]> = [
      [3e-9, 0.2939759503995667], [14e-9, 4.548092890601259], [26.5e-9, 4.781240304875414],
    ];
    for (const [time, expected] of edges) {
      expect(Math.abs(interpolate(transient.time, output, time) - expected), `v(out) at ${time}`).toBeLessThan(0.01);
    }
  });

  it('rejects series resistances and reports the ngspice fatal model errors', async () => {
    const deck = (model: string) => `MOS2 errors
VD d 0 DC 1
VG g 0 DC 1
M1 d g 0 0 N W=10U L=2U
.MODEL N NMOS LEVEL=2 ${model}
.OP
.END`;
    await expect(simulate(deck('RD=10'))).rejects.toThrow(/level 2 .*RD is not supported/);
    await expect(simulate(deck('RSH=5'))).rejects.toThrow(/level 2 .*RSH is not supported/);
    await expect(simulate(deck('NSUB=1E9'))).rejects.toThrow(/Nsub < Ni/);
    await expect(simulate(deck('PHI=0'))).rejects.toBeInstanceOf(InvalidCircuitError);
  });
});
