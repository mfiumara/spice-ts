import { describe, it, expect } from 'vitest';
import { fixGndName } from './gnd-alias.js';
import { simulate } from '../simulate.js';

// #772: ngspice-47 renames node `gnd` to ground in inp_fix_gnd_name
// (src/frontend/inpcom.c). Expected values are ngspice-47 -b runs of the same
// decks (Homebrew, macOS arm64); `listing` shows the rewritten cards.

describe('fixGndName follows ngspice-47 inp_fix_gnd_name (#772)', () => {
  it('replaces a delimited gnd after the first token, in any case', () => {
    expect(fixGndName('RG2 gnd in 1k')).toBe('RG2 0 in 1k');
    expect(fixGndName('RG GND 0 1k')).toBe('RG 0 0 1k');
    expect(fixGndName('R4 in Gnd\t1k')).toBe('R4 in 0\t1k');
  });

  it('accepts ( and , before and ) and , after, as in expressions', () => {
    // ngspice-47 listing: `b1 in 0 i= v(in, 0 ) * ...`, `ra ( 0 ) 0 1k`, `rq qq 0 ,1k`
    expect(fixGndName('B1 in 0 i=v(in,gnd)*1m')).toBe('B1 in 0 i=v(in,0)*1m');
    expect(fixGndName('Ra (gnd) 0 1k')).toBe('Ra (0) 0 1k');
    expect(fixGndName('Rq qq gnd,1k')).toBe('Rq qq 0,1k');
    expect(fixGndName('.print op v(gnd) v(qq)')).toBe('.print op v(0) v(qq)');
  });

  it('leaves the first token, a card-final gnd and gnd inside other names alone', () => {
    // ngspice-47 listing keeps `.subckt s3 a gnd` and `.global gnd`.
    expect(fixGndName('gnd 1 0 1k')).toBe('gnd 1 0 1k');
    expect(fixGndName('.subckt s3 a gnd')).toBe('.subckt s3 a gnd');
    expect(fixGndName('Rb gnd1 0 1k')).toBe('Rb gnd1 0 1k');
    expect(fixGndName('Rc in xgnd 1k')).toBe('Rc in xgnd 1k');
    expect(fixGndName('R1 a b {gnd}')).toBe('R1 a b {gnd}');
    expect(fixGndName('X1 a b sub r=gnd')).toBe('X1 a b sub r=gnd');
  });

  it('renames gnd in subcircuit headers and bodies when delimited', () => {
    expect(fixGndName('.subckt sub2 a gnd x')).toBe('.subckt sub2 a 0 x');
    expect(fixGndName('R7 gnd 0 1k')).toBe('R7 0 0 1k');
  });
});

describe('node gnd is ground like ngspice-47 (#772)', () => {
  it('runs the issue #772 deck as ngspice-47 does', async () => {
    // ngspice-47: nodes mid = 0.5 and in = 1 only, v1#branch = -1.5e-3.
    const result = await simulate(`gnd alias
V1 in 0 1
R1 in Mid 1k
R2 Mid 0 1k
RG2 gnd in 1k
RG GND 0 1k
.op
.end
`);
    const dc = result.dc!;
    expect([...dc.voltages.keys()].map(name => name.toLowerCase()).sort()).toEqual(['in', 'mid']);
    expect(dc.voltage('mid')).toBeCloseTo(0.5, 12);
    expect(dc.current('V1')).toBeCloseTo(-1.5e-3, 15);
  });

  it('renames gnd in continuation cards, B-source expressions and subcircuits', async () => {
    // ngspice-47: nodes in = 1 and qq = 0 only, v1#branch = -5.0e-3.
    // `.subckt s3 a gnd` keeps its card-final gnd (a global node, not ground),
    // while `Rz a gnd 1k` inside the body is renamed to ground.
    const result = await simulate(`gnd cont
V1 in 0 1
R1 in gnd
+ 1k
R2 in
+gnd 1k
.subckt s3 a gnd
Rz a gnd 1k
.ends
X3 in qq s3
Rq qq 0 1k
R4 in GND\t1k
B1 in 0 i=v(in,gnd)*1m
.op
.end
`);
    const dc = result.dc!;
    expect([...dc.voltages.keys()].map(name => name.toLowerCase()).sort()).toEqual(['in', 'qq']);
    expect(dc.voltage('qq')).toBe(0);
    expect(dc.current('V1')).toBeCloseTo(-5e-3, 15);
  });

  it('treats a card-final gnd subcircuit port as the global gnd node', async () => {
    // ngspice-47: nodes mid = 0.5 and in = 1 only, v1#branch = -1.25e-3.
    // `.subckt sub2 a gnd` keeps its card-final gnd, which `.global gnd`
    // makes a global node that overrides the port, so X2's pp is not a node.
    const result = await simulate(`gnd sub
V1 in 0 1
R1 in mid 1k
B1 mid gnd i=v(mid)/1k
X1 in Gnd sub
X2 in pp sub2
.subckt sub a b
R5 a b 2k
.ends
.subckt sub2 a gnd
R6 a gnd 4k
R7 gnd 0 1k
.ends
.op
.end
`);
    const dc = result.dc!;
    expect([...dc.voltages.keys()].map(name => name.toLowerCase()).sort()).toEqual(['in', 'mid']);
    expect(dc.voltage('mid')).toBeCloseTo(0.5, 12);
    expect(dc.current('V1')).toBeCloseTo(-1.25e-3, 15);
  });
});
