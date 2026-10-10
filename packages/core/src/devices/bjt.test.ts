import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { simulate } from '../simulate.js';
import { parse } from '../parser/index.js';

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
    expect(collectorSupply[2]).toBeCloseTo(-0.0008440689544214597, 12);
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
      .model QGP NPN(BF=100 IKF=1m CJE=2p)
      .op
    `).compile()).toThrow("Unsupported bounded BJT model parameter: 'CJE'");
  });

  it('rejects unsupported BJT model types explicitly', () => {
    expect(() => parse('title\nQ1 c b 0 QBAD\n.model QBAD VBIC BF=100\n.op').compile())
      .toThrow("Unsupported BJT model type: 'VBIC'");
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

  it('rejects AC analysis outside the bounded VBIC DC subset', () => {
    expect(() => parse(`unsupported VBIC AC analysis
      VBE b 0 DC 0.7 AC 1
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .ac dec 10 1 1meg
    `).compile()).toThrow("Unsupported bounded VBIC analysis: 'ac'");
  });

  it('rejects transient analysis outside the bounded VBIC DC subset', () => {
    expect(() => parse(`unsupported VBIC transient analysis
      VBE b 0 0.7
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .tran 1n 10n
    `).compile()).toThrow("Unsupported bounded VBIC analysis: 'tran'");
  });

  it('rejects pole-zero analysis outside the bounded VBIC DC subset', () => {
    expect(() => parse(`unsupported VBIC pole-zero analysis
      VIN b 0 0.7
      Q1 c b 0 QVBIC
      .model QVBIC NPN(LEVEL=4)
      .pz b 0 c 0 cur pz
    `).compile()).toThrow("Unsupported bounded VBIC analysis: 'pz'");
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
