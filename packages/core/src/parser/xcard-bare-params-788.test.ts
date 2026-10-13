import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { parse } from './index.js';

// #788: ngspice-47 inpcom.c (inp_fix_param_values) wraps the bare right-hand
// side of an X-card `name=value` in braces, so numparam evaluates `R=R1` as
// `R={R1}` against the visible .param / subcircuit parameters. Every expected
// value below is ngspice-47 `-b` output for the same deck.

describe('#788 bare parameter names as X-card values', () => {
  it('resolves a subcircuit parameter passed by bare name (SpiceSharpParser example02.cir)', async () => {
    const dc = (await simulate(`example02
V1 IN 0 4.0
X1 IN OUT twoResistorsInSeries
RX OUT 0 1
.SUBCKT resistor input output params: R=1
R1 input output {R}
.ENDS resistor
.SUBCKT twoResistorsInSeries input output params: R1=10 R2=20
X1 input 1 resistor R=R1
X2 1 output resistor R=R2
.ENDS twoResistorsInSeries
.OP
.END`)).dc!;
    // ngspice-47: v(x1.1)=2.709677419354839 v(out)=1.290322580645161e-01
    expect(dc.voltage('OUT')).toBeCloseTo(1.290322580645161e-1, 12);
    expect(dc.voltage('X1.1')).toBeCloseTo(2.709677419354839, 12);
  });

  it('resolves a top-level .param passed by bare name', async () => {
    const dc = (await simulate(`top-level param by bare name
.param RV=3k
V1 1 0 2
X1 1 2 res R=RV
R2 2 0 1k
.subckt res a b params: R=1
R1 a b {R}
.ends
.op
.end`)).dc!;
    // ngspice-47: v(2)=0.5
    expect(dc.voltage('2')).toBeCloseTo(0.5, 12);
  });

  it('accepts spaces around =, + continuations and bare expressions', async () => {
    const dc = (await simulate(`continuation and expression
V1 1 0 2
X1 1 0 pair
+ RA = R2K
.subckt pair a b params: RA=1 RB=2k
X1 a m res R=RA
X2 m b res R=RB*2
.ends
.subckt res a b params: R=1
R1 a b {R}
.ends
.param R2K=2k
.op
.end`)).dc!;
    // ngspice-47: v(x1.m)=1.333333333333333
    expect(dc.voltage('X1.M')).toBeCloseTo(1.333333333333333, 12);
  });

  it('reports an undefined bare name instead of a number parse error', () => {
    expect(() => parse('t\nV1 1 0 1\nX1 1 0 res R=NOPE\n.subckt res a b params: R=1\nR1 a b {R}\n.ends\n.op\n.end'))
      .toThrow(/NOPE/i);
    expect(() => parse('t\nV1 1 0 1\nX1 1 0 res R=NOPE\n.subckt res a b params: R=1\nR1 a b {R}\n.ends\n.op\n.end'))
      .not.toThrow(/Cannot parse number/);
  });
});
