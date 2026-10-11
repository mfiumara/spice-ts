import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';
import { resolveOptions } from '../types.js';
import { createDriverFromCompiled } from './transient-driver.js';
import { computeUICInitialSolution } from './uic.js';

// Issue #560: with `uic`, C(ic=-1) parallel to a series R-L branch jumped to
// +4897 V on the first step. The UIC seed sets v(gib) = -1 V from the
// capacitor IC but leaves the algebraic node gib1 at 0 V and the inductor
// current at 0 A, so it is not a solution of the circuit equations: KCL on
// gib puts -1 V / 1 mOhm = 1000 A through the capacitor. A trapezoidal
// history built from that seed integrates the 1000 A as a real capacitor
// current; the node-voltage LTE predictor treats the 1 V jump of gib1 as a
// slope. ngspice-47 keeps no such state (MODEINITTRAN takes the capacitor
// and inductor states from their ICs and integrates the first step at
// order 1; CKTterr truncates on device charges, not node voltages).

const DECK = `uic RL-C
RLa gib gib1 1m
La  gib1 0  1.2e-6
Ca  gib 0   1e-9 ic=-1
.tran 10e-9 2e-6 uic
.end
`;

const R = 1e-3;
const L = 1.2e-6;
const C = 1e-9;
const ALPHA = R / (2 * L);
const OMEGA = Math.sqrt(1 / (L * C) - ALPHA * ALPHA);

/** Exact v(gib) of the series RLC from v(0) = -1 V, i(0) = 0 A. */
function exact(t: number): number {
  return Math.exp(-ALPHA * t) * (-Math.cos(OMEGA * t) - (ALPHA / OMEGA) * Math.sin(OMEGA * t));
}

// ngspice-47 `ngspice -b` on the identical deck (`print v(gib)`) up to 10 ns.
// In UIC mode ngspice prints no t=0 row; its first steps double from
// TSTEP/100. Its worst error against exact() here is 4.0e-5 V.
const NGSPICE_FIRST_STEPS: ReadonlyArray<readonly [number, number]> = [
  [1e-10, -9.99991667e-01],
  [2e-10, -9.99975000e-01],
  [4e-10, -9.99925002e-01],
  [8e-10, -9.99725018e-01],
  [1.6e-9, -9.98925254e-01],
  [3.2e-9, -9.95728940e-01],
  [6.4e-9, -9.82987439e-01],
  [1e-8, -9.58661934e-01],
];
const NGSPICE_FIRST_STEPS_ERROR = 5e-5;

describe('uic start from a non-solution seed (#560)', () => {
  it('builds no trapezoidal history from the UIC seed', () => {
    const compiled = parse(DECK).compile();
    const analysis = compiled.analyses.find(a => a.type === 'tran')!;
    if (analysis.type !== 'tran') throw new Error('expected .tran');
    const options = resolveOptions(compiled.simulationOptions, analysis.stopTime);
    // No stop time: no t=0 breakpoint, so nothing else forces the first step
    // to order 1. This is the pre-#545 path that produced +4897 V at 10 ns.
    const sim = createDriverFromCompiled(compiled, options, {
      stopTime: undefined,
      timestep: 1e-8,
      maxTimestep: 1e-8,
      initialSolution: computeUICInitialSolution(compiled),
      useInitialConditions: true,
    });
    const step = sim.advance();
    sim.dispose();
    expect(step.time).toBeCloseTo(1e-8, 20);
    // exact(1e-8) = -0.9586; one 10 ns Backward-Euler step is first-order
    // accurate. The seed history gave +4896.98 V.
    expect(Math.abs(step.voltages.get('gib')! - exact(1e-8))).toBeLessThan(0.05);
  });

  it('follows the ngspice-47 first steps on the issue deck', async () => {
    for (const [at, value] of NGSPICE_FIRST_STEPS) {
      expect(Math.abs(value - exact(at))).toBeLessThan(NGSPICE_FIRST_STEPS_ERROR);
    }
    const transient = (await simulate(DECK)).transient!;
    const time = Array.from(transient.time);
    const gib = transient.voltage('gib');
    expect(gib[0]).toBe(-1);
    let points = 0;
    for (let index = 1; index < time.length && time[index]! <= 1e-8 * (1 + 1e-9); index++) {
      points++;
      expect(Math.abs(gib[index]! - exact(time[index]!))).toBeLessThan(NGSPICE_FIRST_STEPS_ERROR);
      // The seed's 1 V jump on gib1 read as a slope by the LTE predictor cut
      // the second step from 1e-10 to 1.9e-12 s (14 points to 10 ns).
      expect(time[index]! - time[index - 1]!).toBeGreaterThanOrEqual(1e-10 * (1 - 1e-9));
    }
    expect(points).toBeLessThanOrEqual(NGSPICE_FIRST_STEPS.length);
  });
});
