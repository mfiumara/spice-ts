import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';
import type { BJT } from './bjt.js';

describe('BJT Ebers-Moll', () => {
  it('NPN common-emitter amplifier has correct bias point', async () => {
    const result = await simulate(`
      VCC 1 0 DC 12
      .model QMOD NPN(BF=100 IS=1e-14)
      RB 1 2 100k
      RC 1 3 1k
      Q1 3 2 0 QMOD
      .op
      .end
    `);

    const vb = result.dc!.voltage('2');
    const vc = result.dc!.voltage('3');

    expect(vb).toBeGreaterThan(0.55);
    expect(vb).toBeLessThan(0.8);
    expect(vc).toBeGreaterThan(0);
    expect(vc).toBeLessThan(12);
  });

  it('NPN in cutoff has collector at VCC', async () => {
    const result = await simulate(`
      VCC 1 0 DC 5
      .model QMOD NPN(BF=100 IS=1e-14)
      RC 1 2 1k
      Q1 2 0 0 QMOD
      .op
      .end
    `);

    const vc = result.dc!.voltage('2');
    expect(vc).toBeCloseTo(5, 0);
  });

  it('stamps and converges the bounded forward-active Gummel-Poon parameters', async () => {
    const result = await simulate(`forward-active parameter probe
      VBE base 0 DC 0.72
      VCE collector 0 DC 1
      Q1 collector base 0 QGP
      .model QGP NPN(IS=1e-15 BF=100 VAF=50 IKF=1m ISE=2e-13 NE=1.5)
      .dc VCE 1 9 4
      .end
    `);

    const collectorSupply = result.dcSweep!.current('VCE');
    const baseSupply = result.dcSweep!.current('VBE');
    expect(collectorSupply).toHaveLength(3);
    expect(collectorSupply[0]).toBeCloseTo(-0.0007282049836704018, 12);
    // Closed-form model value IF/qB at VCE = 9 V (true reverse VBC = -8.28 V).
    expect(collectorSupply[2]).toBeCloseTo(-0.0008440689428858987, 12);
    expect(baseSupply[0]).toBeCloseTo(-0.00003567532735368342, 12);
    expect(result.convergence!.dc).toMatchObject({
      acceptedSolves: 3,
      rejectedSolves: 0,
      failure: null,
    });
  });

  it('preserves the level-1 Ebers-Moll defaults when GP parameters are absent', () => {
    const compiled = parse(`level-1 compatibility
      VCC c 0 5
      Q1 c b 0 QLEGACY
      .model QLEGACY NPN(IS=1e-14 BF=80 BR=2 NF=1.1 NR=1.2)
      .op
    `).compile();
    const bjt = compiled.devices.find(device => device.name === 'Q1');
    expect(bjt).toMatchObject({
      params: { LEVEL: 1, IS: 1e-14, BF: 80, BR: 2, NF: 1.1, NR: 1.2, VAF: Infinity, IKF: Infinity, ISE: 0, NE: 1.5 },
    });
  });

  it('rejects unsupported Gummel-Poon model parameters explicitly', () => {
    expect(() => parse(`unsupported BJT parameter
      Q1 c b 0 QGP
      .model QGP NPN(BF=100 IKF=1m IKR=2m)
      .op
    `).compile()).toThrow("Unsupported bounded BJT model parameter: 'IKR'");
  });

  // ngspice-47 `print vm(c) vp(c)` on the identical deck (vp in radians).
  const chargeStorageDeck = (extra: string) => `bjt charge storage ac
    vcc vcc 0 10
    vin in 0 dc 0 ac 1
    rs in b 1k
    rc vcc c 5k
    q1 c b e qn
    ie e 0 dc 1m
    ce e 0 1
    .model qn npn is=1e-16 bf=80 rb=100 ccs=2p tf=0.3n tr=6n cje=3p cjc=2p ${extra}
    .ac dec 1 1meg 1g
    .end
  `;

  const expectAcMatches = async (
    deck: string,
    reference: ReadonlyArray<readonly [number, number, number]>,
  ) => {
    const result = await simulate(deck);
    const ac = result.ac!;
    const output = ac.voltage('c');
    reference.forEach(([frequency, magnitude, phase], index) => {
      expect(ac.frequencies[index]).toBeCloseTo(frequency, 0);
      const value = output[index];
      expect(Math.abs(value.magnitude - magnitude) / magnitude).toBeLessThan(5e-3);
      expect(Math.abs(value.phase * Math.PI / 180 - phase)).toBeLessThan(5e-3);
    });
  };

  it('stamps junction, diffusion and substrate capacitances in AC', async () => {
    await expectAcMatches(chargeStorageDeck(''), [
      [1e6, 8.646100e+01, 2.325930e+00],
      [1e7, 1.187185e+01, 1.593796e+00],
      [1e8, 9.765313e-01, 9.485290e-01],
      [1e9, 1.698771e-02, -2.42167e-02],
    ]);
  });

  it('stamps bias-dependent TF, graded junctions and the Early cross-capacitance in AC', async () => {
    await expectAcMatches(chargeStorageDeck(
      'vaf=50 xtf=2 vtf=4 itf=5m mje=0.4 vje=0.8 mjc=0.3 vjc=0.6 fc=0.6 mjs=0.5 vjs=0.7',
    ), [
      [1e6, 8.533097e+01, 2.368643e+00],
      [1e7, 1.220148e+01, 1.628205e+00],
      [1e8, 1.123801e+00, 1.149537e+00],
      [1e9, 2.756776e-02, 5.819981e-02],
    ]);
  });

  it('linearises the Early factor at the true reverse B-C bias', async () => {
    // ngspice-47 on the identical deck: vm(c) = 1.186748e+02 at 10 Hz (vbc = -5.07 V).
    const result = await simulate(`bjt early small signal
      vcc vcc 0 10
      vin in 0 dc 0 ac 1
      rs in b 1k
      rc vcc c 5k
      q1 c b e qn
      ie e 0 dc 1m
      ce e 0 1
      .model qn npn is=1e-16 bf=80 rb=100 vaf=50
      .ac dec 1 1 10
      .end
    `);
    const gain = result.ac!.voltage('c')[1].magnitude;
    expect(Math.abs(gain - 118.6748) / 118.6748).toBeLessThan(2e-3);
  });

  it('reports the noise collector current with the true Early factor', () => {
    const compiled = parse(`early noise operating point
      VCE c 0 9
      VBE b 0 0.72
      Q1 c b 0 QGP
      .model QGP NPN(IS=1e-15 BF=100 VAF=50)
      .op
    `).compile();
    const bjt = compiled.devices.find(device => device.name === 'Q1') as BJT;
    const solution = new Float64Array(compiled.nodeCount + compiled.branchCount);
    solution[compiled.nodeNames.indexOf('c')] = 9;
    solution[compiled.nodeNames.indexOf('b')] = 0.72;
    const forward = 1e-15 * (Math.exp(0.72 / 0.02585) - 1);
    expect(bjt.noiseOperatingPoint(solution).collectorCurrent)
      .toBeCloseTo(forward * (1 + 8.28 / 50), 12);
  });

  it.each([
    ['PTF=30', "Unsupported BJT model parameter: 'PTF'"],
    ['XCJC=0.5', "Unsupported BJT model parameter: 'XCJC' < 1 together with RB > 0"],
    ['CJE=-1p', 'expected finite BJT CJE >= 0'],
    ['VJC=0', 'expected finite BJT VJC > 0'],
  ])('rejects unsupported or invalid charge-storage parameter %s explicitly', (parameter, message) => {
    expect(() => parse(`charge storage validation
      Q1 c b 0 QCAP
      .model QCAP NPN(BF=100 RB=10 CJC=1p ${parameter})
      .op
    `).compile()).toThrow(message);
  });

  it('rejects unsupported BJT model types explicitly', () => {
    // #509: unsupported model types are rejected when the .model card is parsed.
    expect(() => parse('title\nQ1 c b 0 QBAD\n.model QBAD VBIC BF=100\n.op'))
      .toThrow(expect.objectContaining({ code: 'UNSUPPORTED_MODEL_TYPE', modelName: 'QBAD', modelType: 'VBIC' }));
  });

  it('runs the unchanged bounded VBIC forward-output DC fixture', async () => {
    const fixture = readFileSync(resolve(
      process.cwd(),
      '../../benchmarks/corpus/ngspice/fixtures/tests/vbic/FO.cir',
    ));
    expect(createHash('sha256').update(fixture).digest('hex'))
      .toBe('de57231ef8879e785b07068db662bfa5ecfde8734011b88b09f319b826242e92');

    const result = await simulate(fixture.toString('utf8'));

    expect(result.dcSweep?.sweepValues).toHaveLength(707);
    expect(Array.from(result.dcSweep!.current('VC'))).toHaveLength(707);
    expect(Array.from(result.dcSweep!.current('VB'))).toHaveLength(707);
    expect(Array.from(result.dcSweep!.current('VC')).every(Number.isFinite)).toBe(true);
    expect(Array.from(result.dcSweep!.current('VB')).every(Number.isFinite)).toBe(true);
    expect(result.convergence?.dc).toMatchObject({ rejectedSolves: 0, failure: null });
  });

  it('rejects parameters outside the bounded VBIC DC subset', () => {
    expect(() => parse(`unsupported VBIC parameter
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4 BF=100)
      .op
    `).compile()).toThrow("Unsupported bounded VBIC DC model parameter: 'BF'");
  });

  it('rejects invalid bounded VBIC parameter values', () => {
    expect(() => parse(`invalid VBIC parameter
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4 CJE=-1p)
      .op
    `).compile()).toThrow("Invalid bounded VBIC DC model parameter: 'CJE'");
  });

  it('rejects PNP polarity outside the bounded VBIC DC subset', () => {
    expect(() => parse(`unsupported VBIC polarity
      Q1 c b 0 QVBIC
      .model QVBIC PNP(LEVEL=4)
      .op
    `).compile()).toThrow('Unsupported bounded VBIC polarity: only NPN LEVEL=4 is supported');
  });

  it('accepts AC analysis in the bounded VBIC small-signal subset', () => {
    expect(() => parse(`bounded VBIC AC analysis
      VBE b 0 DC 0.7 AC 1
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .ac dec 10 1 1meg
    `).compile()).not.toThrow();
  });

  it('rejects transient analysis outside the bounded VBIC DC subset', () => {
    expect(() => parse(`unsupported VBIC transient analysis
      VBE b 0 0.7
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .tran 1n 10n
    `).compile()).toThrow("Unsupported bounded VBIC analysis: 'tran'");
  });

  it('accepts pole-zero analysis in the bounded VBIC small-signal subset', () => {
    expect(() => parse(`bounded VBIC pole-zero analysis
      VIN b 0 0.7
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .pz b 0 c 0 cur pz
    `).compile()).not.toThrow();
  });

  it('rejects TEMP stepping outside the nominal-temperature bounded VBIC subset', async () => {
    await expect(simulate(`unsupported VBIC TEMP stepping
      VBE b 0 0.7
      VCE c 0 1
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .op
      .step TEMP LIST -55 125
    `)).rejects.toThrow("Unsupported bounded VBIC step: 'TEMP'");
  });
});
