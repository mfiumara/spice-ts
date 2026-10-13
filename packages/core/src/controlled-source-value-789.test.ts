import { describe, expect, it } from 'vitest';
import { ParseError } from './errors.js';
import { simulate } from './simulate.js';

// #789: SpiceSharpParser example01 decks (corpus-h, MIT) crashed simulate()
// with a raw `TypeError: Cannot read properties of undefined (reading
// 'startsWith')`: the subcircuit E/G cards use ngspice's behavioural
// `value={expr}` form, which the expander read as a linear gain at token 5.
// ngspice-47 (inpcom.c inp_compat) runs these cards as ASRCs.

const SUBCKT_BODY = [
  '.param D0 = {2*a0*b0/(a0+b0)}',
  '.param F1 = {(rout-rin)*a0*(rout+rin)/(r2+r1)}',
  '.param F0 = {(r2-r1)*a0}',
  '.param fraction = {F0/F1}',
  '.func \tQ(m) {m/ro}',
  '.func  \tvel(m) {Q(m)/(a0*b0)}',
  '.func \tR(x) {x*D0/v}',
  '*Changed function',
  '.func xi(x) {40*pow(R(x),-0.9) + 90*pow(fraction,-0.003)-80}',
  'Vmas m_in msx {0}',
  'Rmas msx msy 1e-6',
  '*The pressure drop:',
  'Exm msy m_out value={xi(V(v_vel))*ro*V(v_vel)*V(v_vel)/2}',
  'Hmss mss 0 Vmas 1',
  '*Velocity:',
  'Guv 0 v_vel value={vel(V(mss))}',
  'Ruv 0 v_vel 1',
];

const TOP_PARAMS = [
  '.param a0_entry={0.1}',
  '.param b0_entry={0.01}',
  '.param density={850}',
  '.param viscosity={0.000006}',
  '.param rout_entry={0.9}',
  '.param rin_entry={0.8}',
  '.param r1_entry1={0.8}',
  '.param r2_entry1={0.81}',
  '.param r1_entry2={0.89}',
  '.param r2_entry2={0.9}',
  '.param FlowRate={0.025}',
];

// example01_stringwriter.cir (body whitespace as in example01.cir).
const STRINGWRITER = [
  'Example 01',
  '',
  ...TOP_PARAMS,
  '',
  'I_M 0 N1 {FlowRate}',
  '',
  'X_entry1 N1 0 N2 entry params: a0={a0_entry}, b0={b0_entry}, ro={density}, v={viscosity}, rout={rout_entry}, rin={rin_entry}, r1={r1_entry1}, r2={r2_entry1}',
  '',
  'X_entry2 N1 0 N3 entry params: a0={a0_entry}, b0={b0_entry}, ro={density}, v={viscosity}, rout={rout_entry}, rin={rin_entry}, r1={r1_entry2}, r2={r2_entry2}',
  '',
  '.SUBCKT entry m_in m_out v_vel params: a0={1}, b0={1}, ro={1}, v={1}, rout={1}, rin={1}, r1={1}, r2={1}',
  ...SUBCKT_BODY,
  '.ENDS entry',
  '',
  '.OP',
  '.SAVE V(N1) V(N2) V(N3)',
  '.END',
].join('\n');

// example01_without_params.cir: the parameters are subcircuit defaults.
const WITHOUT_PARAMS = [
  'Example 01',
  '',
  ...TOP_PARAMS.map(line => line.replace(/=\{(.*)\}$/, ' =$1')),
  '',
  'I_M 0 N1 {FlowRate}',
  '',
  'X_entry1   N1 0 N2 entry',
  'X_entry2   N1 0 N3 entry2 ',
  '',
  '.subckt entry m_in m_out v_vel params: a0={a0_entry}, b0={b0_entry}, ro={density}, v={viscosity}, rout={rout_entry},',
  '+rin={rin_entry},r1={r1_entry1},r2={r2_entry1}',
  ...SUBCKT_BODY,
  '.ends',
  '',
  '.subckt entry2 m_in m_out v_vel params: a0={a0_entry}, b0={b0_entry}, ro={density}, v={viscosity}, rout={rout_entry},',
  '+rin={rin_entry},r1={r1_entry2},r2={r2_entry2}',
  ...SUBCKT_BODY,
  '.ends',
  '',
  '.OP',
  '.SAVE V(N1) V(N2) V(N3)',
  '.end',
].join('\n');

// ngspice-47 `-b -r` (ASCII rawfile) on the unchanged corpus-h fixtures.
const NGSPICE_47 = { N1: 1.097091951232882, N2: 1.469654594025957e-2, N3: 1.471521876562279e-2 };

function expectNgspice(voltage: (node: string) => number): void {
  for (const [node, expected] of Object.entries(NGSPICE_47)) {
    expect(Math.abs(voltage(node) - expected) / Math.abs(expected), node).toBeLessThan(1e-6);
  }
}

async function caught(netlist: string): Promise<unknown> {
  try {
    await simulate(netlist);
  } catch (error) {
    return error;
  }
  throw new Error('expected simulate() to reject');
}

describe('E/G value={expr} cards (#789)', () => {
  it('runs SpiceSharpParser example01_stringwriter at ngspice-47 parity', async () => {
    const result = await simulate(STRINGWRITER);
    expectNgspice(node => result.dc!.voltage(node));
  });

  it('runs SpiceSharpParser example01_without_params at ngspice-47 parity', async () => {
    const result = await simulate(WITHOUT_PARAMS);
    expectNgspice(node => result.dc!.voltage(node));
  });

  it('runs top-level E/G value= cards as ngspice ASRCs', async () => {
    const result = await simulate([
      'top-level behavioural E and G',
      'V1 a 0 2',
      'R1 a 0 1k',
      "E1 b 0 value={V(a)*3}",
      'R2 b 0 1k',
      "G1 0 c VALUE = 'pow(V(a),2)*1m'",
      'R3 c 0 1k',
      'E2 d 0 vol={V(a)+1}',
      'R4 d 0 1k',
      'G2 0 e cur={V(a)*1m}',
      'R5 e 0 1k',
      '.op',
      '.end',
    ].join('\n'));
    expect(result.dc!.voltage('b')).toBeCloseTo(6, 9);
    expect(result.dc!.voltage('c')).toBeCloseTo(4, 9);
    expect(result.dc!.voltage('d')).toBeCloseTo(3, 9);
    expect(result.dc!.voltage('e')).toBeCloseTo(2, 9);
  });
});

describe('malformed controlled-source cards fail with a structured ParseError (#789)', () => {
  const cards = ['E1 b 0 a', 'G1 b 0 a', 'H1 b 0', 'F1 b 0'];

  for (const card of cards) {
    it(`rejects '${card}' at the top level`, async () => {
      const error = await caught(`t\nV1 a 0 2\nR1 a 0 1k\n${card}\nR2 b 0 1k\n.op\n.end`);
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain(card.split(' ')[0]);
      expect((error as Error).message).not.toMatch(/Cannot read properties/);
    });

    it(`rejects '${card}' inside a subcircuit`, async () => {
      const error = await caught(
        `t\nV1 a 0 2\nR1 a 0 1k\nX1 a b s\nR2 b 0 1k\n.subckt s a b\n${card}\n.ends\n.op\n.end`,
      );
      expect(error).toBeInstanceOf(ParseError);
      expect((error as Error).message).toContain(card.split(' ')[0]);
      expect((error as Error).message).not.toMatch(/Cannot read properties/);
    });
  }

  it('runs the POLY form as its polynomial instead of reading it as a gain (#845)', async () => {
    const result = await simulate('t\nV1 a 0 2\nR1 a 0 1k\nE1 b 0 poly(1) a 0 0 1\nR2 b 0 1k\n.op\n.end');
    expect(result.dc!.voltage('b')).toBeCloseTo(2, 12);
  });
});
