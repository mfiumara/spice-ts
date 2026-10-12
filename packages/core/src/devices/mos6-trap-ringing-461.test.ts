import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

/**
 * Issue #461: with an ideal source pinning a MOS6 gate, the trapezoidal
 * history of the Meyer gate charge carried an error that never decayed, and
 * i(vin) flipped by ±16.6 uA every step on simpleinv.cir. ngspice-47 gives a
 * smooth current. The charges now go through NIintegrate state (#463, #468),
 * and step control uses MOS6trunc / mos6conv.c (#479).
 *
 * Plain trapezoidal integration has no damping in ngspice-47 either, so both
 * engines keep a small step-to-step ripple. The two engines step on different
 * grids, so comparing them point by point only measures the phase of that
 * ripple. These guards measure the ripple on each engine's own grid instead,
 * and compare the amplitude and slope-reversal count with ngspice-47 on the
 * unchanged corpus decks.
 */
function fixture(name: string): string {
  return readFileSync(
    new URL(`../../../../benchmarks/corpus/ngspice/fixtures/tests/mos6/${name}`, import.meta.url),
    'utf8',
  );
}

/**
 * Largest distance of a point from the chord through its two neighbours, over
 * points inside the given windows. A ringing trapezoidal recurrence alternates
 * around that chord, so this is its amplitude. It does not depend on the
 * other engine's timepoints.
 */
function zigzag(
  time: ArrayLike<number>,
  values: ArrayLike<number>,
  windows: ReadonlyArray<readonly [number, number]>,
): number {
  let largest = 0;
  for (let index = 1; index < time.length - 1; index++) {
    const at = time[index];
    if (!windows.some(([start, end]) => at >= start && at <= end)) continue;
    const fraction = (at - time[index - 1]) / (time[index + 1] - time[index - 1]);
    const chord = values[index - 1] + fraction * (values[index + 1] - values[index - 1]);
    largest = Math.max(largest, Math.abs(values[index] - chord));
  }
  return largest;
}

function interpolate(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + fraction * (values[index] - values[index - 1]);
}

/**
 * 1:2:1 average at `at - h`, `at`, `at + h`, where h is the local step. This
 * cancels a step-to-step alternation, which leaves the current the ripple
 * oscillates around.
 */
function rippleFree(time: ArrayLike<number>, values: ArrayLike<number>, at: number): number {
  let index = 1;
  while (index < time.length - 1 && time[index] < at) index++;
  const step = time[index] - time[index - 1];
  return (
    interpolate(time, values, at - step)
    + 2 * interpolate(time, values, at)
    + interpolate(time, values, at + step)
  ) / 4;
}

function slopeReversals(values: ArrayLike<number>): number {
  let reversals = 0;
  for (let index = 2; index < values.length; index++) {
    if ((values[index] - values[index - 1]) * (values[index - 1] - values[index - 2]) < 0) reversals++;
  }
  return reversals;
}

describe('MOS6 source current ringing (issue #461)', () => {
  // ngspice-47 on the unchanged simpleinv.cir: 308 timepoints, i(vin) slope
  // reverses 70 times, ripple 36.6 nA off the 55..75 ns switching edge.
  // Issue #461 (main 9b21238 / PR #455): 586 reversals over 590 points,
  // ripple ±16.6 uA.
  it('keeps simpleinv i(vin) ripple at the ngspice-47 level', async () => {
    const result = await simulate(fixture('simpleinv.cir'));
    const transient = result.transient!;
    const current = transient.current('VIN');
    const reversals = slopeReversals(current);
    expect(reversals).toBeGreaterThanOrEqual(Math.floor(0.85 * 70));
    expect(reversals).toBeLessThanOrEqual(Math.ceil(1.15 * 70));
    const ripple = zigzag(transient.time, current, [[5e-9, 55e-9], [75e-9, 150e-9]]);
    expect(ripple).toBeLessThan(50e-9);
  });

  // ngspice-47 on the unchanged mos6inv.cir rings too: i(vin) alternates by
  // about ±7 nA per step and settles at a 14.3 nA ripple over 100..150 ns. An
  // undamped error in the charge history would keep the amplitude it had
  // after the 2 ns input edge (tens of uA). This checks that the ripple decays
  // to the ngspice-47 level.
  it('lets the mos6inv i(vin) ripple decay to the ngspice-47 level', async () => {
    const result = await simulate(fixture('mos6inv.cir'));
    const transient = result.transient!;
    const ripple = zigzag(transient.time, transient.current('VIN'), [[100e-9, 150e-9]]);
    expect(ripple).toBeLessThan(30e-9);
  });

  // The current under the ripple: ngspice-47 i(vin) on the unchanged
  // mos6inv.cir, averaged the same way (rippleFree) on its own timepoints.
  // spice-ts is within 0.4 % at every point.
  it('tracks the ngspice-47 mos6inv i(vin) under the ripple', async () => {
    const result = await simulate(fixture('mos6inv.cir'));
    const transient = result.transient!;
    const current = transient.current('VIN');
    const reference: Array<[number, number]> = [
      [3, -1.623004e-6], [5, -1.704437e-6], [10, -1.189628e-6], [15, -5.308152e-7],
      [20, -2.406948e-7], [25, -1.002747e-7], [30, -3.998936e-8], [40, -6.112392e-9],
    ];
    for (const [ns, expected] of reference) {
      const actual = rippleFree(transient.time, current, ns * 1e-9);
      expect(Math.abs(actual - expected), `i(vin) at ${ns} ns`).toBeLessThan(0.01 * Math.abs(expected) + 1e-9);
    }
  });
});
