import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('MOSFET Level 1', () => {
  it('NMOS inverter: high input → low output', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VIN 2 0 DC 5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 10k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    expect(vout).toBeLessThan(2);
  });

  it('NMOS inverter: low input → high output', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VIN 2 0 DC 0
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 10k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    expect(vout).toBeCloseTo(5, 0);
  });

  it('NMOS in cutoff has zero drain current', async () => {
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 0.5
      .model NMOD NMOS(VTO=1 KP=1e-4)
      RD 1 3 1k
      M1 3 2 0 NMOD
      .op
      .end
    `);

    const vout = result.dc!.voltage('3');
    expect(vout).toBeCloseTo(5, 1);
  });
});

describe('MOSFET W/L aspect ratio', () => {
  it('W/L=10 drives 10x more current than W/L=1 in saturation', async () => {
    // In saturation: ID = KP * (W/L) / 2 * (VGS - VTO)^2
    // KP=100u, VTO=0.5, VGS=2 → VGS-VTO=1.5, (VGS-VTO)^2=2.25
    // W/L=10 → ID = 100e-6 * 10 / 2 * 2.25 = 1125 µA → Vout = 5 - 1.125*1k = 3.875 V
    // W/L=1  → ID = 100e-6 *  1 / 2 * 2.25 = 112.5 µA → Vout = 5 - 0.1125*1k = 4.888 V
    const netlistWide = `
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD W=10u L=1u
      .op
      .end
    `;
    const netlistNarrow = `
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD W=1u L=1u
      .op
      .end
    `;
    const [rWide, rNarrow] = await Promise.all([
      simulate(netlistWide),
      simulate(netlistNarrow),
    ]);
    const vWide   = rWide.dc!.voltage('out');
    const vNarrow = rNarrow.dc!.voltage('out');

    // Wide transistor pulls output lower (more current)
    expect(vWide).toBeLessThan(vNarrow - 0.5);
    // Narrow: near supply rail; wide: significantly below it
    expect(vNarrow).toBeGreaterThan(4.5);
    expect(vWide).toBeLessThan(4.5);
  });

  it('4-terminal MOSFET uses model name, not body node, for parameters', async () => {
    // M1 d g s body NMOD — body="0" must NOT be used as model name.
    // With correct model NMOD (KP=100u, VTO=0.5, VGS=2, W/L=1):
    //   ID = 100e-6 / 2 * 1.5^2 = 112.5 µA → Vout = 5 - 0.1125 = 4.8875 V
    // With wrong model (default KP=2e-5, VTO=1, VGS=2, W/L=1):
    //   ID = 2e-5/2 * 1^2 = 10 µA → Vout ≈ 4.99 V
    // The gap of ~0.1 V is a reliable distinguisher.
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD
      .op
      .end
    `);
    const vout = result.dc!.voltage('out');
    // Correct model: ~4.888 V; wrong model (body as model): ~4.99 V
    expect(vout).toBeLessThan(4.9);
    expect(vout).toBeGreaterThan(4.8);
  });

  it('parses W= L= instance parameters from netlist', async () => {
    // Same circuit as W/L=10 test, but instance params written inline
    // M1 out 2 0 0 NMOD W=10u L=1u should give same result as programmatic W/L=10
    const result = await simulate(`
      VDD 1 0 DC 5
      VGS 2 0 DC 2
      .model NMOD NMOS(KP=100u VTO=0.5)
      RD 1 out 1k
      M1 out 2 0 0 NMOD W=10u L=1u
      .op
      .end
    `);
    const vout = result.dc!.voltage('out');
    // W/L=10: ID = 100e-6 * 10 / 2 * 1.5^2 ≈ 1125 µA → Vout ≈ 3.875 V
    expect(vout).toBeCloseTo(3.875, 0);
  });
});

// ngspice-47 mos1load.c stamps a bulk-source and a bulk-drain junction:
//   v <= -3*vt: g = GMIN,                 i = GMIN*v - Isat
//   otherwise:  g = Isat*exp(v/vt)/vt + GMIN, i = Isat*(exp(v/vt) - 1) + GMIN*v
// with Isat = IS (default 1e-14), or JS*AS / JS*AD when JS, AD and AS are all non-zero.
// Every reference value below is ngspice-47 batch output for the identical netlist.
describe('MOSFET level-1 bulk junction currents (issue #393)', () => {
  const relativeError = (actual: number, expected: number): number =>
    Math.abs(actual - expected) / Math.abs(expected);

  it('carries reverse bulk-drain leakage IS + GMIN*VBD in cutoff', async () => {
    const result = await simulate(`
      VDD 5 0 DC 18
      VGG 1 0 DC 1
      RS 2 0 500
      M1 5 1 2 2 NFET
      .MODEL NFET NMOS(LEVEL=1 KP=0.5M VTO=2)
      .op
      .end
    `);
    // ngspice-47: v(2) = 9.005000e-09, i(vdd) = -1.80100e-11
    expect(relativeError(result.dc!.voltage('2'), 9.005e-9)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('VDD'), -1.801e-11)).toBeLessThan(1e-6);
  });

  it('scales saturation current by JS*AD when JS, AD and AS are given', async () => {
    const result = await simulate(`
      VDD 5 0 DC 18
      VGG 1 0 DC 1
      RS 2 0 500
      M1 5 1 2 2 NFET AD=2e-10 AS=3e-10
      .MODEL NFET NMOS(LEVEL=1 KP=0.5M VTO=2 JS=1e-3)
      .op
      .end
    `);
    // ngspice-47: v(2) = 9.100000e-09, i(vdd) = -1.82000e-11
    expect(relativeError(result.dc!.voltage('2'), 9.1e-9)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('VDD'), -1.82e-11)).toBeLessThan(1e-6);
  });

  it('conducts forward-biased NMOS bulk junctions at the operating point', async () => {
    const result = await simulate(`
      VB b 0 DC 0.75
      RB b bi 100
      VD d 0 DC 0.2
      VG g 0 DC 0
      M1 d g 0 bi NFET
      .MODEL NFET NMOS(LEVEL=1 KP=0.5M VTO=2 IS=1e-14)
      .op
      .end
    `);
    // ngspice-47: v(bi) = 6.540399e-01, i(vb) = -9.59601e-04, i(vd) = 4.204617e-07
    expect(relativeError(result.dc!.voltage('bi'), 0.6540399)).toBeLessThan(1e-5);
    expect(relativeError(result.dc!.current('VB'), -9.59601e-4)).toBeLessThan(1e-4);
    expect(relativeError(result.dc!.current('VD'), 4.204617e-7)).toBeLessThan(1e-3);
  });

  it('applies PMOS polarity to the bulk junctions', async () => {
    const result = await simulate(`
      VB b 0 DC -0.75
      RB b bi 100
      VD d 0 DC -0.2
      VG g 0 DC 0
      M1 d g 0 bi PFET
      .MODEL PFET PMOS(LEVEL=1 KP=0.5M VTO=-2 IS=1e-14)
      .op
      .end
    `);
    // ngspice-47: v(bi) = -6.54040e-01, i(vb) = 9.596006e-04, i(vd) = -4.20462e-07
    expect(relativeError(result.dc!.voltage('bi'), -0.654040)).toBeLessThan(1e-5);
    expect(relativeError(result.dc!.current('VB'), 9.596006e-4)).toBeLessThan(1e-4);
    expect(relativeError(result.dc!.current('VD'), -4.20462e-7)).toBeLessThan(1e-3);
  });

  it('linearises the bulk junction conductances for AC analysis', async () => {
    const result = await simulate(`
      VB b 0 DC 0.75 AC 1
      RB b bi 100
      VD d 0 DC 0.2
      VG g 0 DC 0
      M1 d g 0 bi NFET
      .MODEL NFET NMOS(LEVEL=1 KP=0.5M VTO=2 IS=1e-14)
      .ac lin 1 1k 1k
      .end
    `);
    // ngspice-47: vm(bi) = 2.123121e-01, vp(bi) = 0
    const [point] = result.ac!.voltage('bi');
    expect(relativeError(point.magnitude, 0.2123121)).toBeLessThan(1e-3);
    expect(Math.abs(point.phase)).toBeLessThan(1e-9);
  });

  it('includes the bulk junction currents in transient analysis', async () => {
    const result = await simulate(`
      VB b 0 PWL(0 0 1u 0.75)
      RB b bi 100
      VD d 0 DC 0.2
      VG g 0 DC 0
      M1 d g 0 bi NFET
      .MODEL NFET NMOS(LEVEL=1 KP=0.5M VTO=2 IS=1e-14)
      .tran 10n 2u
      .end
    `);
    // ngspice-47: v(bi) = 6.54040e-01 at 2 us
    const transient = result.transient!;
    const bulk = transient.voltage('bi');
    expect(transient.time.at(-1)).toBeCloseTo(2e-6, 12);
    expect(relativeError(bulk.at(-1)!, 0.654040)).toBeLessThan(1e-4);
  });

  it('converges a heavily forward-biased body diode to the exact junction voltage', async () => {
    // Bulk tied to source, drain pulled 1.2 V below it through 0.1 ohm: ~3.3 A
    // flows in the bulk-drain junction, well above Vcrit. Limiting must not
    // leave the converged point on a linear extrapolation.
    const result = await simulate(`
      VS s 0 DC 0
      RS0 s si 0.1
      VD d 0 DC -1.2
      VG g 0 DC 0
      M1 d g si si NFET
      .MODEL NFET NMOS(LEVEL=1 KP=0.5M VTO=2 IS=1e-14)
      .op
      .end
    `);
    // ngspice-47: v(si) = -3.34948e-01, i(vd) = 3.349479e+00
    expect(relativeError(result.dc!.voltage('si'), -0.334948)).toBeLessThan(1e-4);
    expect(relativeError(result.dc!.current('VD'), 3.349479)).toBeLessThan(1e-4);
  });

  it('settles a near-threshold load node held only by junction leakage', async () => {
    // DC operating point of spice3f5 mosmem.cir (sources at t=0, no GAMMA/PHI/caps).
    // Node 8 is set by m11 bulk-drain leakage against m12 just above VTO; without
    // the junctions it floats (spice-ts previously returned 12.5 V).
    const result = await simulate(`
      vdd 9 0 dc 5
      vs 7 0 dc 2
      vw 1 0 dc 0
      vwb 2 0 dc 2
      m1 3 1 0 0 mod w=250u l=5u
      m2 4 2 0 0 mod w=250u l=5u
      m3 9 9 3 0 mod w=5u l=5u
      m4 9 9 4 0 mod w=5u l=5u
      m5 5 7 3 0 mod w=50u l=5u
      m6 6 7 4 0 mod w=50u l=5u
      m7 5 6 0 0 mod w=250u l=5u
      m8 6 5 0 0 mod w=250u l=5u
      m9 9 9 5 0 mod w=5u l=5u
      m10 9 9 6 0 mod w=5u l=5u
      m11 8 4 0 0 mod w=250u l=5u
      m12 9 9 8 0 mod w=5u l=5u
      .model mod nmos(vto=0.5 kp=1.0e-6 lambda=0.115 level=1)
      .op
      .end
    `);
    // ngspice-47: v(3)=4.494946 v(4)=0.182375 v(5)=4.494944 v(6)=0.0833688 v(8)=4.495873
    const reference = { 3: 4.494946, 4: 0.182375, 5: 4.494944, 6: 0.0833688, 8: 4.495873 };
    for (const [node, expected] of Object.entries(reference)) {
      expect(relativeError(result.dc!.voltage(node), expected)).toBeLessThan(1e-3);
    }
  });
});

describe('MOSFET AC small-signal linearization', () => {
  it('matches ngspice for the issue #44 common-source amplifier', async () => {
    const result = await simulate(`
      VDD vdd 0 DC 5
      VGS in 0 DC 1.5 AC 1
      .model NMOD NMOS(VTO=1 KP=1e-4)
      M1 out in 0 0 NMOD W=100u L=1u
      RD vdd out 10k
      .op
      .ac dec 100 1 10Meg
      .end
    `);

    // ngspice-47: V(out)=0.109875 V at the operating point, with
    // gm=1.09875 mS and gds=3.90125 mS. The response is flat because this
    // Level 1 model has no capacitances in the netlist.
    expect(result.dc!.voltage('in')).toBeCloseTo(1.5, 9);
    expect(result.dc!.voltage('out')).toBeCloseTo(0.109875, 6);

    const response = result.ac!.voltage('out');
    const ngspiceMagnitude = 0.274601749;
    const relativeTolerance = 1e-3;
    expect(response).toHaveLength(701);
    for (const point of response) {
      expect(Math.abs(point.magnitude - ngspiceMagnitude) / ngspiceMagnitude)
        .toBeLessThanOrEqual(relativeTolerance);
      expect(Math.abs(Math.abs(point.phase) - 180)).toBeLessThanOrEqual(1e-9);
    }
  });
});
