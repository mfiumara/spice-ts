import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import { InvalidCircuitError } from '../errors.js';

/**
 * Issue #506: VDMOS power MOSFET (ngspice-47 src/spicelib/devices/vdmos).
 * Every reference value below is ngspice-47 output (`print`, numdgt=15, or
 * `meas` for the transient) on the identical netlist.
 */

/** Relative check with an absolute floor for values near zero. */
function expectClose(actual: number, expected: number, rel: number, abs = 1e-12): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(rel * Math.abs(expected) + abs);
}

describe('VDMOS model card (issue #506)', () => {
  it('parses a pchan card with manufacturer, Vds, Ron and Qg annotations as VDMOSP', () => {
    const circuit = parse(`card
m1 d g s IRF7233
.model IRF7233 VDMOS(pchan Rg=3 Rd=8m Rs=6m Vto=-1 Kp=70 Cgdmax=2n Cgdmin=.25n Cgs=3.3n Cjo=.98n Is=98p Rb=10m mfg=International_Rectifier Vds=-12 Ron=20m Qg=49n)
vd d 0 -5
vg g 0 -5
vs s 0 0
.op
.end
`);
    const model = circuit.compile().models.get('IRF7233')!;
    expect(model.type).toBe('VDMOSP');
    expect(model.params).toMatchObject({ RG: 3, VTO: -1, KP: 70, CJO: 0.98e-9, RB: 0.01 });
    expect(model.params).not.toHaveProperty('VDS');
    expect(model.params).not.toHaveProperty('RON');
    expect(model.params).not.toHaveProperty('QG');
    expect(model.params).not.toHaveProperty('MFG');
  });

  it('defaults a card without pchan to VDMOSN', () => {
    const circuit = parse(`card
m1 d g s n1
.model n1 vdmos cgdmin=0.2p cgdmax=1p a=2 cgs=0.5p rg=5k rb=1e9 cjo=0.1p
vd d 0 1
vg g 0 1
vs s 0 0
.op
.end
`);
    expect(circuit.compile().models.get('n1')!.type).toBe('VDMOSN');
  });
});

describe('VDMOS DC (issue #506)', () => {
  it('reproduces the issue #509 pchan operating point: vd#branch = 14.44 A, body diode node -1.0005e-5 V', async () => {
    const result = await simulate(`VDMOS p channel output
m1 d g s p1
.model p1 vdmos pchan vto=-1.2 is=10n kp=2 bv=-12 rb=1k
vd d 0 -5
vg g 0 -5
vs s 0 0
.op
.end
`);
    const op = result.dc!;
    // ngspice-47: vd#branch = 1.444000001000e+01, vs#branch = -1.44400000100e+01,
    // m1#body_diode = -1.00049981349e-05.
    expectClose(op.current('vd'), 14.44000001, 1e-9);
    expectClose(op.current('vs'), -14.44000001, 1e-9);
    expectClose(op.voltage('m1.body_diode'), -1.00049981349e-5, 1e-6);
  });

  it('matches the nchan SQ7002K output curves for MTRIODE=1 and MTRIODE=2 (lambda, RS, RDS, body diode)', async () => {
    const result = await simulate(`t2 nchan SQ7002K mtriode 1 and 2
m1 d g s SQ7002K
m2 d g s2 SQ7002K_2
.MODEL SQ7002K VDMOS(KP=0.46 RS=0.8751 RG=150 VTO=1.8 rds=50Meg LAMBDA=60m CGDMAX=20p CGDMIN=2p CGS=17p TT=500n a=0.47 IS=3.25n N=1.744 RB=0.118608 m=0.348 Vj=0.23 Cjo=14pF mtriode=1 Vds=60 Ron=1 Qg=0.9n mfg=VISHAY)
.MODEL SQ7002K_2 VDMOS(KP=0.46 RS=0.8751 RG=150 VTO=1.8 rds=50Meg LAMBDA=60m CGDMAX=20p CGDMIN=2p CGS=17p TT=500n a=0.47 IS=3.25n N=1.744 RB=0.118608 m=0.348 Vj=0.23 Cjo=14pF mtriode=2 Vds=60 Ron=1 Qg=0.9n mfg=VISHAY)
vd d 0 1
vg g 0 1
vs s 0 0
vs2 s2 0 0
.dc vd -1 7 1 vg 3 7 2
.options reltol=1e-9 abstol=1e-15 vntol=1e-12
.end
`);
    const sweep = result.dcSweep!;
    // ngspice-47 i(vs), i(vs2) for vg = 3, 5, 7 (outer) and vd = -1..7 (inner), both
    // engines at reltol=1e-9 so the comparison measures the model, not Newton tolerance.
    const vs = [
      -1.48593737038850, -2.07454944697568e-29, 2.305374924656333e-01, 2.466292169210348e-01,
      2.557101047984539e-01, 2.645285134389430e-01, 2.730978187324992e-01, 2.814304230250759e-01,
      2.895378466075477e-01,
      -1.69750963483364, -1.38902408657197e-18, 5.755725410643024e-01, 9.870928953876238e-01,
      1.188714639209813, 1.224761001983175, 1.254446709688712, 1.282935280418328, 1.310308326675031,
      -1.80454441033449, -7.20361764048808e-22, 7.346584323896304e-01, 1.377484711733286,
      1.902389785109366, 2.278172253901564, 2.471714378476773, 2.524800151716597, 2.571472827758955,
    ];
    const vs2 = [
      -1.66512471334868, -1.20445819388769e-30, 2.372713966565542e-01, 2.466292169153874e-01,
      2.557101048072856e-01, 2.645285134389432e-01, 2.730978187324992e-01, 2.814304230250759e-01,
      2.895378466075477e-01,
      -1.86532586740147, -6.00757979701350e-19, 7.359225660634958e-01, 1.155945484773715,
      1.193787727791032, 1.224761001983433, 1.254446709691896, 1.282935280418328, 1.310308326675031,
      -1.94436299254836, -7.62115979235214e-22, 8.846123557366915e-01, 1.661139625758148,
      2.238596325940382, 2.424748585362325, 2.475951514681467, 2.524800151716625, 2.571472827761164,
    ];
    const ours = sweep.current('vs');
    const ours2 = sweep.current('vs2');
    expect(ours.length).toBe(vs.length);
    vs.forEach((expected, index) => expectClose(ours[index], expected, 1e-5, 1e-12));
    vs2.forEach((expected, index) => expectClose(ours2[index], expected, 1e-5, 1e-12));
  });

  it('matches the pchan IRF7233 transfer curve with MTRIODE=2 and KSUBTHRES weak inversion', async () => {
    const result = await simulate(`t3 pchan IRF7233 mtriode=2 ksubthres
m3 d g s3 IRF7233_3
.model IRF7233_3 VDMOS(pchan mtriode=2 Rg=3 Rd=8m Rs=6m Vto=-1 Kp=70 Cgdmax=2n Cgdmin=.25n Cgs=3.3n Cjo=.98n Is=98p Rb=10m mfg=International_Rectifier Vds=-12 Ron=20m Qg=49n ksubthres=0.1)
vd d 0 -5
vg g 0 -5
vs3 s3 0 0
.dc vg 0 -4 -0.5
.options reltol=1e-9 abstol=1e-15 vntol=1e-12
.end
`);
    const reference = [
      -8.24375999236740e-10, -1.57836400763046e-05, -1.65760343701391e-01, -7.31458196854552,
      -2.52128086242466e+01, -5.02660515686481e+01, -8.05275594646432e+01, -1.14808854699672e+02,
      -1.52314958732594e+02,
    ];
    const ours = result.dcSweep!.current('vs3');
    reference.forEach((expected, index) => expectClose(ours[index], expected, 1e-6));
  });

  it('matches the nchan body diode forward conduction and BV/IBV/NBV breakdown through RB', async () => {
    const result = await simulate(`t7 breakdown nchan
vd d 0 DC 1
vg g 0 DC 0
m1 d g 0 n1
.model n1 vdmos vto=2 kp=1 bv=20 ibv=1u nbv=2 is=1e-12 rds=1meg rb=10
.dc vd -1 25 2
.options reltol=1e-9 abstol=1e-15 vntol=1e-12
.end
`);
    const reference = [
      3.705692892905527e-02, -1.00000199997676e-06, -3.00000399999916e-06, -5.00000599999983e-06,
      -7.00000799999995e-06, -9.00000999999999e-06, -1.10000120000000e-05, -1.30000140000000e-05,
      -1.50000160000000e-05, -1.70000180000000e-05, -1.90000200000000e-05, -4.46360802473712e-02,
      -2.36021172097517e-01, -4.32885287161570e-01,
    ];
    const ours = result.dcSweep!.current('vd');
    reference.forEach((expected, index) => expectClose(ours[index], expected, 1e-6));
  });

  it('applies the VDMOS temperature model (TCVTH, MU, TRD1, IS/EG/XTI) at instance TEMP=75', async () => {
    const result = await simulate(`t8 temperature
vd d 0 DC 3
vg g 0 DC 5
m1 d g 0 n1 temp=75
.model n1 vdmos vto=2 kp=3 tcvth=-3m mu=-1.2 rd=0.5 trd1=4m rs=0.1 rb=1 is=1e-12 eg=1.11 xti=3 cjo=1p
.dc vd -1 3 1
.options reltol=1e-9 abstol=1e-15 vntol=1e-12
.end
`);
    const reference = [
      1.616749475972461, -1.20534222440201e-20, -1.20284184973068, -2.37609613686782, -3.51133828837118,
    ];
    const ours = result.dcSweep!.current('vd');
    reference.forEach((expected, index) => expectClose(ours[index], expected, 1e-6));
  });

  it('uses DTEMP and warns when an instance gives both TEMP and DTEMP, like ngspice-47 vdmosset.c (issue #566)', async () => {
    const result = await simulate(`temp dtemp
m1 d g 0 nm1 temp=100 dtemp=10
.model nm1 vdmos vto=2 kp=10 tcvth=-5m mu=-1.5
vd d 0 5
vg g 0 3
.op
.end
`);
    // ngspice-47: vd#branch = -5.24808334682163 (circuit 27 C + DTEMP 10 C); TEMP=100 gives -6.72075.
    expectClose(result.dc!.current('vd'), -5.24808334682163, 1e-6);
    expect(result.warnings).toContainEqual({
      type: 'model',
      message: 'm1: temp and dtemp instance parameter given - using dtemp',
    });
  });
});

describe('VDMOS capacitances (issue #506)', () => {
  it('matches the ngspice-47 AC gate (CGS + DevCapVDMOS tanh branch) and body diode (CJO + TT) admittances, nchan', async () => {
    const result = await simulate(`t5 ac nchan
vd d 0 DC 0
vg g 0 DC 1 AC 1
m1 d g 0 n1
vd2 d2 0 DC -0.5 AC 1
m2 d2 0 0 n2
.model n1 vdmos cgdmin=0.2p cgdmax=1p a=2 cgs=0.5p cjo=0.1p vto=3
.model n2 vdmos cgdmin=0.2p cgdmax=1p a=2 cgs=0.5p cjo=0.1p vto=3 tt=20n is=1e-12 n=1.5 vj=0.6 m=0.4
.ac lin 1 1meg 1meg
.end
`);
    const ac = result.ac!;
    const rectangular = (source: string) => {
      const { magnitude, phase } = ac.current(source)[0];
      return { re: magnitude * Math.cos(phase * Math.PI / 180), im: magnitude * Math.sin(phase * Math.PI / 180) };
    };
    // vgd = +1 V: i(vg) = -j w (CGS + Cgd(1)); vd2 forward-biases the body diode by 0.5 V.
    expectClose(rectangular('vg').im, -9.35444290451446e-06, 1e-6);
    expectClose(rectangular('vd').im, 6.212850250924667e-06, 1e-6);
    expectClose(rectangular('vd2').re, -1.01895418145913e-05, 1e-6);
    expectClose(rectangular('vd2').im, -8.14765480536928e-06, 1e-6);
  });

  it('matches the ngspice-47 AC gate admittance on the atan branch (vgd < 0), pchan', async () => {
    const result = await simulate(`t6 ac pchan
vd d 0 DC -2
vg g 0 DC 0 AC 1
m1 d g 0 p1
.model p1 vdmos cgdmin=0.2p cgdmax=1p a=2 cgs=0.5p cjo=0.1p pchan
.ac lin 1 1meg 1meg
.end
`);
    const imag = (source: string) => {
      const { magnitude, phase } = result.ac!.current(source)[0];
      return magnitude * Math.sin(phase * Math.PI / 180);
    };
    expectClose(imag('vg'), -4.87722412487077e-06, 1e-6);
    expectClose(imag('vd'), 1.735631471280977e-06, 1e-6);
  });

  it('matches the ngspice-47 inverter transient (gate charge through RG, nonlinear CGD) within 1%', async () => {
    const result = await simulate(`t9 transient inverter
vdd 1 0 5
vin 2 0 PULSE(0 5 10n 10n 10n 140n 300n)
mp 3 2 1 p1
mn 3 2 0 n1
.model n1 vdmos cgdmin=0.2p cgdmax=1p a=2 cgs=0.5p rg=5k rb=1e9 cjo=0.1p
.model p1 vdmos cgdmin=0.2p cgdmax=1p a=2 cgs=0.5p rg=5k rb=1e9 cjo=0.1p pchan
.tran 1n 60n 0 0.01n
.end
`);
    const tran = result.transient!;
    const time = tran.time;
    const at = (values: ArrayLike<number>, t: number) => {
      let index = 1;
      while (index < time.length - 1 && time[index] < t) index++;
      const fraction = (t - time[index - 1]) / (time[index] - time[index - 1]);
      return values[index - 1] + fraction * (values[index] - values[index - 1]);
    };
    const out = tran.voltage('3');
    const input = tran.current('vin');
    // ngspice-47 `meas tran ... find ... at=` (6 significant digits); 1% of the 5 V swing.
    for (const [t, expected] of [[15e-9, 5.00003], [21e-9, 3.63368], [24e-9, 1.91472], [30e-9, 3.60699e-5]] as const) {
      expect(Math.abs(at(out, t) - expected)).toBeLessThan(0.05);
    }
    // Gate charging current through RG: 1% of its value.
    expectClose(at(input, 15e-9), -6.38337e-4, 1e-2);
    expectClose(at(input, 21e-9), -1.01623e-3, 1e-2);
  });
});

describe('VDMOS unsupported features (issue #506)', () => {
  it('rejects a VDMOS instance with more than three terminals (the thermal form)', async () => {
    await expect(simulate(`thermal
m1 d g s tj n1
.model n1 vdmos rthjc=1
vd d 0 1
vg g 0 1
vs s 0 0
.op
.end
`)).rejects.toThrow(/only the 3-terminal/);
  });

  it('rejects soft reverse recovery (VP with TT) instead of ignoring it', async () => {
    await expect(simulate(`softrr
m1 d g 0 n1
.model n1 vdmos tt=10n vp=0.5
vd d 0 1
vg g 0 1
.op
.end
`)).rejects.toThrow(InvalidCircuitError);
  });
});
