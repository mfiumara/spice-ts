import { describe, expect, it } from 'vitest';
import { ParseError } from '../errors.js';
import { simulate } from '../simulate.js';

// Issue #857: inside a `.subckt`, a `.param` card below the element that uses it.
// ngspice-47 inpcom.c inp_reorder_params_subckt moves every `.param` card of a
// subcircuit body to the top of that body, and inp_sort_params orders them by
// dependency, so position inside the body does not matter.
//
// ngspice-47 batch references (`ngspice -b`, same decks with a .control block):
//   issue deck (.param rloc=3k below R1):                    v(o) = 2.500000e-01
//   later params referencing even later params (a={b*3}, b={c}, c=1k): v(o) = 2.500000e-01
//   nested subckt using a param defined below in its parent: v(o) = 2.500000e-01
//   nested subckt local param below its use, parent below too: v(o) = 2.000000e-01
//   later local b=1k over top-level b=5k (a={b*3}):          v(o) = 2.500000e-01
//   multi-assignment card `.param a={b*3} b=1k` below R1:    v(o) = 2.500000e-01
//   r=1k above R1, r=3k below (last definition wins):        v(o) = 2.500000e-01
//   nested definition reads the enclosing instance's rp=3k X-line override: v(o) = 2.500000e-01

async function vo(lines: string[]): Promise<number> {
  const result = await simulate(lines.join('\n'));
  return result.dc!.voltage('o');
}

describe('subcircuit .param below its use (ngspice-47 inp_reorder_params_subckt, #857)', () => {
  it('evaluates a subckt .param that sits below the element using it (issue deck)', async () => {
    const deck = [
      'subckt param order',
      '.subckt rc in out gnd',
      'R1 in out {rloc}',
      'R2 out gnd 1k',
      '.param rloc=3k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('accepts the bare-name form of the issue deck', async () => {
    const deck = [
      'subckt param order bare',
      '.subckt rc in out gnd',
      'R1 in out rloc',
      'R2 out gnd 1k',
      '.param rloc=3k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('sorts subckt params by dependency when they reference later params', async () => {
    const deck = [
      'subckt param dependency order',
      '.subckt rc in out gnd',
      'R1 in out {a}',
      '.param a={b*3}',
      'R2 out gnd {c}',
      '.param b={c}',
      '.param c=1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('makes a parent param defined below a nested subckt visible inside it', async () => {
    const deck = [
      'nested subckt param order',
      '.subckt outer in out gnd',
      '.subckt inner a b',
      'R1 a b {rp}',
      '.ends inner',
      'X1 in out inner',
      'R2 out gnd 1k',
      '.param rp=3k',
      '.ends outer',
      'V1 in 0 1',
      'X1 in o 0 outer',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('orders local params of a nested subckt that depend on a later parent param', async () => {
    const deck = [
      'nested local param order',
      '.subckt outer in out gnd',
      'X1 in out inner',
      'R2 out gnd {rb}',
      '.subckt inner a b',
      'R1 a b {ra}',
      '.param ra={rb*4}',
      '.ends inner',
      '.param rb=1k',
      '.ends outer',
      'V1 in 0 1',
      'X1 in o 0 outer',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.2, 12);
  });

  it('uses the later local param over a top-level param of the same name', async () => {
    const deck = [
      'local param shadows top level',
      '.param b=5k',
      '.subckt rc in out gnd',
      'R1 in out {a}',
      'R2 out gnd 1k',
      '.param a={b*3}',
      '.param b=1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('orders the assignments of a multi-assignment .param card', async () => {
    const deck = [
      'multi assignment param card',
      '.subckt rc in out gnd',
      'R1 in out {a}',
      'R2 out gnd 1k',
      '.param a={b*3} b=1k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('gives a param defined twice its last definition', async () => {
    const deck = [
      'duplicate subckt param',
      '.subckt rc in out gnd',
      '.param r=1k',
      'R1 in out {r}',
      'R2 out gnd 1k',
      '.param r=3k',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  it('passes the enclosing instance parameter values into a nested definition', async () => {
    const deck = [
      'nested subckt instance params',
      '.subckt outer in out gnd rp=1k',
      '.subckt inner a b',
      'R1 a b {rq}',
      '.ends inner',
      'X1 in out inner',
      'R2 out gnd 1k',
      '.param rq={rp}',
      '.ends outer',
      'V1 in 0 1',
      'X1 in o 0 outer rp=3k',
      '.op',
      '.end',
    ];
    expect(await vo(deck)).toBeCloseTo(0.25, 12);
  });

  // ngspice-47 rejects both decks below at the defining card ("circular
  // parameter dependency", "Undefined parameter [zz]"); spice-ts reports them
  // as a ParseError at the deck line of that `.param` card, as at top level.
  async function failure(lines: string[]): Promise<ParseError> {
    const error = await simulate(lines.join('\n')).then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }

  it('reports a circular subckt .param dependency as a ParseError at the .param card', async () => {
    const error = await failure([
      'subckt param cycle',
      '.subckt rc in out gnd',
      'R1 in out {a}',
      'R2 out gnd 1k',
      '.param a={b} b={a}',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ]);
    expect(error.line).toBe(5);
    expect(error.context).toBe('.param a={b} b={a}');
    expect(error.message).toContain('Circular .param dependency: A -> B -> A');
  });

  it('reports an undefined name in a subckt .param as a ParseError at the .param card', async () => {
    const error = await failure([
      'subckt param undefined',
      '.subckt rc in out gnd',
      'R1 in out {a}',
      'R2 out gnd 1k',
      '* comment lines and blank lines keep deck line numbers',
      '',
      '.param a={zz*3}',
      '.ends rc',
      'V1 in 0 1',
      'X1 in o 0 rc',
      '.op',
      '.end',
    ]);
    expect(error.line).toBe(7);
    expect(error.context).toBe('.param a={zz*3}');
    expect(error.message).toContain("Undefined parameter 'zz'");
  });

  it('reports an undefined name in a nested subckt .param at its deck line', async () => {
    const error = await failure([
      'nested subckt param undefined',
      '.subckt outer in out gnd',
      '.subckt inner a b',
      'R1 a b {q}',
      '.param q={missing}',
      '.ends inner',
      'X1 in out inner',
      'R2 out gnd 1k',
      '.ends outer',
      'V1 in 0 1',
      'X1 in o 0 outer',
      '.op',
      '.end',
    ]);
    expect(error.line).toBe(5);
    expect(error.message).toContain("Undefined parameter 'missing'");
  });
});
