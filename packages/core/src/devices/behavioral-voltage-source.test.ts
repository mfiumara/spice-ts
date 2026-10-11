import { describe, expect, it } from 'vitest';
import { parse } from '../parser/index.js';
import { simulate } from '../simulate.js';

const deck = (...lines: string[]) => ['b-source V= test', ...lines, '.end'].join('\n');

describe('B-source V= voltage expressions', () => {
  it('forces the expression between its nodes and reports its branch current', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 1.5',
      'b1 2 0 v=2*v(1)^2',
      'r1 2 0 1k',
      '.op',
    ));
    expect(result.dc!.voltage('2')).toBeCloseTo(4.5, 12);
    // ngspice branch current flows from n+ through the source to n-.
    expect(result.dc!.current('b1')).toBeCloseTo(-4.5e-3, 12);
  });

  it('solves a nonlinear loop where the expression reads its own node', async () => {
    // v(2) = 1 + 0.5*tanh(v(2)) through a 1 ohm resistor from a V= source.
    const result = await simulate(deck(
      'b1 1 0 v=1+0.5*tanh(v(2))',
      'r1 1 2 1',
      'r2 2 0 1meg',
      '.op',
    ));
    // v(2) = k*(1 + 0.5*tanh(v(2))) with the 1 ohm / 1 Mohm divider k.
    const k = 1e6 / (1e6 + 1);
    let v = 1;
    for (let i = 0; i < 100; i++) v -= (v - k * (1 + 0.5 * Math.tanh(v))) / (1 - k * 0.5 * (1 - Math.tanh(v) ** 2));
    expect(result.dc!.voltage('2')).toBeCloseTo(v, 9);
  });

  it('linearises V= sources with their derivatives for .ac', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 2 ac 1',
      'b1 2 0 v=v(1)^3',
      'r1 2 0 1k',
      '.ac dec 1 1k 1k',
    ));
    const [{ magnitude }] = result.ac!.voltage('2');
    expect(magnitude).toBeCloseTo(3 * 2 ** 2, 9);
  });

  it('clamps with max/min like the dcdc.sp error amplifier', async () => {
    const result = await simulate(deck(
      'vref ref 0 2.5',
      'vx x 0 dc 0',
      'b1 err 0 V = max(0,min(5,V(ref,x)*10k))',
      'r1 err 0 1k',
      '.dc vx 2.4995 2.5005 0.0005',
    ));
    const err = result.dcSweep!.voltage('err');
    // (2.5 - vx) * 10k clamped to [0, 5]: 5 at 2.4995, 0 from 2.5 on.
    expect(Array.from(err).map(value => Number(value.toFixed(9)))).toEqual([5, 0, 0]);
  });

  it('switches with comparisons, && and the ternary operator in transient analysis', async () => {
    const result = await simulate(deck(
      'vmains live 0 sin 0 250 50',
      'bcross cross 0 V=(V(live) > -2 && V(live) < 2) ? 5 : 0',
      'r1 cross 0 1k',
      '.tran 50u 20m',
    ));
    const { time } = result.transient!;
    const live = result.transient!.voltage('live');
    const cross = result.transient!.voltage('cross');
    for (let i = 0; i < time.length; i++) {
      expect(cross[i], `t=${time[i]}`).toBe(Math.abs(live[i]) < 2 ? 5 : 0);
    }
  });

  it('differentiates a ramp with ddt() like ddt-test1.cir', async () => {
    const result = await simulate(deck(
      'V1 1 0 dc 0 pulse 0 2 0 1 1 1 4',
      'B2 2 0 v = ddt(V(1))',
      '.tran 1m 3',
    ));
    const { time } = result.transient!;
    const ddt = result.transient!.voltage('2');
    expect(ddt[0]).toBe(0);
    // On the rising edge (slope 2 V/s) and on the flat top (slope 0), away
    // from the corners where the lagged difference catches up.
    const at = (t: number) => ddt[time.findIndex(point => point >= t)];
    expect(at(0.5)).toBeCloseTo(2, 6);
    expect(at(1.5)).toBeCloseTo(0, 6);
    expect(at(2.5)).toBeCloseTo(-2, 6);
  });

  it('applies tc1/tc2 against the circuit temperature like asrc-tc-1.cir', async () => {
    // asrc-tc-1.cir gold values at 127 C: 100 * (1 + 100*0.001).
    const result = await simulate(deck(
      'v1 1 0 dc=100 ac=1',
      'b2 2 0 i=v(1) tc1=0.001',
      'v2 0 2 0',
      'b3 3 0 v=v(1) tc1=0.001',
      '.op',
      '.step TEMP LIST 27 127',
    ), { stepWorkers: false });
    const [nominal, hot] = result.steps!;
    expect(nominal.dc!.current('v2')).toBeCloseTo(100, 9);
    expect(nominal.dc!.voltage('3')).toBeCloseTo(100, 9);
    expect(hot.dc!.current('v2')).toBeCloseTo(110, 9);
    expect(hot.dc!.voltage('3')).toBeCloseTo(110, 9);
  });

  it('honours temp=, dtemp=, tc2= and reciproctc= instance parameters', async () => {
    const result = await simulate(deck(
      'v1 1 0 dc 1',
      'b1 a 0 v=v(1) tc1=0.01 temp=37',
      'b2 b 0 v=v(1) tc1=0.01 tc2=0.001 dtemp=10',
      'b3 c 0 v=v(1) tc1=0.01 dtemp=10 reciproctc=1',
      'b4 d 0 v=temper',
      'ra a 0 1k',
      'rb b 0 1k',
      'rc c 0 1k',
      'rd d 0 1k',
      '.op',
    ));
    expect(result.dc!.voltage('a')).toBeCloseTo(1.1, 12);
    expect(result.dc!.voltage('b')).toBeCloseTo(1 + 0.1 + 0.1, 12);
    expect(result.dc!.voltage('c')).toBeCloseTo(1 / 1.1, 12);
    expect(result.dc!.voltage('d')).toBeCloseTo(27, 12);
  });

  it('substitutes .param names and quoted expressions in B expressions', async () => {
    const result = await simulate(deck(
      '.param a=0.2 c=5.7 deltat = 1n',
      'b1 1 0 v=a*c + \'deltat\'*1e9',
      'r1 1 0 1k',
      '.op',
    ));
    expect(result.dc!.voltage('1')).toBeCloseTo(0.2 * 5.7 + 1, 12);
  });

  it('evaluates time-dependent current pulses like set1.cir', async () => {
    const result = await simulate(deck(
      '.param alpha = 100p beta = 500p deltat = 1n',
      "Bset1 1 0 I = ternary_fcn(TIME < 'deltat', 0, 2.5m * (exp(-(TIME-'deltat')/'alpha')-exp(-(TIME-'deltat')/'beta')))",
      'R1 1 11 1',
      'Vmeas 11 0 0',
      '.tran 10p 3n',
    ));
    const { time } = result.transient!;
    const current = result.transient!.current('Vmeas');
    for (let i = 0; i < time.length; i++) {
      const t = time[i];
      const expected = t < 1e-9 ? 0 : 2.5e-3 * (Math.exp(-(t - 1e-9) / 1e-10) - Math.exp(-(t - 1e-9) / 5e-10));
      // The B source pushes its current into node 1, so it returns through Vmeas.
      expect(current[i], `t=${t}`).toBeCloseTo(-expected, 12);
    }
  });

  it('expands V= sources with {param} values inside subcircuits', async () => {
    const result = await simulate(deck(
      'x1 in out amp gain=3',
      'v1 in 0 dc 2',
      'r1 out 0 1k',
      '.subckt amp a y gain=1',
      'b1 y 0 V=v(a)*{gain} + gain',
      '.ends',
      '.op',
    ));
    expect(result.dc!.voltage('out')).toBeCloseTo(9, 12);
  });

  it('serialises V= cards and instance parameters back to an equivalent netlist', async () => {
    const circuit = parse(deck(
      'v1 1 0 dc 1.5',
      'b1 2 0 v=v(1) > 1 ? -v(1)^2 : 0 tc1=0.001 dtemp=100',
      'r1 2 0 1k',
      '.op',
    ));
    const netlist = circuit.toNetlist();
    expect(netlist.split('\n').find(line => line.startsWith('b1 '))).toBe(
      'b1 2 0 V=((v(1)>1)?(-(v(1)^2)):0) tc1=0.001 dtemp=100',
    );
    const reparsed = await simulate(netlist.replace('* spice-ts generated netlist', 'title'));
    expect(reparsed.dc!.voltage('2')).toBeCloseTo(-2.25 * 1.1, 12);
  });
});
