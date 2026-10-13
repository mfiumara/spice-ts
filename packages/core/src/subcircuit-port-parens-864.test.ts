import { describe, expect, it } from 'vitest';
import { simulate } from './simulate.js';
import { locateSubcircuitCall, parseSubcircuitHeader } from './parser/subcircuit-syntax.js';
import { tokenizeNetlist } from './parser/tokenizer.js';

// #864: ngspice-47 inpcom.c inp_fix_macro_param_func_paren_io rewrites
//   .subckt name (1 2 3) --> .subckt name 1 2 3
//   x1 (1 2 3) name      --> x1 1 2 3 name
// before subcircuit expansion. spice-ts kept `(in` and `vee)` as port names,
// so those ports became floating internal nodes (VACASK bjtring: every BJT
// emitter floated and the ring oscillator never started).

describe('parenthesised subcircuit port lists (#864)', () => {
  it('drops the parentheses around .subckt ports, keeping params', () => {
    expect(parseSubcircuitHeader('.subckt invcell (in out vcc vee) params: r=0.5k c=0.5n')).toEqual({
      name: 'invcell',
      ports: ['in', 'out', 'vcc', 'vee'],
      params: { R: 500, C: 0.5e-9 },
    });
    expect(parseSubcircuitHeader('.subckt div ( a b )').ports).toEqual(['a', 'b']);
    // Parentheses that do not open the port list are not rewritten (ngspice-47
    // only checks the character right after the subcircuit name).
    expect(parseSubcircuitHeader('.subckt div a b').ports).toEqual(['a', 'b']);
  });

  it('drops the parentheses around X-card ports', () => {
    const [line] = tokenizeNetlist('x1 (9 1 vcc 0) invcell r=1k');
    const call = locateSubcircuitCall(line.tokens);
    expect(line.tokens[call.nameIndex]).toBe('invcell');
    expect(call.ports).toEqual(['9', '1', 'vcc', '0']);
    const [plain] = tokenizeNetlist('x1 9 1 vcc 0 invcell params: r=1k');
    expect(locateSubcircuitCall(plain.tokens).ports).toEqual(['9', '1', 'vcc', '0']);
  });

  it('connects parenthesised ports at top level and in nested bodies (ngspice-47 -b values)', async () => {
    const netlist = [
      'parenthesised subckt ports',
      'V1 1 0 3',
      'X1 1 m 0 div',
      'X2 (1 n 0) div2',
      '.subckt div (a mid b) params: r=1k',
      'R1 a mid {r}',
      'R2 mid b 2k',
      '.ends',
      '.subckt div2 a mid b',
      'X1 (a mid b) div r=2k',
      '.ends',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    // ngspice-47 -b: m = 2, n = 1.5, v1#branch = -1.75e-3
    expect(result.dc!.voltage('m')).toBeCloseTo(2, 12);
    expect(result.dc!.voltage('n')).toBeCloseTo(1.5, 12);
    expect(result.dc!.current('V1')).toBeCloseTo(-1.75e-3, 15);
  });

  it('grounds a BJT emitter through a parenthesised vee port (ngspice-47 -b values)', async () => {
    const netlist = [
      'bjt inverter with parenthesised ports',
      '.model t2n2222 npn is=19f bf=150 vaf=100',
      '.subckt inv (in out vcc vee)',
      'q1 out b vee t2n2222',
      'rb in b 10k',
      'rc vcc out 1k',
      '.ends',
      'vcc vcc 0 5',
      'vin 1 0 2',
      'x1 1 2 vcc 0 inv',
      '.op',
      '.end',
    ].join('\n');
    const result = await simulate(netlist);
    // Agreement to Newton convergence (abstol/vntol), not bit-exact.
    // ngspice-47 -b: v(2) = 1.023907878105266e-01, x1.b = 6.807690118025328e-01,
    // vcc#branch = -4.89760921218947e-03
    expect(result.dc!.voltage('2')).toBeCloseTo(1.023907878105266e-1, 7);
    expect(result.dc!.voltage('x1.b')).toBeCloseTo(6.807690118025328e-1, 7);
    expect(result.dc!.current('vcc')).toBeCloseTo(-4.89760921218947e-3, 10);
  });
});
