import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #731: the MOS1 instance multiplier M was silently ignored. ngspice-47 mos1load.c /
// mos1temp.c scale Beta, the bulk saturation currents (and the DEVpnjlim critical voltages
// derived from them), the Meyer oxide capacitance, the CGSO/CGDO/CGBO overlaps and the
// CBD/CBS/CJ/CJSW junction capacitances by MOS1m; mos1noi.c divides the NLEV=2 flicker
// density by M. All references below are ngspice-47 batch runs of the identical decks.

const close = (actual: number, reference: number, relative: number, floor: number) =>
  expect(Math.abs(actual - reference)).toBeLessThan(relative * Math.abs(reference) + floor);

describe('MOS1 instance multiplier M (#731)', () => {
  it('doubles the .op drain current for M=2, as ngspice-47 does', async () => {
    const deck = [
      'mos1 M dc',
      'VD d 0 1',
      'VG g 0 3',
      'M1 d g 0 0 NM L=5u W=10u M=2',
      'VD2 d2 0 1',
      'M2 d2 g 0 0 NM L=5u W=10u',
      '.MODEL NM NMOS (LEVEL=1 VTO=1 KP=2e-5)',
      '.op',
      '.end',
    ].join('\n');
    const op = (await simulate(deck)).dc!;
    // ngspice-47: i(vd) = -1.20000e-04, i(vd2) = -6.00000e-05.
    close(op.current('VD'), -1.2e-4, 1e-6, 0);
    close(op.current('VD2'), -6e-5, 1e-6, 0);
  });

  it('scales the channel, body effect and bulk junction currents in a .DC sweep', async () => {
    const deck = [
      'MOS1 instance multiplier M: channel, body effect, bulk junctions',
      'VDD VDD 0 5',
      'VIN IN 0 0',
      'VB B 0 0.45',
      'RL VDD OUT 2K',
      'M1 OUT IN 0 B NM L=4u W=20u AD=100p AS=100p M=3',
      '.MODEL NM NMOS (LEVEL=1 VTO=0.8 KP=3e-5 LAMBDA=0.03 GAMMA=0.4 PHI=0.7 JS=1e-3)',
      '.OPTIONS RELTOL=1e-6',
      '.DC VIN 0 5 1',
      '.END',
    ].join('\n');
    // ngspice-47 (numdgt=12), VIN = 0..5 V. RELTOL=1e-6 takes both engines' Newton end points
    // well below the 1e-4 differences tested here (at the default RELTOL=1e-3 they stop up to
    // 5e-4 apart at VIN = 4, with or without M). With M omitted ngspice gives v(out) = 4.98369 V
    // at VIN = 1 and i(vb) = -3.59659e-6 A (a third of the M=3 value).
    const vout = [
      4.9999999903, 4.951107108007, 4.135170682473, 2.429179354611, 1.461665642638, 1.114001953554,
    ];
    const ivdd = [
      -4.8499999572e-12, -2.44464459964e-5, -4.32414658764e-4, -1.28541032269e-3, -1.76916717868e-3,
      -1.94299902322e-3,
    ];
    const ivb = [
      -1.07897892887e-5, -1.07897893376e-5, -1.07897901535e-5, -1.07897918595e-5, -1.0789792827e-5,
      -1.07897931747e-5,
    ];
    const sweep = (await simulate(deck)).dcSweep!;
    const out = [...sweep.voltage('OUT')];
    const supply = [...sweep.current('VDD')];
    const bulk = [...sweep.current('VB')];
    expect(out).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      close(out[i], vout[i], 1e-6, 1e-9);
      close(supply[i], ivdd[i], 1e-6, 1e-12);
      close(bulk[i], ivb[i], 1e-6, 1e-15);
    }
  });

  it('scales the Meyer, overlap and junction charges in a transient', { timeout: 60_000 }, async () => {
    const deck = (multiplier: string) => [
      'MOS1 instance multiplier M: Meyer, overlap and junction charge',
      'VDD VDD 0 5',
      'VIN IN 0 PULSE(0 5 1n 1n 1n 8n 20n)',
      'RL VDD OUT 5K',
      'RG IN G 2K',
      `M1 OUT G 0 0 NM L=2u W=10u AD=20p AS=20p PD=24u PS=24u${multiplier}`,
      '.MODEL NM NMOS (LEVEL=1 VTO=0.8 KP=5e-5 LAMBDA=0.02 GAMMA=0.4 PHI=0.7 TOX=2e-8 CGSO=3e-10'
        + ' CGDO=3e-10 CGBO=2e-10 CJ=4e-4 CJSW=3e-10 MJ=0.5 MJSW=0.33 PB=0.8)',
      '.TRAN 0.05n 20n 0 0.05n',
      '.END',
    ].join('\n');
    // ngspice-47 `meas tran ... find ... at=` on the identical M=4 deck (6 significant digits).
    // Without M (M=1) ngspice gives v(g) = 2.17263 V at 1.5 ns and v(out) = 5.00000 V at 12 ns.
    const references: ReadonlyArray<readonly ['OUT' | 'G', number, number]> = [
      ['OUT', 2e-9, 6.33517e-1], ['OUT', 2.5e-9, 2.92196e-1], ['OUT', 3e-9, 2.45294e-1],
      ['OUT', 4e-9, 2.33107e-1], ['OUT', 10.5e-9, 2.18277e-1], ['OUT', 11e-9, 6.13792e-1],
      ['OUT', 12e-9, 4.92952], ['G', 1.5e-9, 1.44604], ['G', 2e-9, 3.29574], ['G', 10.2e-9, 4.73644],
    ];
    const gateCurrent: ReadonlyArray<readonly [number, number]> = [[1.6e-9, -5.78053e-4], [2e-9, -8.52132e-4]];

    const tran = (await simulate(deck(' M=4'))).transient!;
    const time = [...tran.time];
    const sample = (values: ArrayLike<number>, t: number): number => {
      const i = time.findIndex(point => point >= t - 1e-18);
      if (Math.abs(time[i] - t) < 1e-18) return values[i];
      const fraction = (t - time[i - 1]) / (time[i] - time[i - 1]);
      return values[i - 1] + fraction * (values[i] - values[i - 1]);
    };
    for (const [node, t, expected] of references) {
      // 5 mV: ngspice's 6-digit meas output plus the step-control difference on the 1 ns edges.
      close(sample(tran.voltage(node), t), expected, 0, 5e-3);
    }
    for (const [t, expected] of gateCurrent) close(sample(tran.current('VIN'), t), expected, 0.01, 0);

    // M=4 is exactly four parallel M=1 instances (same charges, same conductances).
    const parallel = (await simulate(deck('').replace(
      /^M1 (.*)$/m, (_line, rest: string) => [1, 2, 3, 4].map(i => `M${i} ${rest}`).join('\n'),
    ))).transient!;
    const parallelOut = [...parallel.voltage('OUT')];
    const parallelTime = [...parallel.time];
    expect(parallelTime).toHaveLength(time.length);
    const out = [...tran.voltage('OUT')];
    for (let i = 0; i < time.length; i++) {
      expect(parallelTime[i]).toBeCloseTo(time[i], 20);
      close(out[i], parallelOut[i], 1e-6, 1e-9);
    }
  });

  it('divides the NLEV=2 flicker noise density by M, as mos1noi.c does', async () => {
    const deck = `
      VDD vdd 0 DC 5
      Vgate gate 0 DC 2 AC 1
      Rload vdd out 2k
      M1 out gate 0 0 NMOD W=10u L=1u M=3
      .model NMOD NMOS (LEVEL=1 VTO=0.7 KP=200u LAMBDA=0.02 KF=1e-25 AF=1)
      .noise v(out) Vgate dec 3 10 10k
    `;
    const noise = (await simulate(deck)).noise!;
    // ngspice-47 (numdgt=15): onoise_spectrum / inoise_spectrum at 10 Hz and 10 kHz, totals.
    close(noise.outputNoiseDensity[0], 3.197982280692327e-7, 2e-6, 0);
    close(noise.inputNoiseDensity[0], 9.825025450065968e-7, 2e-6, 0);
    close(noise.outputNoiseDensity.at(-1)!, 1.015106609101818e-8, 2e-6, 0);
    close(noise.inputNoiseDensity.at(-1)!, 3.118669021141790e-8, 2e-6, 0);
    close(noise.integratedOutputNoise!, 2.659380162583897e-6, 2e-6, 0);
    close(noise.integratedInputNoise!, 8.170300985260868e-6, 2e-6, 0);
  });
});
