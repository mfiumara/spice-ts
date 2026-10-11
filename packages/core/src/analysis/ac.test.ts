import { describe, it, expect } from 'vitest';
import { simulate, simulateStream } from '../simulate.js';
import { simulateProtocolV1 } from '../protocol/adapter.js';

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
      .ac lin 3 ${fLow} ${fRes}
      .end
    `);

    expect(result.ac).toBeDefined();
    const sourceCurrent = result.ac!.current('V1');

    expect(sourceCurrent[0].magnitude).toBeCloseTo(1e-3, 2);
    expect(sourceCurrent[2].magnitude).toBeCloseTo(1, 1);
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

describe('AC frequency grid (ngspice-47 parity)', () => {
  const deck = (sweep: string) => `title\nV1 a 0 AC 1\nR1 a b 1k\nC1 b 0 1u\n.ac ${sweep}\n.end`;

  // Expected grids were printed by ngspice-47 (`print frequency`) for the same decks.
  it.each([
    ['lin 10 1 1k', 10, 1, 1000],
    ['lin 1 100 1k', 1, 100, 100],
    ['dec 10 1 5', 7, 1, 3.981072],
    ['dec 1 1 1k', 4, 1, 1000],
    ['oct 4 1 5', 10, 1, 4.756828],
    ['oct 3 1 10', 10, 1, 8],
  ])('.ac %s gives %i points from %d to %d', async (sweep, count, first, last) => {
    const frequencies = (await simulate(deck(sweep))).ac!.frequencies;
    expect(frequencies).toHaveLength(count);
    expect(frequencies[0]).toBeCloseTo(first, 6);
    expect(frequencies[count - 1]).toBeCloseTo(last, 5);
  });

  // ngspice-47 acan.c only steps a LIN sweep when `N - 1 > 1`; `lin 2` falls into the
  // one-point branch (#555). Grids from ngspice-47 `print length(frequency) frequency`.
  it.each<[string, number[]]>([
    ['lin 1 10 100', [10]],
    ['lin 2 10 100', [10]],
    ['lin 2 10 10', [10]],
    ['lin 3 10 100', [10, 55, 100]],
    ['lin 4 10 100', [10, 40, 70, 100]],
    ['dec 3 10 1k', [10, 21.54435, 46.41589, 100, 215.4435, 464.1589, 1000]],
    ['dec 1 10 50', [10]],
    ['oct 2 10 100', [10, 14.14214, 20, 28.28427, 40, 56.56854, 80]],
    ['oct 1 10 15', [10]],
  ])('.ac %s matches the ngspice-47 grid %j', async (sweep, expected) => {
    const frequencies = (await simulate(deck(sweep))).ac!.frequencies;
    expect(frequencies).toHaveLength(expected.length);
    frequencies.forEach((f, i) => expect(f / expected[i]).toBeCloseTo(1, 6));
  });

  it('counts .ac lin 2 as one point under a maxResultPoints limit of 1', async () => {
    const result = await simulateProtocolV1({
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 a 0 AC 1\nR1 a 0 1k\n.ac lin 2 10 100' },
      options: { limits: { maxResultPoints: 1 } },
    });
    const ac = result.analyses[0];
    if (ac?.type !== 'ac') throw new Error('expected AC result');
    expect(ac.frequencyHz).toEqual([10]);
  });

  // noisean.c has no such guard: `.noise ... lin 2` keeps both endpoints in ngspice-47.
  it('.noise lin 2 keeps both endpoints like ngspice-47', async () => {
    const noise = (await simulate(
      'title\nV1 a 0 AC 1\nR1 a b 1k\nC1 b 0 1u\n.noise v(b) V1 lin 2 10 100\n.end',
    )).noise!;
    expect(noise.frequencies).toEqual([10, 100]);
  });

  // ngspice-47 `.ac` DEC sweeps spanning at least one decade keep floor(decades*N) intervals and
  // stretch the ratio so the last point lands on stop (acan.c). Grids from `wrdata frequency`.
  it.each([
    ['dec 10 1 5k', 37, 1.26691993, 5000],
    ['dec 7 3 47k', 30, 4.1857725, 47000],
    ['dec 10 1 50', 17, 1.2769845, 50],
    ['dec 10 1 900', 30, 1.26435908, 900],
    ['dec 1 1 50', 2, 50, 50],
    ['dec 1 1 500', 3, 22.3606798, 500],
    ['dec 10 1 12.6', 12, 1.25902306, 12.6],
    ['dec 10 1 10.001', 11, 1.258938, 10.001],
    ['dec 10 1 99.99', 20, 1.27426828, 99.99],
    ['dec 10 1 999.999', 30, 1.26896096, 999.999],
    ['dec 2 1 10.5', 3, 3.24037035, 10.5],
    ['dec 10 3 1e5', 46, 3.78120019, 1e5],
    ['dec 10 1 9.999', 11, 1.25892541, 10],
    ['dec 10 1 1k', 31, 1.25892541, 1000],
    ['oct 4 1 50', 23, 1.18920712, 45.254834],
  ])('.ac %s gives %i points, second %d, ending at %d', async (sweep, count, second, last) => {
    const frequencies = (await simulate(deck(sweep))).ac!.frequencies;
    expect(frequencies).toHaveLength(count);
    expect(frequencies[1] / second).toBeCloseTo(1, 7);
    expect(frequencies[count - 1] / last).toBeCloseTo(1, 7);
  });

  it('streams the stretched multi-decade DEC grid', async () => {
    const streamed: number[] = [];
    for await (const point of simulateStream(deck('dec 10 1 5k'))) {
      if ('frequency' in point) streamed.push(point.frequency);
    }
    expect(streamed).toHaveLength(37);
    expect(streamed[36] / 5000).toBeCloseTo(1, 7);
  });

  // `.noise` keeps the plain 10^(1/N) stepping with the reltol stop tolerance (noisean.c), so
  // its grid differs from `.ac` for the same multi-decade fractional sweep.
  it.each([
    ['dec 10 1 5k', 37, 3981.07171],
    ['dec 10 1 99.99', 21, 100],
    ['dec 1 1 50', 2, 10],
  ])('.noise %s keeps ngspice-47 plain stepping: %i points ending at %d', async (sweep, count, last) => {
    const noise = (await simulate(
      `title\nV1 a 0 AC 1\nR1 a b 1k\nC1 b 0 1u\n.noise v(b) V1 ${sweep}\n.end`,
    )).noise!;
    expect(noise.frequencies).toHaveLength(count);
    expect(noise.frequencies[count - 1] / last).toBeCloseTo(1, 7);
  });

  it('accepts a stretched .ac dec sweep under a maxResultPoints limit of its ngspice count', async () => {
    const result = await simulateProtocolV1({
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 a 0 AC 1\nR1 a 0 1k\n.ac dec 10 1 99.99' },
      options: { limits: { maxResultPoints: 20 } },
    });
    const ac = result.analyses[0];
    if (ac?.type !== 'ac') throw new Error('expected AC result');
    expect(ac.frequencyHz).toHaveLength(20);
  });

  it('streams the same grid as the batch solver', async () => {
    const streamed: number[] = [];
    for await (const point of simulateStream(deck('lin 10 1 1k'))) {
      if ('frequency' in point) streamed.push(point.frequency);
    }
    expect(streamed).toEqual((await simulate(deck('lin 10 1 1k'))).ac!.frequencies);
  });

  it('accepts .ac lin N under a maxResultPoints limit of N', async () => {
    const result = await simulateProtocolV1({
      apiVersion: '1',
      input: { format: 'spice', source: 'V1 a 0 AC 1\nR1 a 0 1k\n.ac lin 10 1 1k' },
      options: { limits: { maxResultPoints: 10 } },
    });
    const ac = result.analyses[0];
    if (ac?.type !== 'ac') throw new Error('expected AC result');
    expect(ac.frequencyHz).toHaveLength(10);
  });
});
