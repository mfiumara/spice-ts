import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

// Issue #604: the corpus-f BSIM3 4-bit NAND adder
// (benchmarks/corpus/corpus-f/fixtures/examples/digital/compare/adder_mos.cir)
// hit the 120 s spice-ts bound while ngspice-47 finished in ~5 s. PR #618
// measured the cause: the node-voltage predictor LTE capped 92 % of the
// accepted steps (28.6 vs 2.82 accepted steps per simulated ns). #689 moved
// step control to ngspice-47 CKTtrunc, and BSIM3trunc covers every BSIM3
// charge, so the node check no longer runs on this deck.
//
// The test reads the fixture bytes, drops its interactive .control block
// (pre_set/save/run/rusage/plot) and shortens `.TRAN 500p 6400NS` to the
// first 400 ns. References: ngspice-47 (Homebrew) batch run of the identical
// derived deck, with `.option acct` statistics and `.meas tran` cards.
const FIXTURE = new URL(
  '../../../../benchmarks/corpus/corpus-f/fixtures/examples/digital/compare/adder_mos.cir',
  import.meta.url,
);

function derivedDeck(): string {
  const deck = readFileSync(FIXTURE, 'utf8').replace(/^\.control[\s\S]*?^\.endc\s*$/m, '');
  const shortened = deck.replace(/^\.TRAN 500p 6400NS$/m, '.TRAN 500p 400NS');
  if (shortened === deck || /^\.control/m.test(shortened)) {
    throw new Error('adder_mos fixture changed: re-derive the #604 test deck');
  }
  return shortened;
}

/** Crossing `which` (1-based, or 'last') of `values` through `level`, linearly interpolated (ngspice `meas ... when ... cross=`). */
function crossing(time: readonly number[], values: readonly number[], level: number, which: number | 'last'): number {
  let found = Number.NaN;
  let count = 0;
  for (let index = 1; index < time.length; index++) {
    const before = values[index - 1]! - level;
    const after = values[index]! - level;
    if (before * after < 0 || (before === 0 && after !== 0)) {
      count++;
      found = before === 0
        ? time[index - 1]!
        : time[index - 1]! + (time[index]! - time[index - 1]!) * before / (before - after);
      if (count === which) return found;
    }
  }
  return which === 'last' ? found : Number.NaN;
}

describe('adder_mos (BSIM3) transient step count at ngspice-47 CKTtrunc parity (#604)', () => {
  it('takes about as many accepted timepoints as ngspice-47 and lands its gate edges', async () => {
    const result = await simulate(derivedDeck());
    const transient = result.transient!;
    const time = transient.time;
    expect(time.at(-1)).toBeCloseTo(400e-9, 15);

    // ngspice-47: 1142 accepted / 161 rejected timepoints, 4289 transient
    // iterations. With the node-voltage LTE as a step limiter spice-ts needed
    // about 10x as many points (PR #618). The bound is loose on purpose: it
    // pins the step-control class, not the exact grid.
    const accepted = time.length - 1;
    expect(accepted).toBeGreaterThan(1142 * 0.8);
    expect(accepted).toBeLessThan(1142 * 1.25);
    const iterations = result.convergence?.transient?.newtonIterations ?? Number.NaN;
    expect(iterations).toBeLessThan(4289 * 1.5);

    // ngspice-47 `meas tran ... when v(n)=1.5 cross=1|last`. PR #618 saw the
    // outputs at the opposite logic level for up to 25 % of samples; the
    // first and last edges here pin the per-gate delay. 0.1 ns is above
    // ngspice-47's own step-grid jitter on this deck (crossings move up to
    // 66 ps when only `.option trtol` moves by 1 %) and tight enough to fail
    // the 0.115-0.154 ns v(9) offsets spice-ts had before the b3ld.c charge
    // port (#626). Main is within 17 ps of every reference.
    const v9 = transient.voltage('9');
    const v10 = transient.voltage('10');
    const v13 = transient.voltage('13');
    expect(Math.abs(crossing(time, v9, 1.5, 1) - 32.5e-9)).toBeLessThan(0.1e-9);
    expect(Math.abs(crossing(time, v10, 1.5, 1) - 7.97701e-9)).toBeLessThan(0.1e-9);
    expect(Math.abs(crossing(time, v13, 1.5, 1) - 6.45895e-9)).toBeLessThan(0.1e-9);
    expect(Math.abs(crossing(time, v9, 1.5, 'last') - 381.392e-9)).toBeLessThan(0.1e-9);
    expect(Math.abs(crossing(time, v10, 1.5, 'last') - 331.676e-9)).toBeLessThan(0.1e-9);
  }, 120_000);
});
