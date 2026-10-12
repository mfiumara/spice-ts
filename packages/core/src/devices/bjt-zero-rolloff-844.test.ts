import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

/**
 * #844: in ngspice-47 bjttemp.c a zero roll-off current or Early voltage means
 * "infinite": BJTinvEarlyVoltF/R and BJTinvRollOffF/R are 1/param only when
 * param != 0, else 0. Fairchild's PN2222.mod (ngspice-bugs ticket 764) sets
 * Isc=0 Ikr=0 and spice-ts rejected it.
 *
 * References: ngspice-47 `ngspice -b` on the identical deck with
 * `.control / set numdgt=15 / op / print i(Vcc) i(Vb) / .endc` in place of
 * `.op`. The issue's plain `.op / .print op i(Vcc)` deck prints
 * `vcc#branch -8.37096e-03`.
 */
const deck = (model: string) => `bjt ikr
Vcc c 0 5
Vb b 0 0.7
Q1 c b 0 qn
.model qn NPN(Is=14.34f Bf=255.9 Br=6.092 Nc=2 ${model})
.op
.end
`;

const NGSPICE_IB = -3.17752104274490e-05;

async function currents(model: string): Promise<{ ic: number; ib: number }> {
  const result = await simulate(deck(model));
  const op = result.dc!;
  return { ic: op.current('Vcc'), ib: op.current('Vb') };
}

function expectRelative(actual: number, expected: number): void {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(1e-7);
}

describe('BJT zero IKF/IKR/VAF/VAR mean infinite like ngspice-47 bjttemp.c (#844)', () => {
  it.each([
    // The issue's PN2222 card, then the same card with Ikr/Isc omitted.
    ['Vaf=74.03 Ikf=.2847 Ikr=0 Isc=0', -8.37096121416614e-03],
    ['Vaf=74.03 Ikf=.2847', -8.37096121416614e-03],
    ['Vaf=74.03 Ikf=.2847 Var=0', -8.37096121416614e-03],
    ['Vaf=0 Ikf=.2847', -7.91142932113774e-03],
    ['Vaf=74.03 Ikf=0', -8.60357894456404e-03],
    ['Vaf=0 Ikf=0 Ikr=0 Var=0 Isc=0', -8.13127727953626e-03],
    ['', -8.13127727953626e-03],
  ])('%s matches ngspice-47', async (model, ngspiceIc) => {
    const { ic, ib } = await currents(model);
    expectRelative(ic, ngspiceIc);
    expectRelative(ib, NGSPICE_IB);
  });

  it('a zero parameter is identical to omitting it', async () => {
    const omitted = await currents('Vaf=74.03 Ikf=.2847 Br=6.092');
    for (const zero of ['Ikr=0', 'Var=0', 'Ikr=0 Var=0 Isc=0']) {
      const withZero = await currents(`Vaf=74.03 Ikf=.2847 Br=6.092 ${zero}`);
      expect(withZero.ic).toBe(omitted.ic);
      expect(withZero.ib).toBe(omitted.ib);
    }
    const allOmitted = await currents('');
    const allZero = await currents('Vaf=0 Ikf=0 Ikr=0 Var=0');
    expect(allZero.ic).toBe(allOmitted.ic);
  });

  it.each(['Vaf=-1', 'Ikf=-1m', 'Var=-1', 'Ikr=-1m', 'Isc=-1e-15'])(
    'still rejects the negative %s',
    model => {
      expect(() => parse(deck(model)).compile()).toThrow(/Invalid bounded BJT/);
    },
  );
});
