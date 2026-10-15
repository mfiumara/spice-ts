import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { preprocess } from './preprocessor.js';

// Original MIT reproducer from #1122, not an imported fixture.
const deck = (multiplier: string) => `behavioral capacitor multiplier
Vdrive p n PWL(0 0 1m 1)
Voffset n 0 2
Vcontrol ctrl 0 PWL(0 0 1m 1)
Ctest p n C={1u*(1+V(ctrl))} ${multiplier}
.tran 10u 1m
.control
run
listing e
wrdata multiplier.dat i(Vdrive)
quit
.endc
.end`;

/** ngspice-47 a80f6e3e95d51534905b1f23410a951802666656:
 * src/frontend/inpcom.c:6070-6106 eval_mvalue formats numeric m with %15.8e;
 * :6970-6971 appends e9, giving 2.00000000e+00e9 (parsed as gain 2).
 * References below measured with `ngspice -b multiplier.cir` and wrdata.
 * This deliberately preserves ngspice compatibility, not intended m scaling.
 */
describe('ngspice-47 behavioral capacitor explicit m= (#1122)', () => {
  it.each([
    ['m=2', -3.0061028e-12],
    ['m=1', -1.5033028e-12],
    ['m=2k', -3.0056005e-9],
    ['', -1.5028e-3],
  ])('matches the native ramp current for %s', async (multiplier, reference) => {
    const tran = (await simulate(deck(multiplier))).transient!;
    const target = 0.0005028;
    const upper = tran.time.findIndex(t => t >= target);
    expect(upper).toBeGreaterThan(0);
    const lower = upper - 1;
    const weight = (target - tran.time[lower]) / (tran.time[upper] - tran.time[lower]);
    const current = tran.current('Vdrive');
    const actual = current[lower] + weight * (current[upper] - current[lower]);
    expect(Math.abs((actual - reference) / reference)).toBeLessThan(1e-4);
  });

  it('rounds explicit numeric m like inpcom while preserving absent-m gain', async () => {
    const lowered = await preprocess(deck('m=1.23456789123'));
    expect(lowered).toMatch(/g__behavioral_cap_\d+ \S+ 0 n p 1\.23456789\b/);
    expect(await preprocess(deck(''))).toMatch(/g__behavioral_cap_\d+ \S+ 0 n p 1e9\b/);
  });
});
