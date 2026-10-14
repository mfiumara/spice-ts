import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';

const cases = [
  ['numeric', 'alpha=\n+5'],
  ['bare expression', 'alpha=\n+seed*2'],
  ['braced expression', 'alpha={seed\n+*2}'],
  ['quoted expression', "alpha='seed\n+*2'"],
  ['comments and multiple continuations', 'alpha= ; pending RHS\n* between lines\n\n+{seed\n+*2}'],
] as const;

describe('#797 X-call RHS continuation folding', () => {
  for (const nested of [false, true]) {
    for (const [name, assignment] of cases) {
      it(`${nested ? 'nested' : 'top-level'} ${name}`, async () => {
        const call = `Xchild o cell ${assignment}`;
        const deck = `X-call continuation
.param seed=2.5
.subckt cell o params: alpha=1
I1 0 o {alpha}
R1 o 0 1
.ends
${nested ? `.subckt caller o params: seed=2.5\n${call}\n.ends\nXouter o caller` : call}
.op
.end`;
        const result = await simulate(deck);
        expect(result.dc!.voltage('o')).toBeCloseTo(5, 12);
      });
    }
  }
});
