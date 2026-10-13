import { describe, expect, it } from 'vitest';
import { InvalidCircuitError, UnsupportedMultiplicityError } from './errors.js';
import { simulate } from './simulate.js';

// #810: `m=` on an X instance makes the instance m parallel copies of the
// subcircuit. ngspice-47 implements it in inp_fix_subckt_multiplier
// (src/frontend/inpcom.c) by appending `m={m}` to every scalable card of the
// subcircuit body. Where no body card carries its own m (the common case)
// that equals scaling every device by the instance m, and the expected values
// below are ngspice-47 -b runs of the same decks (Homebrew, macOS arm64,
// `set numdgt=12`). Where a body card has its own m, ngspice-47 lets the
// instance m replace it (ngspice bug #693, "does not match documentation");
// spice-ts multiplies, as the ngspice manual specifies, and those
// expectations are analytic.

const relative = (actual: number, expected: number, tol = 1e-6) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol * Math.abs(expected));

describe('X-line multiplicity m= (#810)', () => {
  it('scales a subcircuit instance and multiplies inner m (ngspice #693 cases 1-3)', async () => {
    // benchmarks/corpus/ngspice-bugs/tickets/693/cases123_cards.cir.
    // Analytic: v(1) = v(2) = v(3) = -1 A * (1/10 ohm). ngspice-47 gives
    // v(3) = -0.2 (instance m=5 replaces the inner m=2: bug #693).
    const result = await simulate(`* multiplicities
i1 1 0 DC 1
r1 1 0 1 m=10

i2 2 0 DC 1
.subckt rx2 a b
r2 a b 1
.ends
x2 2 0 rx2 m=10

i3 3 0 DC 1
.subckt rx3 a b
r3 a b 1 m=2
.ends
x3 3 0 rx3 m=5
.op
.end
`);
    const dc = result.dc!;
    expect(dc.voltage('1')).toBeCloseTo(-0.1, 12);
    expect(dc.voltage('2')).toBeCloseTo(-0.1, 12);
    expect(dc.voltage('3')).toBeCloseTo(-0.1, 12);
  });

  it('keeps the inner m of an instance without m', async () => {
    // Analytic: 2 parallel 1-ohm resistors. ngspice-47 gives -1 here because
    // once any instance of rx3 has m, every rx3 instance gets m=1 forced onto
    // its cards (bug #693 again).
    const result = await simulate(`inner m without instance m
.subckt rx3 a b
r3 a b 1 m=2
.ends
i3 3 0 DC 1
x3 3 0 rx3 m=5
i4 4 0 DC 1
x4 4 0 rx4
.subckt rx4 a b
x0 a b rx3
.ends
.op
.end
`);
    expect(result.dc!.voltage('3')).toBeCloseTo(-0.1, 12);
    expect(result.dc!.voltage('4')).toBeCloseTo(-0.5, 12);
  });

  it('scales R, C, diode and MOSFET in .op and .ac like ngspice-47', async () => {
    const result = await simulate(`* m-scaled subckt with R, C, diode and MOSFET
.model dm D(is=1e-14 rs=5 cjo=1p)
.model nm NMOS(level=1 vto=0.7 kp=1e-4 rd=10 rs=10 cgso=1e-10 cgdo=1e-10)
.subckt cell in out vdd
r1 in mid 1k
c1 mid 0 1n
d1 mid out dm
m1 out mid 0 0 nm w=10u l=1u
rl vdd out 10k
.ends
v1 in 0 dc 1.5 ac 1
vdd vdd 0 dc 3
x1 in out vdd cell m=3
.op
.ac dec 1 1k 10meg
.end
`);
    // ngspice-47: identical to the flat deck with m=3 on every device.
    const dc = result.dc!;
    relative(dc.voltage('out'), 8.592491390286e-01);
    relative(dc.voltage('x1.mid'), 1.441317527366e+00);
    relative(dc.current('v1'), -1.76047417902e-04);
    relative(dc.current('vdd'), -6.42225258291e-04);

    const ac = result.ac!;
    expect(ac.frequencies).toHaveLength(5);
    const out = ac.voltage('out');
    const mid = ac.voltage('x1.mid');
    const ngspiceOut = [
      [3.585010173232e-01, -3.49313439108e-03],
      [3.582844064486e-01, -3.49172617482e-02],
      [3.384251900943e-01, -3.36040228150e-01],
      [9.861031476069e-02, -1.28993209748e+00],
      [1.026404790759e-02, -1.52011238012e+00],
    ];
    const ngspiceMid = [5.562876816720e-01, 5.559515649494e-01, 5.251358679088e-01, 1.530123293902e-01, 1.590860815311e-02];
    ngspiceOut.forEach(([magnitude, phase], i) => {
      relative(out[i].magnitude, magnitude);
      relative(out[i].phase * Math.PI / 180, phase, 1e-5);
      relative(mid[i].magnitude, ngspiceMid[i]);
    });
  });

  it('propagates through nested instances and scales current sources', async () => {
    // ngspice-47: v(1) = -1/3, v(2) = -4 (xs.i1 m=4; the 0 V source is not scaled).
    const result = await simulate(`* nested X, I and V sources
.subckt inner a b
ri a b 1
.ends
.subckt outer a b
xi a b inner m=1
.ends
.subckt isrc a b
i1 a b dc 1
v0 b c 0
r0 c 0 1e9
.ends
i1 1 0 DC 1
xo 1 0 outer m=3
xs 2 0 isrc m=4
r2 2 0 1
.op
.end
`);
    relative(result.dc!.voltage('1'), -1 / 3, 1e-12);
    relative(result.dc!.voltage('2'), -4, 1e-12);
  });

  it('multiplies nested multiplicities', async () => {
    // Analytic: 3 * 2 = 6 parallel 1-ohm resistors, and 4 in the instance
    // without inner m. ngspice-47 gives -1/3 for the first (outer m replaces
    // the inner m) and rejects the second ("Mismatch: 0 formal but 1 actual
    // params"): bug #693's "scope recursion needs repair".
    const result = await simulate(`* nested multiply
.subckt inner a b
ri a b 1
.ends
.subckt outer a b
xi a b inner m=2
.ends
.subckt outer1 a b
xi a b inner
.ends
i1 1 0 DC 1
xo 1 0 outer m=3
i2 2 0 DC 1
xp 2 0 outer1 m=4
.op
.end
`);
    relative(result.dc!.voltage('1'), -1 / 6, 1e-12);
    relative(result.dc!.voltage('2'), -1 / 4, 1e-12);
  });

  it('evaluates an m expression from .param', async () => {
    // ngspice-47: v(1) = -1.66667e-01.
    const result = await simulate(`* param expression
.param mm=3
.subckt rx a b
r a b 1
.ends
i1 1 0 DC 1
x1 1 0 rx m={mm*2}
.op
.end
`);
    relative(result.dc!.voltage('1'), -1 / 6, 1e-12);
  });

  it('treats a declared subcircuit parameter m as an ordinary parameter', async () => {
    // ngspice-47: v(4) = -0.1, v(5) = -1, v(6) = -0.25 (no automatic inheritance).
    const result = await simulate(`* formal m parameter is ordinary
.subckt rx4 a b m=10
r4 a b 1 m={m}
.ends
.subckt rx5 a b m=10
r5 a b 1
.ends
i4 4 0 DC 1
x4 4 0 rx4 m=10
i5 5 0 DC 1
x5 5 0 rx5 m=10
i6 6 0 DC 1
x6 6 0 rx4 m=4
.op
.end
`);
    relative(result.dc!.voltage('4'), -0.1, 1e-12);
    relative(result.dc!.voltage('5'), -1, 1e-12);
    relative(result.dc!.voltage('6'), -0.25, 1e-12);
  });

  it('matches the flat deck in transient analysis', async () => {
    const body = (m: string) => `r1 in mid 1k${m}
c1 mid 0 1n${m}
l1 mid out 1m${m}
r2 out 0 100${m}`;
    const sources = `v1 src 0 pulse(0 1 0 1u 1u 5u 20u)
rs src in 300
rl out 0 1k
.tran 0.2u 20u
.end`;
    const scaled = await simulate(`* subckt
.subckt cell in out
${body('')}
.ends
x1 in out cell m=4
${sources}
`);
    const flat = await simulate(`* flat
${body(' m=4')}
${sources}
`);
    const a = scaled.transient!;
    const b = flat.transient!;
    expect(a.time.length).toBe(b.time.length);
    const va = a.voltage('out');
    const vb = b.voltage('out');
    for (let i = 0; i < va.length; i++) expect(va[i]).toBeCloseTo(vb[i], 12);
  });

  it.each([
    ['G', 'g1 a b a b 1m'],
    ['F', 'v0 a c 0\nr0 c b 1k\nf1 a b v0 2'],
    ['B (current)', 'b1 a b i=v(a,b)*1m'],
    ['J', '.model jm njf\nj1 a b b jm'],
  ])('rejects an m-scaled %s card it cannot scale instead of ignoring m', async (_kind: string, card: string) => {
    const deck = (m: string) => `* unsupported
.subckt cell a b
${card}
r1 a b 1k
.ends
i1 1 0 DC 1m
x1 1 0 cell${m}
.op
.end
`;
    await expect(simulate(deck(' m=1'))).resolves.toBeDefined();
    await expect(simulate(deck(''))).resolves.toBeDefined();
    let error: unknown;
    try {
      await simulate(deck(' m=2'));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(UnsupportedMultiplicityError);
    expect(error).toBeInstanceOf(InvalidCircuitError);
    expect((error as UnsupportedMultiplicityError).code).toBe('UNSUPPORTED_MULTIPLICITY');
    expect((error as UnsupportedMultiplicityError).instanceName.toLowerCase()).toBe('x1');
    expect((error as UnsupportedMultiplicityError).multiplicity).toBe(2);
  });

  it('leaves voltage-defined cards unscaled, like ngspice-47', async () => {
    // ngspice-47 skips V, E, H and B v= cards: m parallel copies of an ideal
    // voltage constraint are the same constraint.
    // ngspice-47: i(v1) = 4.0e-03, v(x1.c) = 2.
    const result = await simulate(`* voltage cards
.subckt cell a
vb b 0 2
e1 c 0 b 0 1
r1 a c 1k
.ends
v1 1 0 1
x1 1 cell m=4
.op
.end
`);
    relative(result.dc!.current('v1'), 4e-3, 1e-9);
    relative(result.dc!.voltage('x1.c'), 2, 1e-12);
  });

  it('warns that a switch is left unscaled, like ngspice-47', async () => {
    // ngspice-47 skips S/W cards in inp_fix_subckt_multiplier: the switch keeps
    // ron = 1 ohm while r1 becomes 1k/2. ngspice-47: v(1) = 9.980079681275e-01
    // (= 1 V * 501 / 502).
    const result = await simulate(`* switch in m-scaled subckt
.model swm sw(vt=0.5 ron=1 roff=1e9)
.subckt cell a
s1 a b a 0 swm
r1 b 0 1k
.ends
v1 in 0 1
rs in 1 1
x1 1 cell m=2
.op
.end
`);
    relative(result.dc!.voltage('1'), 501 / 502, 1e-9);
    expect(result.warnings.map(w => w.message)).toContainEqual(
      expect.stringContaining("S device 'x1.s1' is not scaled by the multiplicity m=2"),
    );
  });
});
