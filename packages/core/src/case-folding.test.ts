import { describe, expect, it } from 'vitest';
import { parse } from './parser/index.js';
import { simulate } from './simulate.js';

// ngspice lower-cases every netlist token (inpcom.c), so node, element,
// model and subcircuit names are case-insensitive. Reference values below are
// ngspice-47 (`ngspice -b`) on the identical netlist bytes (#728, #754).

/** Linear interpolation of a waveform at `t`. */
function at(time: readonly number[], values: ArrayLike<number>, t: number): number {
  const i = time.findIndex(x => x >= t);
  if (i <= 0) return values[Math.max(i, 0)]!;
  const f = (t - time[i - 1]!) / (time[i]! - time[i - 1]!);
  return values[i - 1]! + f * (values[i]! - values[i - 1]!);
}

describe('case-insensitive node names (#728)', () => {
  const netlist = `case 728 op
V1 F 0 2
R1 f 0 1k
E1 G 0 f 0 3
R2 g 0 1k
Bx Y 0 V=2*v(F)
Ry y 0 1k
.op
.end`;

  it('treats F and f as one node, as ngspice-47 does', async () => {
    const dc = (await simulate(netlist)).dc!;
    // ngspice-47: v(f)=2 v(g)=6 v(y)=4 i(v1)=-2m i(e1)=-6m bx#branch=-4m
    expect([...dc.voltages.keys()].sort()).toEqual(['F', 'G', 'Y']);
    expect(dc.voltage('f')).toBeCloseTo(2, 12);
    expect(dc.voltage('F')).toBeCloseTo(2, 12);
    expect(dc.voltage('g')).toBeCloseTo(6, 12);
    expect(dc.voltage('y')).toBeCloseTo(4, 12);
    expect(dc.current('v1')).toBeCloseTo(-2e-3, 15);
    expect(dc.current('E1')).toBeCloseTo(-6e-3, 15);
    expect(dc.current('bx')).toBeCloseTo(-4e-3, 15);
  });

  it('counts case variants as one node before compile', () => {
    const circuit = parse(netlist);
    expect(circuit.nodeCount).toBe(3);
    expect(circuit.getNodeIndex('f')).toBe(circuit.getNodeIndex('F'));
  });

  it('folds port, local and instance names inside .subckt expansion', async () => {
    const dc = (await simulate(`subckt case folding
.subckt DIV IN out
R1 IN Mid 1k
R2 mid OUT 1k
R3 Out 0 2k
.ends div
V1 A 0 4
X1 a B Div
x2 b C div
.op
.end`)).dc!;
    // ngspice-47: a=4 b=1.6 c=0.8 x1.mid=2.8 x2.mid=1.2 v1#branch=-1.2m
    expect(dc.voltages.size).toBe(5);
    expect(dc.voltage('a')).toBeCloseTo(4, 12);
    expect(dc.voltage('b')).toBeCloseTo(1.6, 12);
    expect(dc.voltage('c')).toBeCloseTo(0.8, 12);
    expect(dc.voltage('x1.mid')).toBeCloseTo(2.8, 12);
    expect(dc.voltage('X2.MID')).toBeCloseTo(1.2, 12);
    expect(dc.current('V1')).toBeCloseTo(-1.2e-3, 15);
  });
});

describe('case-insensitive K-card inductor references (#754)', () => {
  // ngspice-47 .meas on the same deck: vmax=0.457010 at 37.0504us,
  // v(3)@25us=0.353790, @50us=0.324332, @100us=-0.403323, i(v1)@100us=0.0135247.
  const expectNgspice47 = (time: number[], v3: ArrayLike<number>, iv1: ArrayLike<number>): void => {
    expect(Math.max(...Array.from(v3))).toBeCloseTo(0.45701, 3);
    expect(at(time, v3, 25e-6)).toBeCloseTo(0.35379, 3);
    expect(at(time, v3, 50e-6)).toBeCloseTo(0.324332, 3);
    expect(at(time, v3, 100e-6)).toBeCloseTo(-0.403323, 3);
    expect(at(time, iv1, 100e-6)).toBeCloseTo(0.0135247, 4);
  };

  it('couples l1 and L2 in a top-level deck', async () => {
    const tran = (await simulate(`k card case 754
V1 1 0 SIN(0 1 10k)
R1 1 2 10
L1 2 0 1m
l2 3 0 4m
k1 l1 L2 0.5
R3 3 0 100
.tran 1u 100u 0 0.1u
.end`)).transient!;
    expectNgspice47(tran.time, tran.voltage('3'), tran.current('V1'));
  });

  it('couples l1 and L2 inside a .subckt', async () => {
    const tran = (await simulate(`k card in subckt case 754
.subckt XFMR p s
L1 p 0 1m
l2 s 0 4m
k1 l1 L2 0.5
.ends
V1 1 0 SIN(0 1 10k)
R1 1 2 10
X1 2 3 xfmr
R3 3 0 100
.tran 1u 100u 0 0.1u
.end`)).transient!;
    expectNgspice47(tran.time, tran.voltage('3'), tran.current('V1'));
  });
});
