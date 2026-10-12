import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { braceBareParameters } from './numparam.js';

// Issue #837 (corpus-i VACASK test/spice_subckt.cir): a bare `.param` or subcircuit
// parameter name as the value of an R, C or L card. ngspice-47 inpcom.c inp_quote_params
// ("auto braces") wraps every isolated parameter name after the nodes of an element card
// in braces before numparam runs, so `R1 in o rv` is `R1 in o {rv}`. The parameter wins
// over a `.model` of the same name, because the card no longer names the model.
//
// ngspice-47 batch references (`ngspice -b`, decks below with a .control block):
//   R top level:                    v(o) = 2.500000e-01, warning only (can't find model 'rv')
//   R in .subckt, X override 3k:    v(o) = 2.500000e-01
//   C top level, v(o) at 1 ms:      vt = 6.321234e-01  (tran 10u 1m)
//   L top level, v(o) at 1 us:      vt = 3.680650e-01  (tran 10n 2u)
//   .model rv R(rsh=1), R1 in o rv l=1k w=1 (model alone gives 1k, v(o)=0.5): v(o) = 2.500000e-01
//   .model rv R(tc1=0.01), .options temp=127: v(o) = 2.500000e-01 (with `R1 in o rv r=3k` and no
//   .param, the model applies: v(o) = 1.428571e-01)
//   .model cval C(cj=2), C1 o 0 cval l=1m w=1m: vt = 6.321234e-01 (model alone, 2 uF: vt = 3.934698e-01)
//   subckt default on a `+` header line, subckt-local .param (before or after use), top-level .param in a
//   subckt body: v(o) = 2.500000e-01 each
//   R1 in o rv 2k (rv=3k): v(o) = 3.333333e-01; the braced value is followed by an unlabeled
//   number, which inp2r.c/INPdevParse take as the resistance ("waslead"), so R1 = 2k

const DIVIDER_TAIL = ['V1 in 0 1', 'R2 o 0 1k', '.op', '.end'];

async function vo(lines: string[]): Promise<number> {
  const result = await simulate(lines.join('\n'));
  return result.dc!.voltage('o');
}

async function finalVo(deck: string[]): Promise<number> {
  const result = await simulate(deck.join('\n'));
  const v = result.transient!.voltage('o');
  return v[v.length - 1];
}

describe('bare parameter names as R/C/L values (ngspice-47 auto braces, #837)', () => {
  it('substitutes a top-level .param as a resistance', async () => {
    expect(await vo(['bare param R', '.param rv=3k', 'R1 in o rv', ...DIVIDER_TAIL])).toBeCloseTo(0.25, 12);
  });

  it('substitutes a subcircuit parameter with an X-line override', async () => {
    const deck = [
      'bare param R in subckt',
      '.subckt rc in out gnd rval=1k',
      'R1 in out rval',
      'R2 out gnd 1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc rval=3k',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('uses the subcircuit default when the X line does not override it', async () => {
    const deck = [
      'bare param R subckt default',
      '.subckt rc in out gnd',
      '+ rval=3k',
      'R1 in out rval',
      'R2 out gnd 1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  // A subcircuit .param used above its definition (ngspice also gives 0.25) is a separate
  // subcircuit-expansion gap: `R1 in out {rloc}` above `.param rloc=3k` fails the same way.
  it('substitutes a .param defined inside the subcircuit body', async () => {
    const deck = [
      'bare param R subckt .param',
      '.subckt rc in out gnd',
      '.param rloc=3k',
      'R1 in out rloc',
      'R2 out gnd 1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('substitutes a top-level .param inside a subcircuit body', async () => {
    const deck = [
      'bare top-level param in subckt',
      '.param rtop=3k',
      '.subckt rc in out gnd',
      'R1 in out rtop',
      'R2 out gnd 1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('substitutes a .param as a capacitance', async () => {
    const deck = [
      'bare param C',
      '.param cval=1u',
      'V1 in 0 pulse(0 1 0 1n 1n 1 2)',
      'R1 in o 1k',
      'C1 o 0 cval',
      '.tran 10u 1m',
      '.end',
    ];
    expect(await finalVo(deck)).toBeCloseTo(0.6321234, 3);
  });

  it('substitutes a .param as an inductance', async () => {
    const deck = [
      'bare param L',
      '.param lval=1m',
      'V1 in 0 pulse(0 1 0 1n 1n 1 2)',
      'R1 in o 1k',
      'L1 o 0 lval',
      '.tran 10n 1u',
      '.end',
    ];
    expect(await finalVo(deck)).toBeCloseTo(0.368065, 3);
  });

  it('lets the parameter win over a resistor .model of the same name (rsh, l/w)', async () => {
    expect(await vo([
      'precedence rsh', '.param rv=3k', '.model rv R(rsh=1)', 'R1 in o rv l=1k w=1', ...DIVIDER_TAIL,
    ])).toBeCloseTo(0.25, 12);
  });

  it('lets the parameter win over a resistor .model of the same name (tc1 at 127 C)', async () => {
    expect(await vo([
      'precedence tc1', '.param rv=3k', '.model rv R(tc1=0.01)', '.options temp=127',
      'V1 in 0 1', 'R1 in o rv', 'R2 o 0 1k tc1=0', '.op', '.end',
    ])).toBeCloseTo(0.25, 12);
  });

  it('lets the parameter win over a capacitor .model of the same name', async () => {
    const deck = [
      'precedence C',
      '.param cval=1u',
      '.model cval C(cj=2)',
      'V1 in 0 pulse(0 1 0 1n 1n 1 2)',
      'R1 in o 1k',
      'C1 o 0 cval l=1m w=1m',
      '.tran 10u 1m',
      '.end',
    ];
    expect(await finalVo(deck)).toBeCloseTo(0.6321234, 3);
  });

  it('takes an unlabeled number after the substituted value as the resistance, like inp2r.c', async () => {
    expect(await vo(['param then number', '.param rv=3k', 'R1 in o rv 2k', ...DIVIDER_TAIL])).toBeCloseTo(1 / 3, 12);
  });

  it('still reports a name that is neither a model nor a parameter', async () => {
    await expect(simulate(['undefined', 'V1 in 0 1', 'R1 in o zz', 'R2 o 0 1k', '.op', '.end'].join('\n')))
      .rejects.toThrow(/zz/);
  });
});

describe('braceBareParameters (inp_quote_params rule)', () => {
  const top = new Set(['RV', 'CV', 'VINIT', 'IN']);

  it('braces isolated names after the nodes only, on R/C/L cards', () => {
    expect(braceBareParameters([
      { text: 'R1 in o RV' },
      { text: 'C1 in 0 cv ic=vinit ; cv comment' },
      { text: 'V1 in 0 rv' },
      { text: 'R2 in o {rv*2} rv' },
      { text: 'R3 in o 1k tc1=rvx' },
      { text: 'L1 in' },
      { text: '+ 0 cv' },
      { text: 'print rv', control: true },
    ], top)).toEqual([
      'R1 in o {RV}',
      'C1 in 0 {cv} ic={vinit} ; cv comment',
      'V1 in 0 rv',
      'R2 in o {rv*2} {rv}',
      'R3 in o 1k tc1=rvx',
      'L1 in',
      '+ 0 {cv}',
      'print rv',
    ]);
  });

  it('scopes subcircuit header and body .param names to their definition', () => {
    expect(braceBareParameters([
      { text: '.subckt a p q w=1' },
      { text: '+ z=2' },
      { text: 'R1 p q w' },
      { text: 'R2 p q z' },
      { text: 'R3 p q loc' },
      { text: '.param loc=3' },
      { text: '.ends a' },
      { text: 'R4 1 0 w' },
      { text: 'R5 1 0 rv' },
    ], top)).toEqual([
      '.subckt a p q w=1',
      '+ z=2',
      'R1 p q {w}',
      'R2 p q {z}',
      'R3 p q {loc}',
      '.param loc=3',
      '.ends a',
      'R4 1 0 w',
      'R5 1 0 {rv}',
    ]);
  });
});
