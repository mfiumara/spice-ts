import { describe, it, expect } from 'vitest';
import { Circuit } from '../circuit.js';
import { simulate } from '../simulate.js';
import { MNAAssembler } from '../mna/assembler.js';
import { Diode } from './diode.js';

describe('Diode', () => {
  it('stamps linearized conductance and current', () => {
    const asm = new MNAAssembler(2, 0);
    asm.solution[0] = 0.7;
    asm.solution[1] = 0.0;

    const diode = new Diode('D1', [0, 1], { IS: 1e-14, N: 1, BV: 100 });
    diode.stamp(asm.getStampContext());

    expect(asm.G.get(0, 0)).toBeGreaterThan(0);
    expect(asm.G.get(1, 1)).toBeGreaterThan(0);
    expect(asm.b[0]).not.toBe(0);
  });

  it('is nonlinear', () => {
    const diode = new Diode('D1', [0, 1], { IS: 1e-14, N: 1, BV: 100 });
    expect(diode.isNonlinear).toBe(true);
  });
});

describe('Diode in circuit', () => {
  it('forward biased diode has ~0.6-0.7V drop', async () => {
    const result = await simulate(`
      V1 1 0 DC 5
      R1 1 2 1k
      .model DMOD D(IS=1e-14 N=1)
      D1 2 0 DMOD
      .op
      .end
    `);

    const vd = result.dc!.voltage('2');
    expect(vd).toBeGreaterThan(0.55);
    expect(vd).toBeLessThan(0.75);
  });

  it('reverse biased diode blocks current', async () => {
    const result = await simulate(`
      V1 1 0 DC -5
      R1 1 2 1k
      .model DMOD D(IS=1e-14 N=1)
      D1 2 0 DMOD
      .op
      .end
    `);

    const vd = result.dc!.voltage('2');
    expect(vd).toBeCloseTo(-5, 0);
  });
});
