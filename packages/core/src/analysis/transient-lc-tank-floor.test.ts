import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Lossless LC tanks with a user TSTEP at or below the 1e-13 s LTE floor
// (review of PR #377). Every accepted step is LTE-unchecked by design there,
// which must not trigger the order-1 (Backward Euler) restart: BE damps the
// tank. References: ngspice-47 (Homebrew, KLU) on the identical netlist plus
//   .control / set numdgt=15 / run / wrdata out.txt v(1) / .endc
// sampled at every 800th (tank A) or 80th (tank B) ngspice timepoint plus the
// final point. ngspice timepoints are its own; spice-ts is interpolated onto
// them with a cubic Hermite through its accepted points.

const TANK_A = `lc tank 10 GHz
L1 1 0 1n
C1 1 0 0.25p IC=1
.tran 5e-14 2n UIC
.end
`;

const TANK_B = `lc tank 5 THz
L1 1 0 1p
C1 1 0 1f IC=1
.tran 1e-14 4e-11 UIC
.end
`;

const NGSPICE_TANK_A: ReadonlyArray<readonly [number, number]> = [
  [3.949800000000038e-11, -0.7999875257097726],
  [7.94980000000023e-11, 0.310293556840955],
  [1.194980000000034e-10, 0.291955523282695],
  [1.59497999999995e-10, -0.788301384728416],
  [1.994979999999866e-10, 0.9987007670926813],
  [2.394979999999817e-10, -0.8468339229367893],
  [2.79497999999994e-10, 0.3877886527096823],
  [3.194980000000062e-10, 0.2119221066544249],
  [3.594980000000185e-10, -0.7347607693671243],
  [3.994980000000308e-10, 0.9910741423391539],
  [4.39498000000043e-10, -0.8878877516411573],
  [4.794980000000552e-10, 0.4626311713938716],
  [5.194980000000675e-10, 0.1304390866374686],
  [5.594980000000798e-10, -0.6761941955633114],
  [5.994980000000921e-10, 0.9766683077251446],
  [6.394980000001043e-10, -0.9228681927514746],
  [6.794980000001166e-10, 0.5343091702254876],
  [7.194980000001289e-10, 0.04806382868934148],
  [7.594980000001411e-10, -0.6130022742074059],
  [7.994980000001534e-10, 0.9555818029782972],
  [8.394980000001657e-10, -0.9515359707774638],
  [8.794980000001779e-10, 0.6023323526911882],
  [9.194980000001902e-10, -0.0346401985884967],
  [9.594980000002025e-10, -0.5456172547932012],
  [9.994980000002148e-10, 0.9279588653809467],
  [1.039498000000227e-09, -0.9736949905177615],
  [1.079498000000239e-09, 0.6662354221904173],
  [1.119498000000252e-09, -0.117107277725206],
  [1.159498000000264e-09, -0.474500068716771],
  [1.199498000000276e-09, 0.893988443148863],
  [1.239498000000288e-09, -0.9891936784031281],
  [1.279498000000301e-09, 0.7255812647875343],
  [1.319498000000313e-09, -0.1987733120380421],
  [1.359498000000325e-09, -0.4001371763835605],
  [1.399498000000337e-09, 0.8539029029754777],
  [1.43949800000035e-09, -0.9979260192998599],
  [1.479498000000362e-09, 0.7799639391870131],
  [1.519498000000374e-09, -0.2790796842032031],
  [1.559498000000387e-09, -0.3230372396902093],
  [1.599498000000399e-09, 0.8079764405819401],
  [1.639498000000411e-09, -0.9998322816813134],
  [1.679498000000423e-09, 0.8290114534794819],
  [1.719498000000436e-09, -0.3574770773464152],
  [1.759498000000448e-09, -0.2437276426423442],
  [1.79949800000046e-09, 0.7565232051458124],
  [1.839498000000472e-09, -0.9948994262074382],
  [1.879498000000415e-09, 0.8723883096649905],
  [1.919498000000262e-09, -0.4334292325159603],
  [1.959498000000109e-09, -0.1627508839082237],
  [1.999497999999955e-09, 0.6998951504373796],
  [2e-09, 0.6768694810436211]
];

const NGSPICE_TANK_B: ReadonlyArray<readonly [number, number]> = [
  [6.995999999999992e-13, -0.9987715788468899],
  [1.499599999999996e-12, -0.9959807712062543],
  [2.299600000000002e-12, -0.9914138900669142],
  [3.099600000000015e-12, -0.9850790792774236],
  [3.899600000000028e-12, -0.9769876353305391],
  [4.69960000000004e-12, -0.9671539872188355],
  [5.499600000000053e-12, -0.9555956707043658],
  [6.299600000000066e-12, -0.9423332970481528],
  [7.099600000000079e-12, -0.9273905162553566],
  [7.89960000000009e-12, -0.9107939749016258],
  [8.699600000000103e-12, -0.8925732686158314],
  [9.499600000000116e-12, -0.8727608893039424],
  [1.029960000000013e-11, -0.8513921672081245],
  [1.109960000000014e-11, -0.8285052079044253],
  [1.189960000000015e-11, -0.8041408243513462],
  [1.269960000000017e-11, -0.7783424641105186],
  [1.349960000000018e-11, -0.7511561318692408],
  [1.429960000000019e-11, -0.7226303074030368],
  [1.509960000000012e-11, -0.6928158591245663],
  [1.58996e-11, -0.661765953372973],
  [1.669959999999988e-11, -0.629535959605517],
  [1.749959999999977e-11, -0.5961833516605],
  [1.829959999999965e-11, -0.561767605267569],
  [1.909959999999953e-11, -0.5263500919881772],
  [1.989959999999942e-11, -0.4899939697753124],
  [2.06995999999993e-11, -0.4527640703476621],
  [2.149959999999918e-11, -0.4147267835790538],
  [2.229959999999907e-11, -0.3759499391093234],
  [2.309959999999895e-11, -0.336502685387732],
  [2.389959999999883e-11, -0.296455366364642],
  [2.469959999999872e-11, -0.2558793960513167],
  [2.54995999999986e-11, -0.214847131171541],
  [2.629959999999849e-11, -0.1734317421321627],
  [2.709959999999837e-11, -0.1317070825426495],
  [2.789959999999825e-11, -0.08974755751631291],
  [2.869959999999814e-11, -0.04762799098808607],
  [2.949959999999815e-11, -0.005423492285427968],
  [3.029959999999829e-11, 0.03679067780968859],
  [3.109959999999843e-11, 0.07893924126886755],
  [3.189959999999857e-11, 0.1209470370561416],
  [3.269959999999872e-11, 0.1627391551581922],
  [3.349959999999886e-11, 0.2042410701669372],
  [3.4299599999999e-11, 0.2453787741762762],
  [3.509959999999914e-11, 0.2860789087560066],
  [3.589959999999928e-11, 0.3262688957675626],
  [3.669959999999943e-11, 0.3658770667883092],
  [3.749959999999957e-11, 0.4048327909136036],
  [3.829959999999971e-11, 0.4430666007086879],
  [3.909959999999985e-11, 0.4805103160858598],
  [3.989959999999999e-11, 0.517097165885978],
  [4e-11, -0.5091786705645576]
];

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

async function tankError(netlist: string, reference: ReadonlyArray<readonly [number, number]>) {
  const result = await simulate(netlist);
  const transient = result.transient!;
  const time = transient.time;
  const v = transient.voltage('1');
  const scale = Math.max(...reference.map(([, value]) => Math.abs(value)));
  let absMax = 0;
  let sumSquares = 0;
  for (const [t, expected] of reference) {
    const error = Math.abs(interpolate(time, v, t) - expected);
    absMax = Math.max(absMax, error);
    sumSquares += error * error;
  }
  const absRms = Math.sqrt(sumSquares / reference.length);
  const finalPeak = Math.max(...Array.from(v).filter((_, i) => time[i] > 0.9 * time[time.length - 1]).map(Math.abs));
  return { absMax, absRms, relMax: absMax / scale, relRms: absRms / scale, finalPeak };
}

describe('lossless LC tank with a sub-LTE-floor TSTEP (PR #377 review)', () => {
  it('tracks ngspice-47 on the 10 GHz tank with .tran 5e-14 2n UIC', async () => {
    const error = await tankError(TANK_A, NGSPICE_TANK_A);
    expect(error.finalPeak).toBeGreaterThan(0.9999);
    expect(error.absMax).toBeLessThan(1e-6);
    expect(error.absRms).toBeLessThan(5e-7);
    expect(error.relMax).toBeLessThan(1e-6);
    expect(error.relRms).toBeLessThan(5e-7);
  });

  it('tracks ngspice-47 on the 5 THz tank with .tran 1e-14 4e-11 UIC', async () => {
    const error = await tankError(TANK_B, NGSPICE_TANK_B);
    expect(error.finalPeak).toBeGreaterThan(0.999);
    expect(error.absMax).toBeLessThan(1e-2);
    expect(error.absRms).toBeLessThan(5e-3);
    expect(error.relMax).toBeLessThan(1e-2);
    expect(error.relRms).toBeLessThan(5e-3);
  });
});
