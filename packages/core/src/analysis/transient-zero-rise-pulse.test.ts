import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// A PULSE with zero delay and zero rise is the usual way to write a step at
// t=0 (review of PR #377). ngspice uses TSTEP as the rise/fall time when
// TR/TF is 0, so the source is still V1 at t=0: the DC operating point stays
// at V1 and the circuit responds to the edge during the first TSTEP.
// References: ngspice-47 (Homebrew, KLU) on the identical netlist plus
//   .control / set numdgt=15 / run / wrdata out.txt v(<node>) / .endc
// sampled at every 50th (RC), 40th (RC pulse train) or 1000th (RLC) ngspice
// timepoint plus the final point. spice-ts is interpolated onto those times
// with a cubic Hermite through its accepted points.

const RC_STEP = `zero rise rc
V1 1 0 PULSE(0 1 0 0 0 1 2)
R1 1 2 1k
C1 2 0 1p
.tran 1e-11 5n
.end
`;

const RC_PULSE_TRAIN = `zero rise rc pulse train
V1 1 0 PULSE(0 1 0 0 0 2n 4n)
R1 1 2 1k
C1 2 0 1p
.tran 1e-11 8n
.end
`;

const RLC_STEP = `zero rise rlc
V1 1 0 PULSE(0 1 0 0 0 1 2)
R1 1 2 0.5
L1 2 3 1n
C1 3 0 0.2p
.tran 5e-14 1n
.end
`;

type Reference = ReadonlyArray<readonly [number, number]>;

const NGSPICE_RC_STEP: Reference = [
  [0.0, 0.0],
  [3.996000000000002e-10, 0.3260498320994007],
  [8.995999999999988e-10, 0.5912302632861459],
  [1.399599999999997e-09, 0.7520696549811424],
  [1.899599999999996e-09, 0.8496232708533442],
  [2.399600000000005e-09, 0.9087922833039026],
  [2.899600000000013e-09, 0.9446799539255669],
  [3.399600000000022e-09, 0.9664468357663849],
  [3.899600000000023e-09, 0.979649061958969],
  [4.399600000000011e-09, 0.9876565835559877],
  [4.899599999999999e-09, 0.9925133706759334],
  [5e-09, 0.9932285320210638],
];

const NGSPICE_RC_PULSE_TRAIN: Reference = [
  [0.0, 0.0],
  [2.996e-10, 0.2551692535027166],
  [6.995999999999995e-10, 0.5007266839913082],
  [1.099599999999998e-09, 0.6653282034199379],
  [1.499599999999997e-09, 0.7756635337103109],
  [1.899599999999996e-09, 0.8496232708533442],
  [2.230500000000004e-09, 0.6980890670173895],
  [2.630500000000011e-09, 0.4679415357089586],
  [3.030500000000018e-09, 0.3136695461758379],
  [3.430500000000025e-09, 0.2102582837599399],
  [3.830500000000027e-09, 0.1409398726419323],
  [4.170499999999996e-09, 0.2528855714367245],
  [4.570499999999986e-09, 0.4991958912264285],
  [4.970499999999977e-09, 0.6643020857637629],
  [5.370499999999967e-09, 0.7749757087685731],
  [5.770499999999957e-09, 0.8491622095436319],
  [6.110499999999998e-09, 0.8015156126221995],
  [6.510499999999988e-09, 0.537270191420713],
  [6.910499999999979e-09, 0.3601417789541064],
  [7.310499999999969e-09, 0.241409449136299],
  [7.71049999999996e-09, 0.161821053645981],
  [8e-09, 0.1211450651159481],
];

const NGSPICE_RLC_STEP: Reference = [
  [0.0, 0.0],
  [4.949800000000086e-11, 1.926771260864604],
  [9.949800000000327e-11, 0.2843078971668797],
  [1.494979999999971e-10, 1.401450919632104],
  [1.994979999999866e-10, 0.9658212918847723],
  [2.494979999999847e-10, 0.6707989459452615],
  [2.994980000000001e-10, 1.633759744122358],
  [3.494980000000154e-10, 0.1651681000791584],
  [3.994980000000308e-10, 1.904525283396642],
  [4.494980000000461e-10, 0.1644696724209091],
  [4.994980000000614e-10, 1.641718800299195],
  [5.494980000000767e-10, 0.6444796936324592],
  [5.994980000000921e-10, 1.022553446192154],
  [6.494980000001074e-10, 1.305607610577388],
  [6.994980000001227e-10, 0.4206102207741196],
  [7.494980000001381e-10, 1.758678250269369],
  [7.994980000001534e-10, 0.181342656308681],
  [8.494980000001687e-10, 1.753190483975321],
  [8.994980000001841e-10, 0.4247117571542645],
  [9.494980000001994e-10, 1.314665472054985],
  [9.994980000002148e-10, 0.9871706925705441],
  [1e-09, 1.014815883645007],
];

// ngspice-47 global maximum of V(3) on RLC_STEP (first overshoot).
const NGSPICE_RLC_PEAK = 1.9889534830016;

/** Cubic Hermite (Catmull-Rom slopes) through (time, value) at t. */
function interpolate(time: Float64Array | number[], value: Float64Array | number[], t: number): number {
  let hi = 1;
  while (hi < time.length - 1 && time[hi] < t) hi++;
  const lo = hi - 1;
  const h = time[hi] - time[lo];
  const slope = (i: number): number => {
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, time.length - 1);
    return (value[b] - value[a]) / (time[b] - time[a]);
  };
  const s = (t - time[lo]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * value[lo] + (s3 - 2 * s2 + s) * h * slope(lo)
    + (-2 * s3 + 3 * s2) * value[hi] + (s3 - s2) * h * slope(hi);
}

async function compare(netlist: string, node: string, reference: Reference) {
  const transient = (await simulate(netlist)).transient!;
  const time = transient.time;
  const v = transient.voltage(node);
  let absMax = 0;
  for (const [t, expected] of reference) {
    absMax = Math.max(absMax, Math.abs(interpolate(time, v, t) - expected));
  }
  return { atZero: v[0], absMax, peak: Math.max(...Array.from(v)) };
}

describe('PULSE with zero delay and zero rise (PR #377 review)', () => {
  it('keeps the RC output at V1 at t=0 and charges with tau=1ns like ngspice-47', async () => {
    const { atZero, absMax } = await compare(RC_STEP, '2', NGSPICE_RC_STEP);
    expect(atZero).toBe(0);
    expect(absMax).toBeLessThan(5e-3);
  });

  it('tracks ngspice-47 on a zero-rise zero-fall RC pulse train', async () => {
    const { atZero, absMax } = await compare(RC_PULSE_TRAIN, '2', NGSPICE_RC_PULSE_TRAIN);
    expect(atZero).toBe(0);
    expect(absMax).toBeLessThan(5e-3);
  });

  it('starts the underdamped RLC at 0 and rings to the ngspice-47 overshoot', async () => {
    const { atZero, absMax, peak } = await compare(RLC_STEP, '3', NGSPICE_RLC_STEP);
    // Math.abs: the sign of an exact zero depends on LU elimination order.
    expect(Math.abs(atZero)).toBe(0);
    expect(Math.abs(peak - NGSPICE_RLC_PEAK)).toBeLessThan(1e-3);
    expect(absMax).toBeLessThan(5e-3);
  });
});
