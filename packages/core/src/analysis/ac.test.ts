import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('AC Small-Signal Analysis', () => {
  it('applies an independent current-source AC excitation', async () => {
    const result = await simulate(`
      I1 out 0 AC 1 0
      R1 out 0 1
      .ac lin 1 1 1
      .end
    `);

    expect(result.ac!.voltage('out')[0].magnitude).toBeCloseTo(1, 9);
  });

  it('preserves current-source orientation between two non-ground nodes', async () => {
    const result = await simulate(`
      I1 positive negative AC 1 0
      R1 positive 0 1
      R2 negative 0 1
      .ac lin 1 1 1
      .end
    `);

    const positive = result.ac!.voltage('positive')[0];
    const negative = result.ac!.voltage('negative')[0];
    expect(positive.magnitude).toBeCloseTo(1, 9);
    expect(Math.abs(positive.phase)).toBeCloseTo(180, 9);
    expect(negative.magnitude).toBeCloseTo(1, 9);
    expect(negative.phase).toBeCloseTo(0, 9);
  });

  it('superposes multiple phased current sources', async () => {
    const result = await simulate(`
      I1 out 0 AC 2 30
      I2 0 out AC 1 -30
      R1 out 0 1
      .ac lin 1 1 1
      .end
    `);

    const output = result.ac!.voltage('out')[0];
    expect(output.magnitude).toBeCloseTo(Math.sqrt(3), 9);
    expect(output.phase).toBeCloseTo(-120, 9);
  });

  it('superposes voltage and phased current excitations', async () => {
    const result = await simulate(`
      V1 source 0 AC 1 0
      R1 source out 1
      I1 out 0 AC 1 90
      R2 out 0 1
      .ac lin 1 1 1
      .end
    `);

    const output = result.ac!.voltage('out')[0];
    expect(output.magnitude).toBeCloseTo(1 / Math.sqrt(2), 9);
    expect(output.phase).toBeCloseTo(-45, 9);
  });

  it('RC lowpass filter has correct -3dB frequency', async () => {
    const result = await simulate(`
      V1 1 0 AC 1 0
      R1 1 2 1k
      C1 2 0 1u
      .ac dec 20 1 100k
      .end
    `);

    expect(result.ac).toBeDefined();
    const freqs = result.ac!.frequencies;
    const vout = result.ac!.voltage('2');

    // At low frequency, gain ~ 1
    expect(vout[0].magnitude).toBeCloseTo(1, 1);

    // Find -3dB point: f3dB = 1 / (2*pi*R*C)
    const f3dB = 1 / (2 * Math.PI * 1000 * 1e-6);
    const idx3dB = freqs.findIndex(f => f >= f3dB);
    expect(vout[idx3dB].magnitude).toBeCloseTo(1 / Math.sqrt(2), 1);

    // At high frequency, gain rolls off
    expect(vout[vout.length - 1].magnitude).toBeLessThan(0.1);
  });

  it('RLC bandpass has resonance peak', async () => {
    const result = await simulate(`
      V1 1 0 AC 1 0
      R1 1 2 100
      L1 2 3 10m
      C1 3 0 100n
      .ac dec 20 100 100k
      .end
    `);

    expect(result.ac).toBeDefined();
    const freqs = result.ac!.frequencies;
    const vout = result.ac!.voltage('3');

    let maxMag = 0, maxIdx = 0;
    for (let i = 0; i < vout.length; i++) {
      if (vout[i].magnitude > maxMag) { maxMag = vout[i].magnitude; maxIdx = i; }
    }

    // Resonant frequency: f0 = 1 / (2*pi*sqrt(L*C))
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 100e-9));
    expect(freqs[maxIdx]).toBeCloseTo(f0, -2);
  });

  it('includes capacitor ESR and ESL in AC response', async () => {
    const fLow = 1 / (2 * Math.PI * 1e3 * 1e-6);
    const fRes = 1 / (2 * Math.PI * Math.sqrt(1e-6 * 1e-6));

    const result = await simulate(`
      V1 in 0 AC 1 0
      C1 in 0 1u ESR=1 ESL=1u RLEAK=1e12
      .ac lin 1 ${fLow} ${fRes}
      .end
    `);

    expect(result.ac).toBeDefined();
    const sourceCurrent = result.ac!.current('V1');

    expect(sourceCurrent[0].magnitude).toBeCloseTo(1e-3, 2);
    expect(sourceCurrent[1].magnitude).toBeCloseTo(1, 1);
  });

  it('keeps DC source bias when AC excitation is also declared', async () => {
    const result = await simulate(`
      V1 in 0 DC 1.5 AC 1
      R1 in 0 1k
      .op
      .ac lin 1 1 1
      .end
    `);

    expect(result.dc!.voltage('in')).toBeCloseTo(1.5, 6);
    expect(result.ac!.voltage('in')[0].magnitude).toBeCloseTo(1, 6);
  });
});
