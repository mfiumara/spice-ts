import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #608: after a breakpoint ngspice-47 dctran.c sizes the next step from
// CKTsaveDelta, the step it had *before* it was cut to land on the breakpoint
// (or halved to equalise the last two steps before it), limited to
// 0.1 x MIN(saveDelta, gap to the next breakpoint). It also splits the
// remaining gap in two equal steps when the last step would otherwise be
// shorter than CKTdelta (`CKTtime + 1.9 * CKTdelta > CKTbreaks[0]`).
// References are ngspice-47 on the identical deck; reproduce with
// `node benchmarks/tran-savedelta-608/measure.mjs`.

/** Accepted points of `grid` in [from, to], for exact grid comparisons. */
function window(grid: ArrayLike<number>, from: number, to: number): number[] {
  return Array.from(grid).filter(t => t >= from && t <= to);
}

function expectGrid(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(1e-12 * Math.abs(expected[i]!));
  }
}

describe('ngspice CKTsaveDelta step after a breakpoint (#608)', () => {
  it('equalises the last two steps before a corner and restarts at 0.1 x saveDelta', async () => {
    // The ddt-test1 corpus-f source (`pulse 0 2 0 1 1 1 4`, `.tran 1m 8`) on
    // a resistor: no reactive state, so the grid is pure driver step control.
    const time = (await simulate(`pulse resistor
V1 1 0 pulse 0 2 0 1 1 1 4
R1 1 0 1k
.tran 1m 8
.end
`)).transient!.time;
    // ngspice-47: 1 ms steps, the remaining 1.5 ms split as 2 x 0.75 ms, then
    // 0.1 x 1 ms (the delta before the snap) = 100 us and doubling. Before
    // #608 spice-ts stepped 3.99896, 3.99996, 4, then 0.1 x the snapped 36 us.
    expectGrid(window(time, 3.9964, 4.0016), [
      3.99649999999989, 3.99749999999989, 3.99849999999989, 3.999249999999945,
      4, 4.0001, 4.0003, 4.0007, 4.0015,
    ]);
  });
});
