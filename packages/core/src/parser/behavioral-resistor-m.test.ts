import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { preprocess } from './preprocessor.js';

const deck = (analysis: string) => `behavioral resistor multiplier
Vdrive in 0 DC 2 PWL(0 2 1m 4)
Vcontrol ctrl 0 DC 2 PWL(0 2 1m 3)
Voffset return 0 0.25
Rfeed in scaled 1
Rparallel in parallel 1
Rscaled scaled return R={1+2*V(ctrl)} M=4
Ra parallel return R={1+2*V(ctrl)}
Rb parallel return R={1+2*V(ctrl)}
Rc parallel return R={1+2*V(ctrl)}
Rd parallel return R={1+2*V(ctrl)}
${analysis}
.end`;

describe('behavioral resistor multiplier (#1139)', () => {
  it('matches four parallel copies in OP', async () => {
    const { dc } = await simulate(deck('.op'));
    expect(dc!.voltage('scaled')).toBeCloseTo(11 / 9, 10);
    expect(dc!.voltage('scaled')).toBeCloseTo(dc!.voltage('parallel'), 10);
  });

  it('matches four parallel copies throughout a transient', async () => {
    const { transient } = await simulate(deck('.tran 10u 1m'));
    const scaled = transient!.voltage('scaled');
    const parallel = transient!.voltage('parallel');
    expect(transient!.time.length).toBeGreaterThan(10);
    for (let i = 0; i < scaled.length; i++) {
      expect(scaled[i]).toBeCloseTo(parallel[i], 10);
    }
    expect(scaled[scaled.length - 1]).toBeGreaterThan(scaled[0]);
  });

  it('scales current-dependent resistance while retaining temperature coefficients', async () => {
    const result = await preprocess('R1 a b R={1k+i(Vsense)} M = 4 tc1=0.001 tc2=1e-5\n.op');
    expect(result).toContain('i = (4)*v(a, b)/(1k+i(Vsense)) tc1=0.001 tc2=1e-5 reciproctc=1');
  });
});
