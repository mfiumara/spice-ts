import { describe, expect, it } from 'vitest';
import { simulate } from '../simulate.js';
import { preprocess } from './preprocessor.js';
import { ParseError } from '../errors.js';

/**
 * #496: ngspice numparam `.func`, `.csparam`, `.if/.elseif/.else/.endif`.
 *
 * The deck is built from card lines of the corpus-f ngspice decks named in
 * #496 (func_cap.sp, if-elseif.cir, v-i-sources-am-ffm.cir, loop-param.cir,
 * repeat_loop_seegen.net, memristor.sp), with their .control blocks replaced
 * by `.op`. The memristor threshold function f1 (Vt = 0.5 so it conducts) is
 * called from a B-source with v() arguments; a subcircuit keeps a scoped
 * `.func` that reads a subcircuit parameter and is defined after its use.
 * (Quoted B-source expressions with v() and the `.subckt ... PARAMS:` keyword,
 * #615, are separate gaps, so the memristor subcircuit is not copied verbatim.)
 * Expected values are the ngspice-47 operating point of
 * this identical deck:
 *   HOME=<tmp with .spiceinit "set filetype=ascii"> ngspice -b -r derived.raw derived.cir
 */
const DECK = `derived deck: numparam lines from corpus-f fixtures in issue #496
.func icap_calc(A,B,C,D) '2*A*sqrt(B*C*D)'
.param cap_val = 'max(icap_calc(1,2,3,4))'
.param select = 3
.param select2 = 3
.param is = 0
.csparam start = {cap_val}
.csparam let = 'select'
V1 1 0 1
.if (select == 1)
    R1 1 0 1
.elseif (select == 2)
    R1 1 0 10
.elseif (select == 3)
    .if (select2 == 1)
        R1 1 0 100
    .elseif (select2 = 2)
        R1 1 0 200
    .elseif (select2 = 3) $ <----- selected
        R1 1 0 300
    .else
        R1 1 0 400
    .endif
.elseif (select == 4)
    R1 1 0 1000
.else
    R1 1 0 10000
.endif
.if (is)
I1 0 2 1m
.else
V2 2 0 2
.endif
R2 2 0 1k
Vc 3 0 'cap_val'
R3 3 0 1k
.param alpha = 0 beta = 2 Vt = 0.5
.func f1(y)={beta*y+0.5*(alpha-beta)*(abs(y+Vt)-abs(y-Vt))}
Bx 0 4 I=f1(V(4))*1m
.subckt fsub plus minus scale=1k
Rmem plus minus r={f2(3)}
.func f2(z) = 'z*scale'
.ends
Xf 4 0 fsub
V4 5 0 2
R4 5 4 1k
.op
.end
`;

// ngspice-47 operating point of DECK.
const NGSPICE_VOLTAGES: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 9.797958971132713e+00,
  '4': -4.499999999999999e+00,
  '5': 2,
};
const NGSPICE_CURRENTS: Record<string, number> = {
  V4: -6.499999999999999e-03,
  Vc: -9.797958971132713e-03,
  V2: -2.000000000000000e-03,
  V1: -3.333333333333334e-03,
};

describe('numparam .func/.csparam/.if against ngspice-47 (#496)', () => {
  it('matches the ngspice operating point of the derived corpus-f deck', async () => {
    const result = await simulate(DECK);
    const op = result.dc!;
    for (const [node, expected] of Object.entries(NGSPICE_VOLTAGES)) {
      expect(op.voltage(node), `v(${node})`).toBeCloseTo(expected, 9);
    }
    for (const [source, expected] of Object.entries(NGSPICE_CURRENTS)) {
      expect(op.current(source), `i(${source})`).toBeCloseTo(expected, 12);
    }
  });
});

async function preprocessError(netlist: string): Promise<ParseError> {
  try {
    await preprocess(netlist);
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error('expected a ParseError');
}

describe('numparam .func', () => {
  it('expands nested user functions and keeps the line count', async () => {
    const out = await preprocess(".func sq(x) 'x*x'\n.func hyp(a, b) {sqrt(sq(a)+sq(b))}\nR1 1 0 {hyp(3,4)}\n.op");
    expect(out.split('\n')).toEqual(['', '', 'R1 1 0 5', '.op']);
  });

  it('accepts a whitespace-separated argument list', async () => {
    const out = await preprocess(".func f ( A B ) 'A-B'\nR1 1 0 {f(5,2)}");
    expect(out.split('\n')[1]).toBe('R1 1 0 3');
  });

  it('reports an argument-count mismatch at the calling card', async () => {
    const error = await preprocessError(".func f(a,b) 'a+b'\nR1 1 0 {f(1)}");
    expect(error.message).toContain("'f' expects 2 arguments, got 1");
    expect(error.line).toBe(2);
  });

  it('rejects recursive functions', async () => {
    const error = await preprocessError(".func f(a) 'f(a)'\nR1 1 0 {f(1)}");
    expect(error.message).toContain('recursion');
  });

  it('rejects a malformed .func card', async () => {
    const error = await preprocessError('.func f 1');
    expect(error.message).toContain('.func');
    expect(error.line).toBe(1);
  });

  it('keeps subcircuit functions local to their subcircuit', async () => {
    const error = await preprocessError('.subckt s a b\n.func g(x) {x}\nR1 a b {g(1)}\n.ends\nR2 1 0 {g(1)}');
    expect(error.message).toContain('Unknown function');
  });
});

describe('numparam .csparam', () => {
  it('is evaluated and removed from the deck', async () => {
    const out = await preprocess('.param p = 2\n.csparam start = {p*3}\nR1 1 0 1');
    expect(out.split('\n')).toEqual(['', '', 'R1 1 0 1']);
  });

  it('reports an undefined parameter at the .csparam card', async () => {
    const error = await preprocessError('R1 1 0 1\n.csparam start = {missing}');
    expect(error.message).toContain("Undefined parameter 'missing'");
    expect(error.line).toBe(2);
  });
});

describe('numparam .if/.elseif/.else/.endif', () => {
  it('evaluates conditions against .param values defined before the .if', async () => {
    const out = await preprocess('.param a = 2\n.if (a > 1)\nR1 1 0 1\n.else\nR1 1 0 2\n.endif');
    expect(out.split('\n').map(line => line.trim())).toEqual(['', '', 'R1 1 0 1', '', '', '']);
  });

  it('takes .param definitions only from the selected branch', async () => {
    const out = await preprocess('.if (0)\n.param r = 1\n.else\n.param r = 2\n.endif\nR1 1 0 {r}');
    expect(out.split('\n')[5]).toBe('R1 1 0 2');
  });

  it('rejects an unterminated .if', async () => {
    const error = await preprocessError('.if (1)\nR1 1 0 1');
    expect(error.message).toContain('missing .endif');
    expect(error.line).toBe(1);
  });

  it('rejects .else/.elseif/.endif without .if', async () => {
    expect((await preprocessError('.endif')).message).toContain("'.endif' without a matching '.if'");
    expect((await preprocessError('.if (1)\n.else\n.elseif (1)\n.endif')).message).toContain("'.elseif' after '.else'");
  });

  it('rejects .if inside a subcircuit explicitly', async () => {
    const error = await preprocessError('.subckt s a b\n.if (1)\nR1 a b 1\n.endif\n.ends');
    expect(error.message).toContain('.if inside .subckt');
    expect(error.line).toBe(2);
  });
});
