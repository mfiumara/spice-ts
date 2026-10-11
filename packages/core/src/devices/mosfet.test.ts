import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';
import { MOSFET } from './mosfet.js';

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

describe('MOSFET model-name resolution (issue #427)', () => {
  it('resolves a lower-case .model card from an upper-case instance reference', async () => {
    // ngspice model names are case-insensitive. Before the fix `PMOS` missed
    // `.model pmos`, so Mp4 silently became a default NMOS whose bulk-drain
    // junction was forward biased.
    const result = await simulate(`
      .model pmos pmos level=1 vto=-0.7
      Mp4 6 2 1 1 PMOS W=8e-6 L=600e-9
      R4 6 0 5.8k
      VDD 1 0 5
      VIN 2 0 0
      .op
      .end
    `);
    // ngspice-47 .op: v(6) = 4.296426
    expect(result.dc!.voltage('6')).toBeCloseTo(4.296426, 4);
  });

  it('keeps the corpus-e mos1 inverter supply current at ngspice scale', { timeout: 30_000 }, async () => {
    const fixture = new URL(
      '../../../../benchmarks/corpus/corpus-e/fixtures/tests/d_mos1.inv1.ckt',
      import.meta.url,
    );
    const result = await simulate(readFileSync(fixture, 'utf8'));

    // ngspice-47 on the unchanged fixture: .op v(3)=5 v(4)=4.580071
    // v(6)=4.296426, i(vdd)=-1.19877e-3; TRAN vecmax(abs(i(vdd)))=1.774848e-3.
    expect(result.dc!.voltage('3')).toBeCloseTo(5, 4);
    expect(result.dc!.voltage('4')).toBeCloseTo(4.580071, 4);
    expect(result.dc!.voltage('6')).toBeCloseTo(4.296426, 4);
    const supply = result.transient!.current('vdd');
    const peak = supply.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    expect(peak).toBeLessThan(1.774848e-3 * 1.05);
    expect(peak).toBeGreaterThan(1.774848e-3 * 0.95);
  });
});

// ngspice-47 model/instance defaults (issue #518): mos1set.c VTO=0 (mos2set.c
// and mos3set.c too), cktinit.c CKTdefaultMosW/L = 100u, and mos1temp.c
// KP = UO*(3.9*eps0/TOX)*1e-4 with UO=600 when TOX is given without KP.
// Every reference value is ngspice-47 batch output for the identical netlist.
describe('MOSFET model defaults match ngspice-47 (issue #518)', () => {
  const relativeError = (actual: number, expected: number): number =>
    Math.abs(actual - expected) / Math.abs(expected);

  it('defaults VTO to 0 V like ngspice mos1set.c (MOS1_out.cir at vd=vg=5)', async () => {
    const result = await simulate(`
      vb Nvf 0 0
      vd Nvd 0 5
      vg Nvg 0 5
      vs1 Nvs1 0 0
      vs2 Nvs2 0 0
      vs3 Nvs3 0 0
      M1  Nvd Nvg Nvs1 Nvf  NMOS
      M2  Nvd Nvg Nvs2 Nvf  NMOS W=10u L=5u
      M3  Nvd Nvg Nvs3 Nvf  NMOS3
      .MODEL  NMOS         NMOS (LEVEL  = 1  L = 3u  W = 9u)
      .MODEL  NMOS3        NMOS (LEVEL  = 1)
      .op
      .end
    `);
    // ngspice-47: vs1 7.5e-4, vs2 5.0e-4, vs3 2.5e-4, vd -1.5e-3, vb 1.503e-11.
    expect(relativeError(result.dc!.current('vs1'), 7.5e-4)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('vs2'), 5.0e-4)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('vs3'), 2.5e-4)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('vd'), -1.5e-3)).toBeLessThan(1e-6);
    expect(relativeError(result.dc!.current('vb'), 1.503e-11)).toBeLessThan(1e-3);
  });

  it('defaults an omitted instance W or L to 100u like ngspice CKTdefaultMosW/L', async () => {
    const result = await simulate(`
      vd d 0 5
      vg g 0 2
      M1 d g 0 0 NM W=10u
      M2 d g 0 0 NM L=50u
      .MODEL NM NMOS (LEVEL=1 KP=1e-4 VTO=1)
      .op
      .end
    `);
    // ngspice-47: vd#branch = -1.05000e-04 (W/L = 0.1 and 2).
    expect(relativeError(result.dc!.current('vd'), -1.05e-4)).toBeLessThan(1e-6);
  });

  it('derives KP from TOX and UO when KP is omitted, like ngspice mos1temp.c', async () => {
    const result = await simulate(`
      vg g 0 2
      vd2 d2 0 5
      M3 d2 g 0 0 NOX
      .MODEL NOX NMOS (LEVEL=1 VTO=1 TOX=1e-8)
      vd3 d3 0 5
      M4 d3 g 0 0 NOXU
      .MODEL NOXU NMOS (LEVEL=1 VTO=1 TOX=2e-8 UO=400)
      .op
      .end
    `);
    // ngspice-47: vd2#branch = -1.03594e-04, vd3#branch = -3.45314e-05.
    expect(relativeError(result.dc!.current('vd2'), -1.03594e-4)).toBeLessThan(1e-5);
    expect(relativeError(result.dc!.current('vd3'), -3.45314e-5)).toBeLessThan(1e-5);
  });

  it('derives VTO from NSUB (with GAMMA, PHI, NSS, TPG) like ngspice mos1/2/3temp.c', async () => {
    // ngspice-47 showmod after .op (6 significant digits).
    const cases: Array<[Record<string, number>, number, number, number]> = [
      [{ LEVEL: 1, TOX: 1e-7, NSUB: 1e16 }, 1, 1.1816, 2.07189e-5],
      [{ LEVEL: 1, TOX: 5e-8, NSUB: 3e15, NSS: 1e10, UO: 500 }, 1, 0.0994357, 3.45314e-5],
      [{ LEVEL: 1, TOX: 1e-7, NSUB: 1e16, TPG: 0, PHI: 0.7 }, 1, 1.13841, 2.07189e-5],
      [{ LEVEL: 1, TOX: 1e-7, NSUB: 1e16, TPG: -1, GAMMA: 0.5 }, 1, 1.32224, 2.07189e-5],
      [{ LEVEL: 1, TOX: 1e-7, NSUB: 1e16 }, -1, -1.1816, 2.07189e-5],
      [{ LEVEL: 2, TOX: 0.11e-6, NSUB: 2.2e15, UO: 575, NSS: 3.2e10, KP: 2e-5, PHI: 0.6 }, 1, 0.245948, 2e-5],
      [{ LEVEL: 3, TOX: 2e-8, NSUB: 5e16 }, 1, 0.489715, 1.03594e-4],
    ];
    for (const [card, polarity, vto, kp] of cases) {
      const device = new MOSFET('M', [0, 1, -1, -1], { ...card, polarity });
      expect(relativeError(device.params.VTO, vto)).toBeLessThan(1e-5);
      expect(relativeError(device.params.KP, kp)).toBeLessThan(1e-5);
    }
    const result = await simulate(`
      vd1 d1 0 5
      vd2 d2 0 5
      vg g 0 5
      vp dp 0 -5
      vgp gp 0 -5
      M1 d1 g 0 0 N1
      M2 d2 g 0 0 N2
      M7 dp gp 0 0 P1
      .MODEL N1 NMOS (LEVEL=1 TOX=1e-7 NSUB=1e16)
      .MODEL N2 NMOS (LEVEL=1 TOX=5e-8 NSUB=3e15 NSS=1e10 UO=500)
      .MODEL P1 PMOS (LEVEL=1 TOX=1e-7 NSUB=1e16)
      .op
      .end
    `);
    // ngspice-47: vd1#branch -1.51042e-04, vd2#branch -4.14645e-04, vp#branch 1.510424e-04.
    expect(relativeError(result.dc!.current('vd1'), -1.51042e-4)).toBeLessThan(1e-5);
    expect(relativeError(result.dc!.current('vd2'), -4.14645e-4)).toBeLessThan(1e-5);
    expect(relativeError(result.dc!.current('vp'), 1.510424e-4)).toBeLessThan(1e-5);
  });

  it('keeps the historical VTO=1, KP=2e-5 fallback for non-MOS1-3 levels', () => {
    const device = new MOSFET('M', [0, 1, -1, -1], { LEVEL: 4, TOX: 3e-2 });
    expect(device.params.VTO).toBe(1);
    expect(device.params.KP).toBe(2e-5);
  });

  it('scales gate overlap capacitance by the default W=100u', async () => {
    const result = await simulate(`
      vin in 0 dc 0 ac 1
      r1 in g 1meg
      M1 0 g 0 0 NM
      .MODEL NM NMOS (LEVEL=1 CGSO=1e-9)
      .ac dec 1 1e5 1e7
      .end
    `);
    // ngspice-47 v(g): 1e5 9.960677e-01,-6.25848e-02; 1e6 7.169568e-01,-4.50477e-01;
    // 1e7 2.470452e-02,-1.55223e-01 (CGSO*W = 1e-13 F against 1 Mohm).
    const reference = [[9.960677e-1, -6.25848e-2], [7.169568e-1, -4.50477e-1], [2.470452e-2, -1.55223e-1]];
    const response = result.ac!.voltage('g');
    expect(response).toHaveLength(reference.length);
    response.forEach((point, index) => {
      const [re, im] = reference[index];
      expect(relativeError(point.magnitude, Math.hypot(re, im))).toBeLessThan(1e-5);
      expect(point.phase).toBeCloseTo(Math.atan2(im, re) * 180 / Math.PI, 3);
    });
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
