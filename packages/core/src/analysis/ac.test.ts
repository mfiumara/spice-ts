import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

describe('AC Small-Signal Analysis', () => {
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
});
