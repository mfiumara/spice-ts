import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #611: the corpus-f bipolar 4-bit adder
// (benchmarks/corpus/corpus-f/fixtures/examples/digital/compare/adder_bip.cir)
// hit the 120 s spice-ts bound. PR #618 measured the cause: the node-voltage
// predictor LTE capped 98 % of the accepted steps, so spice-ts took 7.8x more
// steps per simulated ns than ngspice-47, which sizes steps with CKTtrunc only.
//
// The test reads the fixture bytes, drops its interactive .control block
// (run/rusage/plot) and shortens `.TRAN 1NS 6400NS` to the first 800 ns: every
// input has switched by then and the run stays a unit test. References:
// ngspice-47 (Homebrew) batch run of the identical derived deck, with `.option
// acct` statistics and `.meas tran` cards.
const FIXTURE = new URL(
  '../../../../benchmarks/corpus/corpus-f/fixtures/examples/digital/compare/adder_bip.cir',
  import.meta.url,
);

function derivedDeck(): string {
  const deck = readFileSync(FIXTURE, 'utf8').replace(/^\.control[\s\S]*?^\.endc\s*$/m, '');
  const shortened = deck.replace(/^\.TRAN 1NS 6400NS$/m, '.TRAN 1NS 800NS');
  if (shortened === deck || /^\.control/m.test(shortened)) {
    throw new Error('adder_bip fixture changed: re-derive the #611 test deck');
  }
  return shortened;
}

/** First time `values` crosses `level`, linearly interpolated (ngspice `meas ... when ... cross=1`). */
function firstCrossing(time: readonly number[], values: readonly number[], level: number): number {
  for (let index = 1; index < time.length; index++) {
    const before = values[index - 1]! - level;
    const after = values[index]! - level;
    if (before === 0) return time[index - 1]!;
    if (before * after < 0) {
      return time[index - 1]! + (time[index]! - time[index - 1]!) * before / (before - after);
    }
  }
  return Number.NaN;
}

describe('adder_bip transient step count at ngspice-47 CKTtrunc parity (#611)', () => {
  it('takes about as many accepted timepoints as ngspice-47 and lands its gate edges', async () => {
    const result = await simulate(derivedDeck());
    const transient = result.transient!;
    const time = transient.time;
    expect(time.at(-1)).toBeCloseTo(800e-9, 15);

    // ngspice-47: 1727 accepted / 513 rejected timepoints, 9594 transient
    // iterations. With the node-voltage LTE as a step limiter spice-ts needed
    // about 8x as many points here (PR #618: 16.6 vs 2.14 accepted steps per
    // simulated ns over the full deck). The bound is loose on purpose: it
    // pins the step-control class, not the exact grid.
    const accepted = time.length - 1;
    expect(accepted).toBeGreaterThan(1727 * 0.8);
    expect(accepted).toBeLessThan(1727 * 1.25);
    const iterations = result.convergence?.transient?.newtonIterations ?? Number.NaN;
    expect(iterations).toBeLessThan(9594 * 1.5);

    // ngspice-47 `meas tran ... when v(n)=1.5 cross=1`: t9 = 76.7727 ns,
    // t10 = 26.2989 ns, t13 = 15.4062 ns. 0.2 ns is ~2 % of the 10 ns input
    // edges; it is the step-grid jitter class both engines share.
    expect(Math.abs(firstCrossing(time, transient.voltage('9'), 1.5) - 76.7727e-9)).toBeLessThan(0.2e-9);
    expect(Math.abs(firstCrossing(time, transient.voltage('10'), 1.5) - 26.2989e-9)).toBeLessThan(0.2e-9);
    expect(Math.abs(firstCrossing(time, transient.voltage('13'), 1.5) - 15.4062e-9)).toBeLessThan(0.2e-9);
  }, 120_000);
});
