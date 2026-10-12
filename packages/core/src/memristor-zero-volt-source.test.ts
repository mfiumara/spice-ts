import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

// Issue #650: Pershin/Di Ventra memristor (ngspice examples/memristor),
// flattened to the top level. Vx is a 0 V source, so every converged
// transient point must have v(x) == v(x1), as ngspice-47 reports.
const MEMRISTOR_DECK = `memristor (Pershin/Di Ventra, ngspice examples/memristor) flattened to the top level
.param stime=10n Ron=1K Roff=10K alpha=0 beta=20e3/stime Vt=1.6
.func f1(y)={beta*y+0.5*(alpha-beta)*(abs(y+Vt)-abs(y-Vt))}
V1 0 1 DC 0 sin(0 3 '1/stime')
Bx 0 x I=((f1(V(1))> 0) && (V(x) < Roff)) ? f1(V(1)) : ((((f1(V(1)) < 0) && (V(x)>Ron)) ? f1(V(1)) : 0))
Vx x x1 dc 0
Cx x1 0 1
Bm 1 0 I=V(1)/V(x)
.ic v(x1)=7000
.tran 0.1n 10n
.end
`;

// ngspice-47 (\`ngspice -b\`, wrdata) v(x) on the identical deck; v(x1) is
// bit-identical at every point.
const NGSPICE_47_VX: ReadonlyArray<readonly [number, number]> = [
  [8.28e-10, 7000],
  [1.628e-9, 6238.468543336],
  [2.428e-9, 4257.678273987],
  [3.228e-9, 2170.088574963],
  [4.028e-9, 1125.451045596],
  [4.828e-9, 1113.412428929],
  [5.628e-9, 1113.412428929],
  [6.428e-9, 1532.835278848],
  [7.228e-9, 3303.911970081],
  [8.028e-9, 5476.628976674],
  [8.828e-9, 6880.175340712],
  [9.628e-9, 7000],
  [1e-8, 7000],
];

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let hi = 1;
  while (hi < time.length - 1 && time[hi] < at) hi++;
  const lo = hi - 1;
  const span = time[hi] - time[lo];
  const w = span > 0 ? (at - time[lo]) / span : 0;
  return values[lo] + w * (values[hi] - values[lo]);
}

describe('memristor deck: 0 V source between B-source state node and capacitor (#650)', () => {
  it('keeps v(x) == v(x1) across the 0 V source at every accepted point', async () => {
    const { transient } = await simulate(MEMRISTOR_DECK);
    const vx = transient!.voltage('x');
    const vx1 = transient!.voltage('x1');
    let worst = 0;
    for (let i = 0; i < vx.length; i++) worst = Math.max(worst, Math.abs(vx[i] - vx1[i]));
    expect(worst).toBeLessThan(1e-6);
  });

  it('tracks the ngspice-47 v(x) state waveform', async () => {
    const { transient } = await simulate(MEMRISTOR_DECK);
    const time = transient!.time;
    const vx = transient!.voltage('x');
    const vx1 = transient!.voltage('x1');
    for (const [at, reference] of NGSPICE_47_VX) {
      // 1% of the 7 kOhm state swing (Roff - Ron range), well above the
      // trapezoidal/LTE grid difference and far below the 5.6 kV #650 error.
      expect(Math.abs(interpolate(time, vx, at) - reference)).toBeLessThan(70);
      expect(Math.abs(interpolate(time, vx1, at) - reference)).toBeLessThan(70);
    }
  });
});
