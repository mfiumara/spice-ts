import { describe, expect, it } from 'vitest';
import { simulate, simulateStream } from '../simulate.js';

// Issue #856: under `.tran ... uic` spice-ts saved a t = 0 row taken from the
// UIC seed, which holds only the .ic / IC= values: every source-driven node
// read 0 V there (v(input) = 0 on corpus-h diode-envelope-detector, a 0.5 V
// error against the ngspice fine-step reference). ngspice-47 writes no t = 0
// row in UIC mode at all; dctran.c guards CKTdump with
//   (MODEUIC && CKTtime > 0 && CKTtime >= CKTinitTime)
//   || (!MODEUIC && CKTtime >= CKTinitTime)
// so its first output point is the first accepted step.

const deck = (source: string, uic: boolean): string => `uic t0 #856
V1 in 0 ${source}
R1 in out 1k
C1 out 0 1u IC=0
.tran 10u 50u 0 1u${uic ? ' UIC' : ''}
.end
`;

// ngspice-47 `ngspice -b`, `wrdata` of v(in) v(out), first three rows.
const NGSPICE_DC: ReadonlyArray<readonly [number, number, number]> = [
  [5e-9, 1.0, 4.999975e-6],
  [1e-8, 1.0, 9.999925e-6],
  [2e-8, 1.0, 1.9999775e-5],
];
const NGSPICE_SIN: ReadonlyArray<readonly [number, number, number]> = [
  [5e-9, 5.00031416e-1, 2.50014458e-6],
  [1e-8, 5.00062832e-1, 5.00043374e-6],
  [2e-8, 5.00125664e-1, 1.00013012e-5],
];

describe('uic writes no t = 0 row, like ngspice-47 (#856)', () => {
  const cases = [
    { source: 'DC 1', rows: NGSPICE_DC },
    { source: 'SIN(0.5 1 1k)', rows: NGSPICE_SIN },
  ] as const;

  for (const { source, rows } of cases) {
    it(`starts V1 ${source} at the first accepted step`, async () => {
      const transient = (await simulate(deck(source, true))).transient!;
      const time = transient.time;
      const vin = transient.voltage('in');
      const vout = transient.voltage('out');
      expect(time[0]).toBeGreaterThan(0);
      rows.forEach(([t, inV, outV], index) => {
        expect(time[index]).toBeCloseTo(t, 15);
        expect(Math.abs(vin[index]! - inV)).toBeLessThan(1e-7);
        expect(Math.abs(vout[index]! - outV) / outV).toBeLessThan(1e-5);
      });
    });
  }

  it('streams the same points as simulate()', async () => {
    const times: number[] = [];
    for await (const step of simulateStream(deck('DC 1', true))) {
      if ('time' in step) times.push(step.time);
    }
    const transient = (await simulate(deck('DC 1', true))).transient!;
    expect(times[0]).toBeGreaterThan(0);
    expect(times).toEqual(transient.time);
  });

  it('still writes the t = 0 operating point without uic', async () => {
    const transient = (await simulate(deck('DC 1', false))).transient!;
    expect(transient.time[0]).toBe(0);
    expect(transient.voltage('in')[0]).toBeCloseTo(1, 12);
    expect(transient.voltage('out')[0]).toBeCloseTo(1, 12);
  });
});
