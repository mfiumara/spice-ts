import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #403: ngspice-47 integrates the diode junction charge q(v) (dioload.c
// DIOcapCharge + NIintegrate), not C(v)*dv/dt. Decks and full ngspice output
// are in benchmarks/results/issue-403/ngspice; references below are every
// 2 ns of ngspice's `linearize`d v(out) on the identical deck.

const pulseDeck = (model: string) => `diode junction charge
V1 in 0 PULSE(-1 1 0 1n 1n 20n 50n)
R1 in out 1k
D1 out 0 DM
.model DM D ${model}
.tran 0.1n 50n
.end
`;

// tran_vj1.cir: depletion charge only.
const DEPLETION_REFERENCE: ReadonlyArray<readonly [number, number]> = [
  [0, -9.99999998990e-01], [2e-9, -6.36091936196e-01], [4e-9, -2.86043406633e-01],
  [6e-9, -3.74037703664e-02], [8e-9, 1.455262021755e-01], [10e-9, 2.840148001406e-01],
  [12e-9, 3.913717509640e-01], [14e-9, 4.762337082214e-01], [16e-9, 5.439320274002e-01],
  [18e-9, 5.947034156537e-01], [20e-9, 6.211006606318e-01], [22e-9, 5.742672200549e-01],
  [24e-9, 3.600587902596e-01], [26e-9, 1.441508297397e-01], [28e-9, -5.92777553443e-02],
  [30e-9, -2.40981743187e-01], [32e-9, -3.96842115208e-01], [34e-9, -5.26465806591e-01],
  [36e-9, -6.31751844117e-01], [38e-9, -7.15740163471e-01], [40e-9, -7.81823410686e-01],
  [42e-9, -8.33277220648e-01], [44e-9, -8.73023028045e-01], [46e-9, -9.03540438807e-01],
  [48e-9, -9.26865472052e-01], [50e-9, -9.44633130572e-01],
];

// tran_tt.cir: depletion plus diffusion (TT) charge, i.e. reverse recovery.
const DIFFUSION_REFERENCE: ReadonlyArray<readonly [number, number]> = [
  [0, -9.99999998990e-01], [2e-9, -3.71040984042e-01], [4e-9, 9.946512725977e-02],
  [6e-9, 3.624814286216e-01], [8e-9, 5.191761311434e-01], [10e-9, 5.856220782960e-01],
  [12e-9, 6.063779237821e-01], [14e-9, 6.156950580386e-01], [16e-9, 6.207794118034e-01],
  [18e-9, 6.238198316210e-01], [20e-9, 6.257296724052e-01], [22e-9, 6.102150126819e-01],
  [24e-9, 3.003544157358e-01], [26e-9, -1.10756636568e-01], [28e-9, -4.33424685902e-01],
  [30e-9, -6.54020278733e-01], [32e-9, -7.93970966813e-01], [34e-9, -8.79102490262e-01],
  [36e-9, -9.29661449117e-01], [38e-9, -9.59278746026e-01], [40e-9, -9.76492360580e-01],
  [42e-9, -9.86451773724e-01], [44e-9, -9.92199103289e-01], [46e-9, -9.95510789975e-01],
  [48e-9, -9.97417387916e-01], [50e-9, -9.98514648775e-01],
];

function interpolate(time: number, times: ArrayLike<number>, values: ArrayLike<number>): number {
  let index = 1;
  while (index < times.length - 1 && times[index] < time) index++;
  const start = times[index - 1];
  const end = times[index];
  if (end === start) return values[index];
  return values[index - 1] + (values[index] - values[index - 1]) * (time - start) / (end - start);
}

async function maxDeviation(
  model: string,
  reference: ReadonlyArray<readonly [number, number]>,
): Promise<number> {
  const result = await simulate(pulseDeck(model));
  const time = result.transient!.time;
  const out = result.transient!.voltage('out');
  return Math.max(...reference.map(([t, v]) => Math.abs(interpolate(t, time, out) - v)));
}

describe('diode junction charge integration matches ngspice-47 (#403)', () => {
  it('integrates the nonlinear depletion charge through forward bias and back', async () => {
    // Before #403 (C(v)*dv/dt companion): 11.2 mV max over ngspice's 501 points.
    expect(await maxDeviation('IS=1e-14 CJO=10p VJ=1', DEPLETION_REFERENCE)).toBeLessThan(1e-3);
  });

  it('integrates the diffusion charge TT*Id through reverse recovery', async () => {
    // Before #403: 19.3 mV max over ngspice's 501 points.
    expect(await maxDeviation('IS=1e-14 CJO=5p VJ=0.8 M=0.4 TT=5n', DIFFUSION_REFERENCE))
      .toBeLessThan(2e-3);
  });
});

describe('negligible junction charge leaves the transient endpoint unchanged (#389)', () => {
  // Level-1 adaptation of Xyce DIODE/Level2_Temp_Dep_Breakdown.cir, identical
  // to benchmarks/results/issue-403/ngspice/l1_{cjo,nocjo}_27.cir.
  const deck = (cjo: string) => `diode breakdown
.tran 1m 1 0 100m
VIN 1 0 pulse ( 7.5 10 1m 1 1 3 6)
R1  1 2 1k
DZR 0 2 DZR
.MODEL DZR D(IS=1E-14 RS=0 N=1 TT=0 ${cjo} VJ=1 M=.5 EG=1.11 XTI=3 KF=0 AF=1 FC=.5
+ BV=7.255 IBV=.001 tbv1=0.00013 tbv2=-5e-8)
.end
`;
  // ngspice-47 v(2) at t = 1 s, with and without CJO=1P (identical).
  const NGSPICE_ENDPOINT = 7.280849981115;

  it('matches ngspice with CJO=1P as closely as without it', async () => {
    const endpoint = async (cjo: string) => (await simulate(deck(cjo))).transient!.voltage('2').at(-1)!;
    const withCharge = await endpoint('CJO=1P');
    const without = await endpoint('');

    // Before #403: 4.1e-6 V from ngspice with CJO=1P, 3.5e-7 V without it.
    expect(Math.abs(withCharge - NGSPICE_ENDPOINT)).toBeLessThan(1e-6);
    expect(Math.abs(withCharge - without)).toBeLessThan(1e-7);
  });
});
