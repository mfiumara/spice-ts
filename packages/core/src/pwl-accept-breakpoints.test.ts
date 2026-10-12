import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';

// ngspice-47 vsrcacct.c requests each PWL corner on accept as
// `CKTtime + corner - CKTtime` (with TD=0 and no R=), so the breakpoint can
// sit one ulp off the corner literal and the step lands there. spice-ts used
// the corner value itself for a PWL without TD=/R=, and the grids parted at
// the first such corner. With the #749 literals that moved the adc_bridge
// threshold crossing at 1.5001u in xspice-digital.test.ts by one step.
// Reference: ngspice-47 (Homebrew, arm64), `set numdgt=17`, `wrdata` time.
const DECK = [
  'pwl accept-time breakpoints',
  'v1 1 0 DC 0 PWL(0 0 1u 0 1.001u 1 1.5u 1 1.501u 0 4u 0 4.001u 1 7u 1 7.001u 0)',
  'r1 1 0 1k',
  '.tran 10n 10u',
  '.end',
].join('\n');

const NGSPICE_47_POINTS: [number, number][] = [
  [166, 1.488849999999997e-6],
  [167, 1.4944249999999986e-6],
  [168, 1.5000000000000002e-6],
  [169, 1.5001000000000003e-6],
  [170, 1.5003000000000003e-6],
  [171, 1.5006500000000002e-6],
  [428, 3.994424999999989e-6],
  [429, 4e-6],
  [430, 4.0001e-6],
  [431, 4.0003000000000005e-6],
  [1051, 9.999999999999999e-6],
];

describe('PWL corners are scheduled on accept like ngspice-47 vsrcacct.c', () => {
  it('reproduces the ngspice-47 time grid of a PWL source bit for bit', async () => {
    const { time } = (await simulate(DECK)).transient!;
    expect(time).toHaveLength(1052);
    for (const [index, expected] of NGSPICE_47_POINTS) expect(time[index], `time[${index}]`).toBe(expected);
  });
});
