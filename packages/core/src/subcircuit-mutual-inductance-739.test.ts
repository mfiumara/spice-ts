import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

// #739: a K card inside a .subckt couples the instance's own inductors. ngspice-47
// prefixes the coupled inductor names per instance (xa.x1.L1, xa.x2.L1, ...) and
// binds them after every instance exists (MUTsetup), so a K card may precede its
// inductors.

const subcircuits = [
  '.subckt xfmr p s',
  'L1 p 0 1m',
  'K1 L1 L2 0.5',
  'L2 s 0 4m',
  '.ends',
  '.subckt pair a b c',
  'X1 a m xfmr',
  'Rm m b 50',
  'X2 b c xfmr',
  '.ends',
];

const tail = [
  'R3 3 0 100',
  'R4 4 0 1k',
  '.tran 1u 200u 0 0.1u',
  '.end',
];

const nested = [
  'K in subckt transient',
  ...subcircuits,
  'V1 1 0 SIN(0 1 10k)',
  'R1 1 2 10',
  'XA 2 3 4 pair',
  ...tail,
].join('\n');

// The same circuit flattened by hand, with each coupling written at top level.
const flattened = [
  'K flattened',
  'V1 1 0 SIN(0 1 10k)',
  'R1 1 2 10',
  'L1A 2 0 1m',
  'L2A m 0 4m',
  'KA L1A L2A 0.5',
  'Rm m 3 50',
  'L1B 3 0 1m',
  'L2B 4 0 4m',
  'KB L1B L2B 0.5',
  ...tail,
].join('\n');

function at(time: number[], values: number[], t: number): number {
  const i = time.findIndex(x => x >= t);
  if (i <= 0) return values[Math.max(i, 0)];
  const f = (t - time[i - 1]) / (time[i] - time[i - 1]);
  return values[i - 1] + f * (values[i] - values[i - 1]);
}

describe('mutual inductance K cards inside .subckt (#739)', () => {
  it('couples instance-local inductors in nested, repeated instances like ngspice-47', async () => {
    const result = await simulate(nested);
    const time = result.transient!.time;

    // ngspice-47 `print v(2) v(3) v(4)` on the identical deck (rows 500/1000/1500/2000 and the end point).
    const ngspice: [number, number, number, number][] = [
      [4.908381e-05, -2.23308e-01, -9.96193e-03, 2.355549e-02],
      [9.908381e-05, 8.094184e-02, -3.90969e-02, -7.58963e-02],
      [1.490838e-04, -1.59310e-01, 2.468732e-02, 6.017154e-02],
      [1.990838e-04, 1.132116e-01, -2.62640e-02, -6.22063e-02],
      [2.000000e-04, 1.683625e-01, -1.45690e-02, -5.11318e-02],
    ];
    for (const [t, v2, v3, v4] of ngspice) {
      expect(at(time, result.transient!.voltage('2'), t)).toBeCloseTo(v2, 4);
      expect(at(time, result.transient!.voltage('3'), t)).toBeCloseTo(v3, 4);
      expect(at(time, result.transient!.voltage('4'), t)).toBeCloseTo(v4, 4);
    }
  });

  it('matches the hand-flattened top-level coupling', async () => {
    const sub = await simulate(nested);
    const flat = await simulate(flattened);
    expect(sub.transient!.time).toEqual(flat.transient!.time);
    for (const node of ['2', '3', '4']) {
      const a = sub.transient!.voltage(node);
      const b = flat.transient!.voltage(node);
      for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 10);
    }
  });

  it('evaluates a parameterised coupling coefficient per instance', async () => {
    const body = (k: string) => [
      'V1 1 0 SIN(0 1 10k)',
      'R1 1 2 10',
      k,
      'R3 3 0 100',
      '.tran 1u 100u 0 0.1u',
      '.end',
    ];
    const sub = await simulate([
      'K param',
      '.subckt xf p s kc=0.5',
      'K1 L1 L2 {kc}',
      'L1 p 0 1m',
      'L2 s 0 4m',
      '.ends',
      ...body('X1 2 3 xf kc=0.9'),
    ].join('\n'));
    const flat = await simulate(['K param flat', ...body('L1 2 0 1m\nL2 3 0 4m\nK1 L1 L2 0.9')].join('\n'));
    const a = sub.transient!.voltage('3');
    const b = flat.transient!.voltage('3');
    expect(a.length).toBe(b.length);
    expect(Math.max(...b.map(Math.abs))).toBeGreaterThan(0.1);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 10);
  });

  it('accepts a top-level K card before its inductors', async () => {
    const deck = (order: string[]) => [
      'K order',
      'V1 1 0 SIN(0 1 10k)',
      'R1 1 2 10',
      ...order,
      'R3 3 0 100',
      '.tran 1u 100u 0 0.1u',
      '.end',
    ].join('\n');
    const before = await simulate(deck(['K1 L1 L2 0.5', 'L1 2 0 1m', 'L2 3 0 4m']));
    const after = await simulate(deck(['L1 2 0 1m', 'L2 3 0 4m', 'K1 L1 L2 0.5']));
    const a = before.transient!.voltage('3');
    const b = after.transient!.voltage('3');
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 10);
  });

  it('rejects a K card that names an inductor outside the instance', async () => {
    // ngspice-47: "k.x1.k1: coupling to non-existent inductor l.x1.ltop".
    const deck = [
      'K foreign',
      '.subckt bad p',
      'L1 p 0 1m',
      'K1 L1 LTOP 0.5',
      '.ends',
      'V1 1 0 SIN(0 1 10k)',
      'LTOP 1 2 1m',
      'R2 2 0 1',
      'X1 1 bad',
      '.tran 1u 10u',
      '.end',
    ].join('\n');
    await expect(simulate(deck)).rejects.toThrow(/X1\.LTOP/);
  });
});
