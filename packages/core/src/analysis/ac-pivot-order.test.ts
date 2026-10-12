import { describe, it, expect } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * #732: the complex AC LU kept any natural diagonal >= 1e-18 as pivot, so a
 * diagonal that collapses by cancellation (node 4 below: 1 - 1/1.001 - ... ~ 3e-12)
 * was accepted against O(1) column entries and the answer depended on card order.
 *
 * Reference: ngspice-47 batch run of the same netlists (`set numdgt=17`,
 * `print vr(n) vi(n)`), identical for every card order below.
 */
const ELEMENTS = [
  'VIN 1 0 AC 1',
  'R 1 2 1K',
  'C 3 0 1pf',
  'VMON 2 3 0',
  'L1 4 0 1u',
  'R4 1 4 1',
];
const ORDERS: Record<string, number[]> = {
  'as filed': [0, 1, 2, 3, 4, 5],
  'L1, R4 first': [4, 5, 0, 1, 2, 3],
  reversed: [5, 4, 3, 2, 1, 0],
  'VMON first': [3, 2, 1, 0, 5, 4],
};

// ngspice-47: frequencies 1e6, 80.0774715459476858e6, 159.154943091895372e6
const NGSPICE: Record<string, Array<[number, number]>> = {
  '1': [[1, 0], [1, 0], [1, 0]],
  '2': [
    [9.99960523140879465e-1, -6.2829372667583859e-3],
    [7.97988136404637061e-1, -4.0150102186929920e-1],
    [4.99999999999999889e-1, -5.0e-1],
  ],
  '3': [
    [9.99960523140879465e-1, -6.2829372667583859e-3],
    [7.97988136404637061e-1, -4.0150102186929920e-1],
    [4.99999999999999889e-1, -5.0e-1],
  ],
  '4': [
    [9.75295476968142339e-1, 1.55223096134647631e-1],
    [9.99996049811283316e-1, 1.98750424217020551e-3],
    [9.99999000000999949e-1, 9.99999000000999748e-4],
  ],
};

function deck(order: number[]): string {
  return [
    'order dependence',
    ...order.map(i => ELEMENTS[i]),
    '.AC LIN 3 1MEG 159.15494309189535MEG',
    '.end',
  ].join('\n');
}

describe('complex AC LU pivoting (#732)', () => {
  for (const [label, order] of Object.entries(ORDERS)) {
    it(`matches ngspice-47 independent of card order (${label})`, async () => {
      const result = await simulate(deck(order));
      for (const [node, expected] of Object.entries(NGSPICE)) {
        const points = result.ac!.voltage(node);
        expect(points).toHaveLength(expected.length);
        points.forEach((point, k) => {
          const re = point.magnitude * Math.cos((point.phase * Math.PI) / 180);
          const im = point.magnitude * Math.sin((point.phase * Math.PI) / 180);
          const [eRe, eIm] = expected[k];
          const err = Math.hypot(re - eRe, im - eIm) / Math.hypot(eRe, eIm);
          expect(err, `v(${node}) at point ${k}`).toBeLessThan(1e-9);
        });
      }
    });
  }
});
