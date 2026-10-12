import { describe, expect, it } from 'vitest';
import { parseAsync, simulate } from './index.js';
import { locateSubcircuitCall, parseSubcircuitHeader } from './parser/subcircuit-syntax.js';
import { substituteBehavioralParameters } from './parser/behavioral-expression.js';

/**
 * #619: X instance lines with ngspice's `params:` keyword.
 * #615: `.subckt ... PARAMS:` with numparam expression defaults, and B-source
 * `{...}`/`'...'` expressions that read v() inside subcircuits (memristor.sp).
 *
 * Expected values are ngspice-47 results for the identical decks:
 *   HOME=<tmp with .spiceinit "set filetype=ascii"> ngspice -b -r deck.raw deck.cir
 */

const PARAMS_INSTANCE_DECK = `x params instance: #619 X lines with the params: keyword
.subckt div out k=2
.global vdd
R1 vdd out {k*1k}
R2 out 0 1k
.ends
.subckt wrap o
X1 o div PARAMS: k=3
.ends
V1 vdd 0 5
X1 o div params: k=1
X2 o2 wrap
.op
.end`;

const EXPRESSION_DEFAULTS_DECK = `subckt PARAMS: expression defaults: #615
.param g=3
.subckt div a b PARAMS: p1=1k p2={p1*2} p3=g*1k
R1 a b {p2}
R2 a b {p3}
.ends
V1 1 0 1
X1 1 0 div
V2 2 0 1
X2 2 0 div params: p1=2k
V3 3 0 1
X3 3 0 div PARAMS: p3=5k
.op
.end`;

const BEHAVIORAL_DECK = `subcircuit B-source expressions reading v(): #615
.param g=2
.subckt amp in out PARAMS: k=g*1.5
Bx out 0 V='{k}*v(in) + {k*v(in)}'
Rl out 0 1k
Rm in 0 r={V(in)*1k+k*1k}
.ends
V1 1 0 1
X1 1 2 amp
B2 3 0 V='2*v(1)+{g}'
R3 3 0 1k
.op
.end`;

/**
 * corpus-f examples/memristor/memristor.sp: its subcircuit verbatim, with
 * `.ic` + `.tran` in place of the `.control` block (which runs
 * `tran ... uic`, blocked by #649).
 */
const MEMRISTOR_DECK = `memristor.sp (corpus-f) subcircuit verbatim; .ic + .tran in place of its .control block (#615)
.param stime=10n
.param vmax = 3
Xmem 1 0 memristor
V1 0 1 DC 0 sin(0 'vmax' '1/stime')
B2 5 0 V='2*v(1)+{vmax}'
R5 5 0 1k
.subckt memristor plus minus PARAMS: Ron=1K Roff=10K Rinit=7.0K alpha=0 beta=20e3/stime Vt=1.6 
Bx 0 x I='((f1(V(plus)-V(minus))> 0) && (V(x) < Roff)) ? {f1(V(plus)-V(minus))}: ((((f1(V(plus)-V(minus)) < 0) && (V(x)>Ron)) ? {f1(V(plus)-V(minus))}: 0)) '
Vx x x1 dc 0
Cx x1 0 1 IC={Rinit} 
Rmem plus minus r={V(x)} 
.func f1(y)={beta*y+0.5*(alpha-beta)*(abs(y+Vt)-abs(y-Vt))} 
.ends
.ic v(xmem.x1)=7000
.tran 0.1n 10n
.end`;

function interpolate(time: number[], values: number[], at: number): number {
  const index = time.findIndex(t => t >= at);
  if (index <= 0) return values[Math.max(index, 0)];
  const fraction = (at - time[index - 1]) / (time[index] - time[index - 1]);
  return values[index - 1] + (values[index] - values[index - 1]) * fraction;
}

describe('subcircuit call syntax', () => {
  it('finds the subcircuit name before the params: keyword', () => {
    expect(locateSubcircuitCall(['X1', 'o', 'div', 'params:', 'k=1'])).toEqual({ nameIndex: 2, paramStart: 4 });
    expect(locateSubcircuitCall(['X1', 'o', 'div', 'PARAMS:'])).toEqual({ nameIndex: 2, paramStart: 4 });
    expect(locateSubcircuitCall(['X1', 'o', 'div', 'k=1'])).toEqual({ nameIndex: 2, paramStart: 3 });
    expect(locateSubcircuitCall(['X1', 'a', 'b', 'div'])).toEqual({ nameIndex: 3, paramStart: 4 });
  });

  it('parses .subckt PARAMS: with numeric and expression defaults in order', () => {
    const header = parseSubcircuitHeader(
      ".subckt memristor plus minus PARAMS: Ron=1K Roff = 10K alpha=0 beta=20e3/stime p2={p1 * 2} p3='a + b'",
    );
    expect(header.name).toBe('memristor');
    expect(header.ports).toEqual(['plus', 'minus']);
    expect(header.params).toEqual({ RON: 1000, ROFF: 10000, ALPHA: 0, BETA: '20e3/stime', P2: 'p1 * 2', P3: 'a + b' });
    expect(Object.keys(header.params)).toEqual(['RON', 'ROFF', 'ALPHA', 'BETA', 'P2', 'P3']);
    // Without the keyword, ports still end at the first assignment.
    expect(parseSubcircuitHeader('.subckt div out k=2')).toEqual({ name: 'div', ports: ['out'], params: { K: 2 } });
    expect(parseSubcircuitHeader('.subckt buf in out')).toEqual({ name: 'buf', ports: ['in', 'out'], params: {} });
  });
});

describe('X lines with params: (#619)', () => {
  it('resolves the subcircuit and applies the parameters, top level and nested, like ngspice-47', async () => {
    const result = await simulate(PARAMS_INSTANCE_DECK);
    // ngspice-47: v(vdd)=5, v(o)=2.5, v(o2)=1.25, i(v1)=-3.749999999999999e-03.
    // v(o2) also checks that the subcircuit-local .global is reached through
    // a params: instance.
    expect(result.dc!.voltage('vdd')).toBeCloseTo(5, 12);
    expect(result.dc!.voltage('o')).toBeCloseTo(2.5, 12);
    expect(result.dc!.voltage('o2')).toBeCloseTo(1.25, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-3.749999999999999e-3, 15);
  });
});

describe('.subckt PARAMS: expression defaults (#615)', () => {
  it('evaluates defaults per instance after overrides, over earlier params and top-level .params', async () => {
    const result = await simulate(EXPRESSION_DEFAULTS_DECK);
    // ngspice-47: i(v1)=-8.333333333333333e-04, i(v2)=-5.833333333333333e-04, i(v3)=-7.000000000000000e-04.
    expect(result.dc!.current('V1')).toBeCloseTo(-8.333333333333333e-4, 15);
    expect(result.dc!.current('V2')).toBeCloseTo(-5.833333333333333e-4, 15);
    expect(result.dc!.current('V3')).toBeCloseTo(-7e-4, 15);
  });

  it('reports a default that cannot be evaluated at the instance', async () => {
    const circuit = await parseAsync('t\n.subckt s a PARAMS: r=missing*2\nR1 a 0 {r}\n.ends\nX1 1 s\nV1 1 0 1\n.op\n.end');
    expect(() => circuit.compile()).toThrow(/Subcircuit 's' \(instance 'X1'\) parameter 'R=missing\*2': Undefined variable 'missing'/);
  });

  it('serializes top-level parameters and expression defaults', async () => {
    const circuit = await parseAsync(EXPRESSION_DEFAULTS_DECK);
    expect(circuit.parameters).toEqual({ G: 3 });
    const netlist = circuit.toNetlist();
    expect(netlist).toContain('.param G=3');
    expect(netlist).toContain('.subckt div a b P1=1000 P2={p1*2} P3={g*1k}');
  });
});

describe('B-source expressions reading v() (#615)', () => {
  it('keeps {..} and quoted v() expressions as ASRC sub-expressions', () => {
    expect(substituteBehavioralParameters("Bx out 0 V='{k}*v(in) + {k*v(in)}'", { K: 3 }))
      .toBe('Bx out 0 V=(3*v(in) + (3*v(in)))');
    expect(substituteBehavioralParameters('B1 1 0 V={v(2)*k}+{k*2}', { K: -1 }))
      .toBe('B1 1 0 V=(v(2)*(-1))+(-2)');
  });

  it('matches ngspice-47 inside a subcircuit and at the top level', async () => {
    const result = await simulate(BEHAVIORAL_DECK);
    // ngspice-47: v(2)=6.000000000000001, v(3)=4, i(b2)=-4e-3, i(b.x1.bx)=-6.000000000000001e-03, i(v1)=-2.5e-04.
    expect(result.dc!.voltage('2')).toBeCloseTo(6, 12);
    expect(result.dc!.voltage('3')).toBeCloseTo(4, 12);
    expect(result.dc!.current('B2')).toBeCloseTo(-4e-3, 15);
    expect(result.dc!.current('X1.Bx')).toBeCloseTo(-6e-3, 15);
    expect(result.dc!.current('V1')).toBeCloseTo(-2.5e-4, 15);
  });

  it('runs the memristor.sp subcircuit and tracks the ngspice-47 memristor state', async () => {
    const result = await simulate(MEMRISTOR_DECK);
    const tran = result.transient!;
    const state = tran.voltage('Xmem.x1');
    // ngspice-47 v(xmem.x1) on its own time grid. Worst error over all
    // 108 ngspice points is 3.93 V (5.6e-4 of 7000 V); v(xmem.x) does not
    // match yet, a pre-existing solver gap that the flattened deck shows
    // on main too (#650).
    const reference: Array<[number, number]> = [
      [5.28e-10, 7000],
      [1.728e-9, 6036.987656713769],
      [2.928e-9, 2889.642879664418],
      [4.128e-9, 1113.412428928492],
      [6.528e-9, 1693.087188100652],
      [7.728e-9, 4690.321866739838],
      [8.928e-9, 6948.791625729526],
      [1e-8, 7000.000000000046],
    ];
    for (const [time, value] of reference) {
      expect(Math.abs(interpolate(tran.time, state, time) - value)).toBeLessThan(5);
    }
    // ngspice-47: v(5)=2*v(1)+vmax ends at 3.000000000000002.
    expect(tran.voltage('5').at(-1)).toBeCloseTo(3, 9);
  });
});

describe('subcircuit capacitor/inductor IC=', () => {
  it('applies IC= with uic like a top-level card', async () => {
    const result = await simulate(`subcircuit capacitor and inductor IC= with uic
.subckt rc a
C1 a 0 1u IC=2
R1 a 0 1k
.ends
.subckt rl b
L1 b 0 1m IC=1m
R2 b 0 1
.ends
X1 n1 rc
X2 n2 rl
.tran 10u 1m uic
.end`);
    const tran = result.transient!;
    // ngspice-47: v(n1) 1.999800019998 at 0.1 us, 0.7357530610830267 at 1 ms;
    // v(n2) -0.0003678765305415104 at 1 ms.
    expect(interpolate(tran.time, tran.voltage('n1'), 1e-7)).toBeCloseTo(1.999800019998, 4);
    expect(tran.voltage('n1').at(-1)).toBeCloseTo(0.7357530610830267, 5);
    expect(tran.voltage('n2').at(-1)).toBeCloseTo(-0.0003678765305415104, 8);
  });
});
