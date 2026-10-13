import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../../simulate.js';

/*
 * Issue #838: `.ac` with XSPICE event-driven digital instances. ngspice-47
 * (acan.c) runs the operating point with EVTop, so every digital instance
 * keeps its operating-point state; the AC sweep then loads only the analog
 * instances, which includes the analog halves of adc_bridge/dac_bridge
 * (dac_bridge output: an ideal voltage source with no AC value).
 *
 * Reference: ngspice-47 (Homebrew, KLU build) on the identical deck below,
 * `.control / run / set numdgt=12 / print v(n1) v(n2) v(nf) i(vb) / op`.
 * The digital state matters: d_xor drives ox high, which forward-biases d1
 * (small-signal v(n1) set by its ~60 ohm diode resistance), while d_and
 * keeps oy low and d2 off.
 */
const DECK = [
  'xspice digital gates in .ac: adc_bridge -> d_xor/d_and -> dac_bridge + analog RC and diodes',
  'va a 0 dc 3.3',
  'vb b 0 dc 0 ac 1',
  'abridge1 [a b] [da db] adc',
  'ax [da db] dx gxor',
  'aand [da db] dy gand',
  'adac [dx dy] [ox oy] dac',
  'rx ox n1 10k',
  'd1 n1 0 dmod',
  'c1 b n1 1u',
  'ry oy n2 10k',
  'd2 n2 0 dmod',
  'c2 b n2 1u',
  'rf n1 nf 1k',
  'cf nf 0 100n',
  '.model dmod d(is=1e-14 n=1 cjo=2p)',
  '.model adc adc_bridge(in_low=0.5 in_high=2.5 rise_delay=1n fall_delay=1n)',
  '.model gxor d_xor(rise_delay=1n fall_delay=1n input_load=1p)',
  '.model gand d_and(rise_delay=1n fall_delay=1n input_load=1p)',
  '.model dac dac_bridge(out_low=0 out_high=5 out_undef=2.5 t_rise=1n t_fall=1n)',
  '.ac dec 2 10 100k',
  '.end',
].join('\n');

/** ngspice-47 `print` rows: frequency, then [re, im] per vector. */
const NGSPICE: Record<'v(n1)' | 'v(n2)' | 'v(nf)' | 'i(vb)', [number, number][]> = {
  'v(n1)': [
    [1.503366194771e-05, 3.696856584122e-03], [1.503031155680e-04, 1.168850327243e-02],
    [1.499693599827e-03, 3.689976032555e-02], [1.467544381059e-02, 1.147698876495e-01],
    [1.230278772286e-01, 3.156916177858e-01], [5.536144517652e-01, 4.859592939841e-01],
    [9.224431162376e-01, 2.631836514696e-01], [9.916163160634e-01, 8.977604496987e-02],
    [9.991519262546e-01, 2.861553839192e-02],
  ],
  'v(n2)': [
    [2.830434396793e-01, 4.504767306400e-01], [7.978907219228e-01, 4.015713162242e-01],
    [9.752936220893e-01, 1.552224926289e-01], [9.974713855047e-01, 5.020184922164e-02],
    [9.997447627032e-01, 1.591140047928e-02], [9.999726705010e-01, 5.032773667472e-03],
    [9.999954669960e-01, 1.591539055410e-03], [9.999977467026e-01, 5.032899873768e-04],
    [9.999979746739e-01, 1.591543046495e-04],
  ],
  'v(nf)': [
    [3.826018646820e-05, 3.696616188281e-03], [3.823930877379e-04, 1.168090543666e-02],
    [3.803159646512e-03, 3.666080075743e-02], [3.605584758475e-02, 1.076058876429e-01],
    [2.304175629432e-01, 1.709159931857e-01], [3.070380228905e-01, -1.24099973888e-01],
    [6.364069844380e-02, -1.36682649931e-01], [7.012388493198e-03, -4.95543399096e-02],
    [7.083391535440e-04, -1.58907232286e-02],
  ],
  'i(vb)': [
    [-2.85365681016e-05, -1.07878617736e-04], [-8.21113230699e-05, -2.38819350572e-04],
    [-1.20713971695e-04, -6.42899720507e-04], [-3.27785256262e-04, -1.96278290356e-03],
    [-2.08352321218e-03, -5.51178205984e-03], [-9.75560806778e-03, -8.86985627367e-03],
    [-1.66363158681e-02, -4.87332754231e-03], [-1.79377604342e-02, -1.66621667285e-03],
    [-1.80796726370e-02, -5.34132999577e-04],
  ],
};

describe('XSPICE digital instances in .ac (#838)', () => {
  it('keeps the operating-point digital state and linearises the analog part like ngspice-47', async () => {
    const ac = (await simulate(DECK)).ac!;
    expect(ac.frequencies).toHaveLength(9);
    /*
     * Both engines converge the operating point within RELTOL but stop
     * Newton at different iterates: ngspice-47 `op` on this deck gives
     * v(n1) = 0.633706695165, spice-ts 0.633687757 (the exact root is
     * 0.6336847; ngspice-47 on the same diode with an ideal 5 V source
     * instead of the bridge gives 0.633684560). The diode conductance then
     * differs by exp(dV/Vt) - 1 = 7.3e-4, which bounds the AC difference of
     * every signal d1 loads. The digital state itself is not approximate: a
     * wrong d_xor/d_and output flips d1 or d2 and moves these signals by
     * order one. v(n2) (d2 off) does not depend on the Newton stop point.
     */
    const check = (
      name: string,
      points: { magnitude: number; phase: number }[],
      reference: [number, number][],
      relative: number,
    ) => {
      expect(points).toHaveLength(reference.length);
      points.forEach((point, i) => {
        const [re, im] = reference[i];
        const phase = (point.phase * Math.PI) / 180;
        const error = Math.hypot(point.magnitude * Math.cos(phase) - re, point.magnitude * Math.sin(phase) - im);
        expect(error, `${name} @${i}`).toBeLessThanOrEqual(relative * Math.hypot(re, im));
      });
    };
    check('v(n1)', ac.voltage('n1'), NGSPICE['v(n1)'], 1e-3);
    check('v(nf)', ac.voltage('nf'), NGSPICE['v(nf)'], 1e-3);
    check('i(vb)', ac.current('vb'), NGSPICE['i(vb)'], 1e-3);
    check('v(n2)', ac.voltage('n2'), NGSPICE['v(n2)'], 1e-9);
    // dac_bridge outputs are ideal voltage sources with no AC value.
    for (const point of ac.voltage('ox')) expect(point.magnitude).toBe(0);
    for (const point of ac.voltage('oy')) expect(point.magnitude).toBe(0);
  });

  it('uses the same EVTop operating point as .op (ngspice-47: v(ox) = 5, v(oy) = 0)', async () => {
    const dc = (await simulate(DECK.replace('.ac dec 2 10 100k', '.op'))).dc!;
    expect(dc.voltage('ox')).toBe(5);
    expect(dc.voltage('oy')).toBe(0);
    expect(Math.abs(dc.voltage('n1') - 0.633706695165)).toBeLessThanOrEqual(1e-3 * 0.633706695165);
  });

  it('runs corpus-i eSim half_adder.cir.out (digital only, .ac lin 0 0Hz 0Hz) on identical bytes', async () => {
    const deck = readFileSync(new URL(
      '../../../../../benchmarks/corpus/corpus-i/fixtures/esim/Examples/FullAdder/half_adder.cir.out', import.meta.url,
    ), 'utf8');
    const ac = (await simulate(deck)).ac!;
    // ngspice-47: one AC point at 0 Hz and no analog vectors.
    expect(ac.frequencies).toEqual([0]);
  });
});
