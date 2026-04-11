import { describe, it, expect } from 'vitest';
import { simulate } from './simulate.js';

describe('Controlled sources integration', () => {
  describe('VCCS (G element)', () => {
    it('transconductance amplifier: Vout = gm * Vin * RL', async () => {
      // gm=10mS, Vin=1V, RL=1k => Vout = 0.01 * 1 * 1000 = 10V
      // G1 output current flows into n+ (node 0) and out of n- (node 2),
      // so we swap output nodes to get positive voltage at node 2.
      const result = await simulate(`
        V1 1 0 DC 1
        G1 0 2 1 0 10m
        R1 2 0 1k
        .op
      `);
      expect(result.dc!.voltage('2')).toBeCloseTo(10, 4);
    });
  });

  describe('VCVS (E element)', () => {
    it('voltage amplifier: Vout = gain * Vin', async () => {
      // gain=10, Vin=1V => Vout = 10V
      const result = await simulate(`
        V1 1 0 DC 1
        E1 2 0 1 0 10
        R1 2 0 1k
        .op
      `);
      expect(result.dc!.voltage('2')).toBeCloseTo(10, 4);
    });
  });

  describe('CCCS (F element)', () => {
    it('current mirror: Iout = gain * Isense', async () => {
      // V1=1V through R1=1k => Isense=1mA. gain=5 => Iout=5mA.
      // Iout through RL=1k => VRL = 5V
      // F1 output current flows into n+ and out of n-,
      // so we swap output nodes to get positive voltage at node 3.
      const result = await simulate(`
        V1 1 0 DC 1
        Vsense 1 2 DC 0
        R1 2 0 1k
        F1 0 3 Vsense 5
        RL 3 0 1k
        .op
      `);
      expect(result.dc!.voltage('3')).toBeCloseTo(5, 4);
    });
  });

  describe('CCVS (H element)', () => {
    it('transimpedance amplifier: Vout = gain * Isense', async () => {
      // V1=1V through R1=1k => Isense=1mA. gain=1k => Vout=1V.
      const result = await simulate(`
        V1 1 0 DC 1
        Vsense 1 2 DC 0
        R1 2 0 1k
        H1 3 0 Vsense 1k
        RL 3 0 1k
        .op
      `);
      expect(result.dc!.voltage('3')).toBeCloseTo(1, 4);
    });
  });
});

describe('AC analysis with controlled sources', () => {
  it('inverting op-amp (VCVS) has gain = -Rf/Rin at mid-band', async () => {
    // Ideal op-amp model: VCVS with gain = 100000
    // Inverting config: Rin=1k, Rf=10k => closed-loop gain = -10
    //
    // Circuit:
    //   Vac  1  0  AC 1 0           (AC stimulus)
    //   Rin  1  2  1k               (input resistor, node 2 = inverting input)
    //   Rf   2  3  10k              (feedback resistor)
    //   E1   3  0  0  2  100000     (VCVS: V(3) = 100000 * (V(0) - V(2)) = -100000 * V(2))
    //   .ac dec 1 1k 1k
    //
    // Note: non-inverting input is ground (node 0), inverting input is node 2.
    // E1 n+ n- nc+ nc- gain => V(3,0) = 100000 * V(0,2) = -100000 * V(2)
    const result = await simulate(`
      Vac 1 0 AC 1 0
      Rin 1 2 1k
      Rf 2 3 10k
      E1 3 0 0 2 100000
      .ac dec 1 1k 1k
    `);

    const ac = result.ac!;
    const vout = ac.voltage('3');

    // At 1kHz, closed-loop gain magnitude should be ~10 (= Rf/Rin)
    expect(vout[0].magnitude).toBeCloseTo(10, 0);

    // Phase should be ~180 degrees (inverting)
    expect(Math.abs(vout[0].phase)).toBeCloseTo(180, 0);
  });
});
